import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { searchOutcomeKpis, createOutcomeKpi, linkKpiToModelAsOutcome } from "../services/financialModelService";

interface Props {
  modelId: string;
  functionId?: string;
  onCreated: (kpiId: string, kpiName: string) => void;
  onClose: () => void;
}

/**
 * For a Financial Model (typically Relation) with no Outcome-type KPI reachable yet — the gate
 * Impact calculation requires before it can run. Picks an existing Outcome KPI or creates a new
 * one, then links it onto THIS model as a zero-effect Relation Factor (see
 * linkKpiToModelAsOutcome) rather than touching the model's own result binding, which may already
 * point at something else entirely.
 */
export function QuickCreateOutcomeKpiDialog({ modelId, functionId, onCreated, onClose }: Props) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existingId, setExistingId] = useState("");
  const [existingName, setExistingName] = useState<string | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = mode === "existing" ? !!existingId : newName.trim().length > 0;

  async function handleCreate() {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const kpi = mode === "existing" ? { id: existingId, label: existingName ?? existingId } : await createOutcomeKpi(newName.trim(), functionId);
      await linkKpiToModelAsOutcome(modelId, kpi.id, kpi.label);
      onCreated(kpi.id, kpi.label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set up the Outcome KPI");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Quick Create Outcome KPI"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canCreate || saving} onClick={() => void handleCreate()}>
            {saving ? "Saving…" : "Link Outcome KPI"}
          </Button>
        </>
      }
    >
      <div className="hint" style={{ marginBottom: 12 }}>
        This Financial Model has no Outcome-type KPI yet, which the Impact calculation requires.
        Pick an existing Outcome KPI or create a new one — either way it's linked onto this model
        without changing anything it currently calculates.
      </div>

      <div className="flex" style={{ gap: 6, marginBottom: 12 }}>
        <Button size="sm" variant={mode === "existing" ? "accent" : "default"} onClick={() => setMode("existing")}>
          Select existing
        </Button>
        <Button size="sm" variant={mode === "new" ? "accent" : "default"} onClick={() => setMode("new")}>
          Create new
        </Button>
      </div>

      {mode === "existing" ? (
        <Field label="Outcome KPI" required>
          <LookupField
            value={existingId}
            onChange={(id, label) => {
              setExistingId(id);
              setExistingName(label);
            }}
            onSearch={searchOutcomeKpis}
            placeholder="Search Outcome KPIs…"
          />
        </Field>
      ) : (
        <Field label="New Outcome KPI name" required>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Patient Satisfaction" />
        </Field>
      )}

      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
