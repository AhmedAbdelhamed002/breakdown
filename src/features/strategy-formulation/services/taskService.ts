import { Hx_tasksesService } from "@generated/services/Hx_tasksesService";
import type { Hx_tasksesBase } from "@generated/models/Hx_tasksesModel";
import { SystemusersService } from "@generated/services/SystemusersService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { resolveCurrentUserId } from "@infrastructure/authentication/currentUser";
import { toExecTask, type ExecTask, type ExecTaskDraft } from "../models/execTask";
import { orFilter } from "../utils/odataFilters";

function uniqueIds(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((id): id is string => !!id)));
}

/**
 * The Code Apps data connection doesn't populate hx_tasks's own lookup-name shadow columns either
 * (hx_assigneename/tms_directmanagerlkupname/project_followupname/hx_raisedbyname/tms_taskcreatorname
 * come back empty even though the lookups are set — same finding as pocService.ts's enrichPocs) — so
 * names are resolved here with one batched systemusers query instead of trusted from the row.
 */
async function enrichExecTasks(tasks: ExecTask[]): Promise<ExecTask[]> {
  const userIds = uniqueIds([
    ...tasks.map((t) => t.assigneeId),
    ...tasks.map((t) => t.directManagerId),
    ...tasks.map((t) => t.followUpId),
    ...tasks.map((t) => t.raisedById),
    ...tasks.map((t) => t.taskCreatorId),
  ]);
  if (!userIds.length) return tasks;
  const users = resultOrThrow(await SystemusersService.getAll({ filter: orFilter("systemuserid", userIds) }), "List users for tasks");
  const nameById = new Map(users.map((u) => [u.systemuserid, u.fullname ?? u.domainname]));
  return tasks.map((t) => ({
    ...t,
    assigneeName: (t.assigneeId && nameById.get(t.assigneeId)) || t.assigneeName,
    directManagerName: (t.directManagerId && nameById.get(t.directManagerId)) || t.directManagerName,
    followUpName: (t.followUpId && nameById.get(t.followUpId)) || t.followUpName,
    raisedByName: (t.raisedById && nameById.get(t.raisedById)) || t.raisedByName,
    taskCreatorName: (t.taskCreatorId && nameById.get(t.taskCreatorId)) || t.taskCreatorName,
  }));
}

const TASK_SOURCE_STRATEGY = 989230005;
/** Tasks created from Execution & Monitoring's Execution (plan) tab — see TaskFormDialog. */
export const TASK_SOURCE_PLANNING_MONITORING = 989230004;
const PRIORITY_HIGH = 123200002;
const STATUS_NEW = 123200004;

export interface CreateTaskFromItemInput extends ExecTaskDraft {
  kind: "Tactic" | "Poc";
  itemId: string;
  kpiId?: string;
  processId?: string;
  /** The KPI's pm_kpiachievment row for the current BU/month/year (BreakdownService.getAnchor's
   * own achievementId) — links pm_kpiachievement when one exists for this KPI/period. */
  kpiAchievementId?: string;
  /** Set to create this as a subtask of an existing task (hx_TaskParent) — the subtask still carries
   * the same source POC/Tactic link as its parent (see listTasksForItem's own note on why). */
  parentTaskId?: string;
  /** cr18c_tasksource — defaults to Strategy (Strategy Execution's own TaskBreakdownDialog); pass
   * TASK_SOURCE_PLANNING_MONITORING for tasks created from Execution & Monitoring instead. */
  taskSource?: number;
  /** hx_priority — defaults to High (Strategy Execution's own TaskBreakdownDialog doesn't expose a
   * picker); Execution & Monitoring's TaskFormDialog lets the user choose. */
  priority?: number;
}

/** The single task-creation entry point — always fixes Priority/Status and links back to the Tactic/POC
 * it was broken down from (spec addendum item 22). Source defaults per caller (see taskSource); the
 * creator (tms_TaskCreator) is always the signed-in user — set here, not exposed on either form. */
