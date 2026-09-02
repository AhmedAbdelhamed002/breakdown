import { useEffect, useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { resolveCurrentUserId } from "@infrastructure/authentication/currentUser";
import { searchUsers } from "../services/referenceDataService";
import { createExecTask } from "../services/taskService";
import type { ExecItem } from "../services/execTrackingService";

interface Props {
  item: ExecItem;
  strategyId: string;
  onCreated: () => void;
  onClose: () => void;
}

export function TaskBreakdownDialog({ item, onCreated, onClose }: Props) {
  const [title, setTitle] = useState(item.name ?? "");
  const [description, setDescription] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [directManagerId, setDirectManagerId] = useState("");
  const [followUpId, setFollowUpId] = useState("");
  const [raisedById, setRaisedById] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentUserId().then((id) => {
      if (!cancelled && id) setRaisedById((prev) => prev || id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const missing =
    !title ? "Task title" :
    !description ? "Task description" :
    !assigneeId ? "Assignee" :
    !directManagerId ? "Direct Manager" :
    !followUpId ? "Follow up" :
    !raisedById ? "Raised by" :
    !startDate ? "Start date" :
    !dueDate ? "Due date" :
    null;

  async function handleCreate() {
    if (missing) return;
    setSaving(true);
    setError(null);
    try {
      await createExecTask({
        kind: item.kind,
        itemId: item.id,
        kpiId: item.kpiId,
        processId: item.processId,
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

  return (
    <Modal
      title={`Break down into task — ${item.name ?? ""}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!missing || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create task"}
          </Button>
        </>
      }
    >
      <div className="info-row">
        <div>
          <span className="k">Source</span>
          {item.kind === "Tactic" ? "Tactic" : "POC"}
        </div>
        <div>
          <span className="k">KPI</span>
          {item.kpiName ?? "—"}
        </div>
        <div>
          <span className="k">Priority</span>
          High
        </div>
        <div>
          <span className="k">Status</span>
          New
        </div>
      </div>

      <Field label="Task title" required>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Task description" required>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="SharePoint URL">
        <input type="text" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
      </Field>

      <div className="grid-2">
        <Field label="Assignee" required>
          <LookupField value={assigneeId} onChange={setAssigneeId} onSearch={searchUsers} placeholder="Search any user…" />
        </Field>
        <Field label="Direct Manager" required>
          <LookupField value={directManagerId} onChange={setDirectManagerId} onSearch={searchUsers} placeholder="Search any user…" />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Follow up" required>
          <LookupField value={followUpId} onChange={setFollowUpId} onSearch={searchUsers} placeholder="Search any user…" />
        </Field>
        <Field label="Raised by" required>
          <LookupField value={raisedById} onChange={setRaisedById} onSearch={searchUsers} placeholder="Search any user…" />
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

      {!item.kpiId && <div className="alert alert-warn">This item has no linked KPI — the task will be created without one.</div>}
      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
