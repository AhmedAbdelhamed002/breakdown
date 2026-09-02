import { useEffect, useState, type ReactNode } from "react";
import { Hx_taskseshx_priority } from "@generated/models/Hx_tasksesModel";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { fetchCurrentUser } from "@infrastructure/authentication/currentUser";
import { BreakdownService } from "@features/target-setting";
import { searchUsers, getUserManager, createExecTask, TASK_SOURCE_PLANNING_MONITORING } from "@features/strategy-formulation";
import { statusLabel, statusBadgeClass, priorityBadgeClass } from "../utils/taskStatusBadge";

const PRIORITY_HIGH = 123200002;
const STATUS_NEW = 123200004;

function todayDateInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
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

/** A one-click colored picker instead of a bare native <select> sitting oddly among read-only text —
 * reuses the same badge classes the rest of the tab already shows priority/status in, so choosing one
 * previews exactly how it'll look everywhere else. */
function PriorityPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {Object.entries(Hx_taskseshx_priority).map(([v, label]) => {
        const num = Number(v);
        const active = num === value;
        return (
          <button
            key={v}
            type="button"
            className={`badge ${priorityBadgeClass(num)}`}
            onClick={() => onChange(num)}
            style={{
              cursor: "pointer",
              border: active ? "2px solid var(--text-primary)" : "2px solid transparent",
              opacity: active ? 1 : 0.55,
              fontWeight: active ? 700 : 500,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  kind: "Poc" | "Tactic";
  itemId: string;
  itemName?: string;
  kpiId?: string;
  processId?: string;
  kpiAchievementId?: string;
  /** Needed only as a fallback when kpiAchievementId is empty — creates the KPI's pm_kpiachievment
   * anchor for this BU/month/year on demand (see handleCreate) rather than leaving the link blank. */
  businessUnitId?: string;
  month?: number;
  year?: number;
  /** Set to create this as a subtask instead of a top-level task. */
  parentTaskId?: string;
  parentTaskTitle?: string;
  onCreated: () => void;
  onClose: () => void;
}

/** Create a task (or, with `parentTaskId` set, a subtask) under a POC/Tactic — the same form
 * TaskBreakdownDialog already uses in Strategy Execution, decoupled from its ExecItem coupling so
 * it can be driven straight off a Poc/Tactic id here instead. */
export function TaskFormDialog({
  kind,
  itemId,
  itemName,
  kpiId,
  processId,
  kpiAchievementId,
  businessUnitId,
  month,
  year,
  parentTaskId,
  parentTaskTitle,
  onCreated,
  onClose,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [directManagerId, setDirectManagerId] = useState("");
  const [directManagerName, setDirectManagerName] = useState<string | undefined>(undefined);
  const [directManagerSuggested, setDirectManagerSuggested] = useState(false);
  const [followUpId, setFollowUpId] = useState("");
  const [raisedById, setRaisedById] = useState("");
  const [raisedByName, setRaisedByName] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState(PRIORITY_HIGH);
  const [startDate, setStartDate] = useState(todayDateInput);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser().then((user) => {
      if (cancelled || !user?.id) return;
      setRaisedById((prev) => prev || user.id);
      setRaisedByName((prev) => prev ?? user.fullName);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Once an Assignee is picked, suggest their own manager as Direct Manager instead of making the
   * user look that up separately — only while the suggestion hasn't been overridden by hand. */
  function handleAssigneeChange(id: string) {
    setAssigneeId(id);
    if (!id || (directManagerId && !directManagerSuggested)) return;
    getUserManager(id).then((manager) => {
      if (!manager) return;
      setDirectManagerId(manager.id);
      setDirectManagerName(manager.label);
      setDirectManagerSuggested(true);
    });
  }

  function handleDirectManagerChange(id: string, label?: string) {
    setDirectManagerId(id);
    setDirectManagerName(label);
    setDirectManagerSuggested(false);
  }

  const missing =
    !title ? "Task title" :
    !description ? "Task description" :
    !assigneeId ? "Assignee" :
    !directManagerId ? "Direct Manager" :
    !followUpId ? "Follow up" :
    !raisedById ? "Raised by" :
    !startDate ? "Start date" :
    !dueDate ? "Due date" :
    dueDate < startDate ? "Due date (can't be before Start date)" :
    null;

  async function handleCreate() {
    if (missing) return;
    setSaving(true);
    setError(null);
    try {
      const achievementId =
        kpiAchievementId || (kpiId && businessUnitId && month && year
          ? await BreakdownService.ensureAnchor(kpiId, businessUnitId, year, month)
          : undefined);
      await createExecTask({
        kind,
        itemId,
        kpiId,
        processId,
        kpiAchievementId: achievementId,
        parentTaskId,
        taskSource: TASK_SOURCE_PLANNING_MONITORING,
        priority,
        title,
        description,
        postUrl: postUrl || undefined,
        assigneeId,
        directManagerId,
        followUpId,
        raisedById,
        startDate,
        dueDate,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  const isSub = !!parentTaskId;

  return (
    <Modal
      title={isSub ? `New subtask — ${parentTaskTitle ?? ""}` : `New task — ${itemName ?? ""}`}
      onClose={onClose}
      wide
      footer={
        <>
          {missing && (
            <span className="hint" style={{ marginRight: "auto", color: "var(--danger)" }}>
              Complete "{missing}" to continue
            </span>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!missing || saving} onClick={handleCreate}>
            {saving ? "Creating…" : isSub ? "Create subtask" : "Create task"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <span className="pill">{kind === "Tactic" ? "Tactic" : "POC"} — {itemName ?? "—"}</span>
        <span className={`badge ${statusBadgeClass(STATUS_NEW)}`}>{statusLabel(STATUS_NEW)}</span>
      </div>

      <FormSection title="Task">
        <Field label="Task title" required>
          <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" />
        </Field>
        <Field label="Task description" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does 'done' look like for this task?"
          />
        </Field>
        <Field label="SharePoint URL" hint="Optional — link to supporting documents or a tracking item">
          <input type="text" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Priority" required>
          <PriorityPicker value={priority} onChange={setPriority} />
        </Field>
      </FormSection>

      <FormSection title="People">
        <div className="grid-2">
          <Field label="Assignee" required hint="Who will do the work">
            <LookupField value={assigneeId} onChange={handleAssigneeChange} onSearch={searchUsers} placeholder="Search any user…" />
          </Field>
          <Field
            label="Direct Manager"
            required
            hint={directManagerSuggested ? "Suggested from the Assignee's manager — change if needed" : "For escalation visibility"}
          >
            <LookupField
              value={directManagerId}
              onChange={handleDirectManagerChange}
              onSearch={searchUsers}
              selectedLabel={directManagerName}
              placeholder="Search any user…"
            />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Follow up" required hint="Who checks in on progress">
            <LookupField value={followUpId} onChange={setFollowUpId} onSearch={searchUsers} placeholder="Search any user…" />
          </Field>
          <Field label="Raised by" required hint="Defaults to you">
            <LookupField
              value={raisedById}
              onChange={(id, label) => {
                setRaisedById(id);
                setRaisedByName(label);
              }}
              onSearch={searchUsers}
              selectedLabel={raisedByName}
              placeholder="Search any user…"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Schedule">
        <div className="grid-2">
          <Field label="Start date" required>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Due date" required>
            <input type="date" value={dueDate} min={startDate || undefined} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      </FormSection>

      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
