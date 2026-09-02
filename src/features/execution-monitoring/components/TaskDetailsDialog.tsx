import type { ReactNode } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import type { ExecTask } from "@features/strategy-formulation";
import { statusLabel, statusBadgeClass, priorityLabel, priorityBadgeClass } from "../utils/taskStatusBadge";

interface Props {
  task: ExecTask;
  /** The POC/Tactic's own reliably-known name (from context, e.g. TaskTree's own itemName) — used
   * in preference to task.sourceTacticName/sourcePocName, hx_tasks's own shadow columns for those,
   * which the Code Apps SDK doesn't reliably populate (see taskService.ts's enrichExecTasks). */
  sourceName?: string;
  onClose: () => void;
}

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d?: string) =>
  d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head" style={{ padding: "10px 16px" }}>
        <span className="section-label" style={{ margin: 0 }}>
          {title}
        </span>
      </div>
      <div className="card-body" style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{children || "—"}</div>
    </div>
  );
}

/** A plain, read-only view of one task's full details — every field shown as static text, no
 * inputs, no save action. Distinct from TaskEditorDialog (Strategy Execution's own editable form)
 * so this tab's task list can offer "view everything" without risking an accidental edit. */
export function TaskDetailsDialog({ task, sourceName, onClose }: Props) {
  return (
    <Modal title={task.title} onClose={onClose} wide footer={<Button onClick={onClose}>Close</Button>}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <span className={`badge ${statusBadgeClass(task.status)}`}>{statusLabel(task.status, task.statusName)}</span>
        <span className={`badge ${priorityBadgeClass(task.priority)}`}>{priorityLabel(task.priority, task.priorityName)}</span>
        <span className="pill">{sourceName ?? task.sourceTacticName ?? task.sourcePocName ?? "No source"}</span>
        {task.parentTaskName && <span className="pill">Subtask of {task.parentTaskName}</span>}
      </div>

      <Section title="Overview">
        <Row label="Description">{task.description}</Row>
        <Row label="SharePoint URL">
          {task.postUrl ? (
            <a href={task.postUrl} target="_blank" rel="noreferrer">
              {task.postUrl}
            </a>
          ) : undefined}
        </Row>
      </Section>

      <Section title="Schedule">
        <div className="grid-2">
          <Row label="Start date">{fmtDate(task.startDate)}</Row>
          <Row label="Due date">{fmtDate(task.dueDate)}</Row>
        </div>
      </Section>

      <Section title="People">
        <div className="grid-2">
          <Row label="Assignee">{task.assigneeName}</Row>
          <Row label="Direct Manager">{task.directManagerName}</Row>
          <Row label="Follow up">{task.followUpName}</Row>
          <Row label="Raised by">{task.raisedByName}</Row>
          <Row label="Task Creator">{task.taskCreatorName}</Row>
          <Row label="Created on">{fmtDateTime(task.createdOn)}</Row>
        </div>
      </Section>
    </Modal>
  );
}
