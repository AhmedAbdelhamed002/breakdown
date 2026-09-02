import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import type { Theme, ThemeDraft } from "../models/theme";

interface Props {
  existing?: Theme;
  onSave: (draft: ThemeDraft) => Promise<void>;
  onClose: () => void;
}

export function ThemeDialog({ existing, onSave, onClose }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description || undefined });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={existing ? "Edit Theme" : "Create Theme"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Field label="Name" required>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </Modal>
  );
}
