import { useEffect, useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { listTasksForItem, type ExecTask } from "@features/strategy-formulation";
import { statusLabel, statusBadgeClass } from "../utils/taskStatusBadge";
import { TaskFormDialog } from "./TaskFormDialog";
import { TaskDetailsDialog } from "./TaskDetailsDialog";

interface Props {
  kind: "Poc" | "Tactic";
  itemId: string;
  itemName?: string;
  kpiId?: string;
  processId?: string;
  kpiAchievementId?: string;
  /** Needed only to lazily create a pm_kpiachievment anchor at task-creation time when
   * kpiAchievementId is empty — see TaskFormDialog. */
  businessUnitId?: string;
  month?: number;
  year?: number;
}

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : "—");

const statusBadge = (task: ExecTask) => (
  <span className={`badge ${statusBadgeClass(task.status)}`}>{statusLabel(task.status, task.statusName)}</span>
);

/** A POC/Tactic's own task tree (tasks + their subtasks) — see taskService.ts's listTasksForItem
 * (one server-filtered query covers both levels; a subtask is told apart by carrying its own
 * parentTaskId) and TaskFormDialog for creation. Status is shown read-only here (a plain badge) —
 * changing it is only available from the full task editor elsewhere, not this compact list. */
export function TaskTree({ kind, itemId, itemName, kpiId, processId, kpiAchievementId, businessUnitId, month, year }: Props) {
  const [tasks, setTasks] = useState<ExecTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newSubtaskFor, setNewSubtaskFor] = useState<ExecTask | null>(null);
  const [viewingTask, setViewingTask] = useState<ExecTask | null>(null);

  async function load() {
    setLoading(true);
    try {
      setTasks(await listTasksForItem(kind, itemId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, itemId]);

  const topTasks = tasks.filter((t) => !t.parentTaskId);
  const subtasksOf = (taskId: string) => tasks.filter((t) => t.parentTaskId === taskId);

  return (
    <div>
      <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 2px" }}>
        <span>Tasks</span>
        <Button size="xs" onClick={() => setNewTaskOpen(true)}>
          + Task
        </Button>
      </div>
      {loading ? (
        <div className="muted" style={{ fontSize: 12 }}>Loading tasks…</div>
      ) : topTasks.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>No tasks yet.</div>
      ) : (
        topTasks.map((t) => (
          <div key={t.id} className="item" style={{ margin: "6px 0", padding: 8, borderRadius: 8, background: "var(--bg-secondary)" }}>
            <div className="item-head" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="title">{t.title}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                {statusBadge(t)}
                <Button size="xs" onClick={() => setViewingTask(t)}>
                  Details
                </Button>
                <Button size="xs" onClick={() => setNewSubtaskFor(t)}>
                  + Subtask
                </Button>
              </div>
            </div>
            <div className="muted" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, marginTop: 4 }}>
              <span>Creator: {t.taskCreatorName ?? "—"}</span>
              <span>Assignee: {t.assigneeName ?? "—"}</span>
              <span>Direct Manager: {t.directManagerName ?? "—"}</span>
              <span>Start: {fmtDate(t.startDate)}</span>
              <span>Due: {fmtDate(t.dueDate)}</span>
            </div>
            {subtasksOf(t.id).map((s) => (
              <div key={s.id} className="meta" style={{ marginLeft: 28, display: "flex", gap: 10, alignItems: "center" }}>
                <span>↳ {s.title}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{s.assigneeName ?? "—"}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  {statusBadge(s)}
                  <Button size="xs" onClick={() => setViewingTask(s)}>
                    Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      {viewingTask && <TaskDetailsDialog task={viewingTask} sourceName={itemName} onClose={() => setViewingTask(null)} />}
      {newTaskOpen && (
        <TaskFormDialog
          kind={kind}
          itemId={itemId}
          itemName={itemName}
          kpiId={kpiId}
          processId={processId}
          kpiAchievementId={kpiAchievementId}
          businessUnitId={businessUnitId}
          month={month}
          year={year}
          onCreated={() => void load()}
          onClose={() => setNewTaskOpen(false)}
        />
      )}
      {newSubtaskFor && (
        <TaskFormDialog
          kind={kind}
          itemId={itemId}
          itemName={itemName}
          kpiId={kpiId}
          processId={processId}
          kpiAchievementId={kpiAchievementId}
          businessUnitId={businessUnitId}
          month={month}
          year={year}
          parentTaskId={newSubtaskFor.id}
          parentTaskTitle={newSubtaskFor.title}
          onCreated={() => void load()}
          onClose={() => setNewSubtaskFor(null)}
        />
      )}
    </div>
  );
}
