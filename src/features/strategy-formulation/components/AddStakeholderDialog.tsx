import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { searchUsers, listDepartments } from "../services/referenceDataService";

interface Props {
  existingStakeholderIds: string[];
  onAdd: (stakeholderId: string, stakeholderName: string, departmentId?: string) => Promise<void>;
  onClose: () => void;
}

export function AddStakeholderDialog({ existingStakeholderIds, onAdd, onClose }: Props) {
  const [userId, setUserId] = useState("");
  const [selectedUserLabel, setSelectedUserLabel] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const departments = useOptions(listDepartments, []);

  function handleUserChange(id: string, label?: string) {
    setUserId(id);
    setSelectedUserLabel(label);
  }

  async function handleSave() {
    if (!userId || !selectedUserLabel) {
      setError("Pick a person first.");
      return;
    }
    if (existingStakeholderIds.includes(userId)) {
      setError("This person is already a stakeholder on this session.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd(userId, selectedUserLabel, departmentId || undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add stakeholder");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add Stakeholder"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!userId || saving} onClick={handleSave}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </>
      }
    >
      <Field label="Department">
        <LookupField value={departmentId} onChange={setDepartmentId} options={departments} placeholder="Optional" />
      </Field>
      <Field label="Person" required>
        <LookupField value={userId} onChange={handleUserChange} onSearch={searchUsers} selectedLabel={selectedUserLabel} placeholder="Select…" />
      </Field>
      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