export async function createExecTask(input: CreateTaskFromItemInput): Promise<ExecTask> {
  const taskCreatorId = await resolveCurrentUserId();
  const payload: Omit<Hx_tasksesBase, "hx_tasksid"> = {
    statecode: 0,
    hx_tasktitle: input.title,
    hx_taskdescription: input.description,
    cr603_posturl: input.postUrl,
    cr18c_tasksource: (input.taskSource ?? TASK_SOURCE_STRATEGY) as Hx_tasksesBase["cr18c_tasksource"],
    hx_priority: (input.priority ?? PRIORITY_HIGH) as Hx_tasksesBase["hx_priority"],
    hx_status: STATUS_NEW as Hx_tasksesBase["hx_status"],
    hx_startdate: input.startDate,
    hx_duedate: input.dueDate,
    "hx_Assignee@odata.bind": bindRef("user", input.assigneeId),
    "tms_DirectManagerLkup@odata.bind": bindRef("user", input.directManagerId),
    "project_FollowUp@odata.bind": bindRef("user", input.followUpId),
    "hx_RaisedBy@odata.bind": bindRef("user", input.raisedById),
  };
  if (taskCreatorId) payload["tms_TaskCreator@odata.bind"] = bindRef("user", taskCreatorId);
  if (input.kind === "Tactic") payload["stf_SourceTactic@odata.bind"] = bindRef("strategyTactic", input.itemId);
  else payload["stf_SourcePOC@odata.bind"] = bindRef("strategyPoc", input.itemId);
  if (input.kpiId) payload["objectiv_MainDepartmentKPI@odata.bind"] = bindRef("kpi", input.kpiId);
  if (input.processId) payload["objectiv_Process@odata.bind"] = bindRef("process", input.processId);
  if (input.kpiAchievementId) {
    payload["pm_KPIAchievement@odata.bind"] = bindRef("kpiAchievement", input.kpiAchievementId);
  }
  if (input.parentTaskId) payload["hx_TaskParent@odata.bind"] = bindRef("task", input.parentTaskId);

  const row = resultOrThrow(await Hx_tasksesService.create(payload), "Create task");
  return toExecTask(row);
}

export interface UpdateTaskInput {
  title: string;
  description?: string;
  postUrl?: string;
  status: number;
  priority?: number;
  startDate: string;
  dueDate: string;
  assigneeId: string;
  directManagerId: string;
  followUpId?: string;
  raisedById: string;
}

/** Every lookup is re-sent unconditionally — the SDK exposes no unbind primitive to clear one, so an already-set lookup can't be cleared from this editor (only reassigned). */
export async function updateExecTask(id: string, input: UpdateTaskInput): Promise<ExecTask> {
  const payload: Partial<Omit<Hx_tasksesBase, "hx_tasksid">> = {
    hx_tasktitle: input.title,
    hx_taskdescription: input.description,
    cr603_posturl: input.postUrl,
    hx_status: input.status as Hx_tasksesBase["hx_status"],
    hx_priority: input.priority as Hx_tasksesBase["hx_priority"],
    hx_startdate: input.startDate,
    hx_duedate: input.dueDate,
    "hx_Assignee@odata.bind": bindRef("user", input.assigneeId),
    "tms_DirectManagerLkup@odata.bind": bindRef("user", input.directManagerId),
    "hx_RaisedBy@odata.bind": bindRef("user", input.raisedById),
  };
  if (input.followUpId) payload["project_FollowUp@odata.bind"] = bindRef("user", input.followUpId);
  const row = resultOrThrow(await Hx_tasksesService.update(id, payload), "Update task");
  return toExecTask(row);
}

/** Only tasks this module created (or that carry one of these back-links) are ever visible here (spec addendum §1.1). */
export async function listSourcedTasks(): Promise<ExecTask[]> {
  const rows = resultOrThrow(
    await Hx_tasksesService.getAll({ filter: "_stf_sourcetactic_value ne null or _stf_sourcepoc_value ne null" }),
    "List execution tasks"
  );
  return rows.map(toExecTask);
}

/** Every task AND subtask for one POC/Tactic, server-filtered by its own source link (unlike
 * listSourcedTasks's org-wide client-side filtering) — a subtask carries the same source link as its
 * parent (see CreateTaskFromItemInput's own note), so this one query covers both tree levels; the
 * caller groups the flat result by parentTaskId to build the tree. */
export async function listTasksForItem(kind: "Tactic" | "Poc", itemId: string): Promise<ExecTask[]> {
  if (!itemId) return [];
  const filter = kind === "Tactic" ? `_stf_sourcetactic_value eq '${itemId}'` : `_stf_sourcepoc_value eq '${itemId}'`;
  const rows = resultOrThrow(await Hx_tasksesService.getAll({ filter }), "List tasks for item");
  return enrichExecTasks(rows.map(toExecTask));
}
