import type { Hx_taskses } from "@generated/models/Hx_tasksesModel";

export interface ExecTask {
  id: string;
  title: string;
  description?: string;
  postUrl?: string;
  status: number;
  statusName?: string;
  priority?: number;
  priorityName?: string;
  startDate?: string;
  dueDate?: string;
  createdOn?: string;
  assigneeId?: string;
  assigneeName?: string;
  directManagerId?: string;
  directManagerName?: string;
  followUpId?: string;
  followUpName?: string;
  raisedById?: string;
  raisedByName?: string;
  taskCreatorId?: string;
  taskCreatorName?: string;
  sourceTacticId?: string;
  sourceTacticName?: string;
  sourcePocId?: string;
  sourcePocName?: string;
  /** Set only on a subtask — the task it was broken down from (hx_TaskParent). Undefined for a
   * top-level task. */
  parentTaskId?: string;
  parentTaskName?: string;
}

export interface ExecTaskDraft {
  title: string;
  description: string;
  postUrl?: string;
  assigneeId: string;
  directManagerId: string;
  followUpId: string;
  raisedById: string;
  startDate: string;
  dueDate: string;
}

/** Dataverse returns these as full ISO datetimes (e.g. "2026-08-22T00:00:00Z") — `<input type="date">` requires the bare "YYYY-MM-DD" it expects back on write. */
function toDateOnly(value: string | undefined): string | undefined {
  return value ? value.slice(0, 10) : value;
}

export function toExecTask(row: Hx_taskses): ExecTask {
  return {
    id: row.hx_tasksid,
    title: row.hx_tasktitle,
    description: row.hx_taskdescription,
    postUrl: row.cr603_posturl,
    status: row.hx_status ?? 123200004,
    statusName: row.hx_statusname,
    priority: row.hx_priority,
    priorityName: row.hx_priorityname,
    startDate: toDateOnly(row.hx_startdate),
    dueDate: toDateOnly(row.hx_duedate),
    createdOn: row.createdon,
    assigneeId: row._hx_assignee_value,
    assigneeName: row.hx_assigneename,
    directManagerId: row._tms_directmanagerlkup_value,
    directManagerName: row.tms_directmanagerlkupname,
    followUpId: row._project_followup_value,
    followUpName: row.project_followupname,
    raisedById: row._hx_raisedby_value,
    raisedByName: row.hx_raisedbyname,
    taskCreatorId: row._tms_taskcreator_value,
    taskCreatorName: row.tms_taskcreatorname,
    sourceTacticId: row._stf_sourcetactic_value,
    sourceTacticName: row.stf_sourcetacticname,
    sourcePocId: row._stf_sourcepoc_value,
    sourcePocName: row.stf_sourcepocname,
    parentTaskId: row._hx_taskparent_value,
    parentTaskName: row.hx_taskparentname,
  };
}
