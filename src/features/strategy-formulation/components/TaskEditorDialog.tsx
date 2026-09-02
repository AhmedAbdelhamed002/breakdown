import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { searchUsers } from "../services/referenceDataService";
import { updateExecTask } from "../services/taskService";
import { Hx_taskseshx_status, Hx_taskseshx_priority } from "@generated/models/Hx_tasksesModel";
import type { ExecTask } from "../models/execTask";

interface Props {
  task: ExecTask;
  onSaved: () => void;
  onClose: () => void;
}

export function TaskEditorDialog({ task, onSaved, onClose }: Props) {
  const [title, setTitle] = useState(task.title ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [postUrl, setPostUrl] = useState(task.postUrl ?? "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority ?? 123200002);
  const [startDate, setStartDate] = useState(task.startDate ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [directManagerId, setDirectManagerId] = useState(task.directManagerId ?? "");
  const [followUpId, setFollowUpId] = useState(task.followUpId ?? "");
  const [raisedById, setRaisedById] = useState(task.raisedById ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateExecTask(task.id, {
        title,
        description,
        postUrl: postUrl || undefined,
        status,
        priority,
        startDate,
        dueDate,
        assigneeId,
        directManagerId,
        followUpId: followUpId || undefined,
        raisedById,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit Task"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="hint" style={{ marginBottom: 12 }}>
        Source: {task.sourceTacticName ?? task.sourcePocName ?? "—"} · Created {task.createdOn ? new Date(task.createdOn).toLocaleString() : "—"}
      </div>
      <Field label="Title" required>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="SharePoint URL">
        <input type="text" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Status" required>
          <select value={status} onChange={(e) => setStatus(Number(e.target.value))}>
            {Object.entries(Hx_taskseshx_status).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" required>
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {Object.entries(Hx_taskseshx_priority).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Start date" required>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Due date" required>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Assignee" required>
          <LookupField
            value={assigneeId}
            onChange={setAssigneeId}
            onSearch={searchUsers}
            selectedLabel={task.assigneeName}
            placeholder="Search any user…"
          />
        </Field>
        <Field label="Direct Manager" required>
          <LookupField
            value={directManagerId}
            onChange={setDirectManagerId}
            onSearch={searchUsers}
            selectedLabel={task.directManagerName}
            placeholder="Search any user…"
          />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Follow up" hint="Lookups can be reassigned here but not cleared">
          <LookupField
            value={followUpId}
            onChange={setFollowUpId}
            onSearch={searchUsers}
            selectedLabel={task.followUpName}
            placeholder="Search any user…"
          />
        </Field>
        <Field label="Raised by" required>
          <LookupField
            value={raisedById}
            onChange={setRaisedById}
            onSearch={searchUsers}
            selectedLabel={task.raisedByName}
            placeholder="Search any user…"
          />
        </Field>
      </div>
      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
