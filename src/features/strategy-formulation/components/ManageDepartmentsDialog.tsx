import { useEffect, useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { listDepartments } from "../services/referenceDataService";
import {
  listObjectiveDepartmentsForObjective,
  addContributingDepartment,
  type ObjectiveDepartmentRow,
} from "../services/objectiveDepartmentService";
import type { Objective } from "../models/objective";

interface Props {
  objective: Objective;
  onClose: () => void;
  onChanged: () => void;
}

/** Add-only, matching the legacy source — there is no remove path for a contributing department once added. */
export function ManageDepartmentsDialog({ objective, onClose, onChanged }: Props) {
  const [rows, setRows] = useState<ObjectiveDepartmentRow[] | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const departments = useOptions(listDepartments, []);

  useEffect(() => {
    listObjectiveDepartmentsForObjective(objective.id).then(setRows);
  }, [objective.id]);

  async function handleAdd() {
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) return;
    if (rows?.some((r) => r.departmentId === departmentId)) {
      setError("Already contributing.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const row = await addContributingDepartment(objective.id, objective.title, dept.id, dept.label);
      setRows((prev) => [...(prev ?? []), row]);
      setDepartmentId("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add department");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Contributing Departments — ${objective.title}`} onClose={onClose}>
      {rows === null ? (
        <div>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="hint">No contributing departments yet.</div>
      ) : (
        <ul>
          {rows.map((r) => (
            // Fall back to the already-loaded Department picker list — the
            // lookup's own name companion field isn't always populated by
            // the SDK, but the department was necessarily picked from this
            // same list to begin with.
            <li key={r.id}>{r.departmentName || departments.find((d) => d.id === r.departmentId)?.label || "(unknown department)"}</li>
          ))}
        </ul>
      )}

      <Field label="Add a department">
        <LookupField value={departmentId} onChange={setDepartmentId} options={departments} placeholder="Select…" />
      </Field>
      {error && <div className="alert alert-warn">{error}</div>}
      <div className="btn-row">
        <Button variant="primary" disabled={!departmentId || saving} onClick={handleAdd}>
          {saving ? "Adding…" : "Add"}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
