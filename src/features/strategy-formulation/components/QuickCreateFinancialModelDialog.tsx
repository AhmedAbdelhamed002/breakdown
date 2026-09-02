import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { saveEquationModelToDataverse, generatedModelName } from "@features/financial/services/dataverseService";
import type { FinancialModel, RelationFactor } from "@features/financial/models/types";
import { searchOutcomeKpis } from "../services/financialModelService";
import type { PickerOption } from "../models/reference";

interface Props {
  /** This strategy's own KPIs — one becomes the new model's single Relation factor (its driving component). The Driver KPI on the POC form itself isn't chosen yet at this point (that's what's blocked), so it's picked fresh here instead of assumed. */
  candidateDriverKpis: PickerOption[];
  functionId?: string;
  onCreated: (modelId: string, modelName: string) => void;
  onClose: () => void;
}

/**
 * Minimal Financial Model creation — not the full Builder/Tester/Review wizard, just what
 * saveEquationModelToDataverse (the same persistence function the wizard itself uses) needs: a
 * result (the chosen Outcome KPI) and one Relation factor. No name field — the model's name is
 * always auto-generated from its result + scope by the shared save function, so a manual name
 * here would just be silently overwritten.
 */
export function QuickCreateFinancialModelDialog({ candidateDriverKpis, functionId, onCreated, onClose }: Props) {
  const [outcomeKpiId, setOutcomeKpiId] = useState("");
  const [outcomeKpiName, setOutcomeKpiName] = useState<string | undefined>(undefined);
  const [factorKpiId, setFactorKpiId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewName = outcomeKpiName ? generatedModelName(outcomeKpiName, undefined) : "[Pick an Outcome KPI]";
  const canCreate = !!outcomeKpiId && !!factorKpiId;

  async function handleCreate() {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const model: FinancialModel = {
        pm_modelid: "",
        pm_resultkind: "KPI",
        pm_resultref: outcomeKpiId,
        pm_resultrefname: outcomeKpiName,
        pm_calculatedkpi: outcomeKpiId,
        pm_calculatedkpiname: outcomeKpiName,
        pm_scope: functionId ?? "",
        pm_modeltype: "Relation",
        pm_useworkingdays: "No",
        pm_version: "0.1",
        statuscode: "Draft",
      };
      const factor: RelationFactor = {
        pm_relationfactorid: "",
        pm_model: "",
        pm_factorkpi: factorKpiId,
        pm_direction: "Increases",
        pm_inputpct: 10,
        pm_resultpct: 5,
      };
      const result = await saveEquationModelToDataverse(model, [], "Draft", [factor]);
      onCreated(result.modelId, result.model.pm_name || previewName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create Financial Model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Quick Create Financial Model"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canCreate || saving} onClick={() => void handleCreate()}>
            {saving ? "Creating…" : "Create Model"}
          </Button>
        </>
      }
    >
      <div className="hint" style={{ marginBottom: 12 }}>
        This Financial Model needs an Outcome-type KPI as its result. Pick that, plus which of this
        strategy's KPIs drives it — the model is created as a Draft Relation model with that one
        driving factor.
      </div>
      <Field label="Outcome KPI" required>
        <LookupField
          value={outcomeKpiId}
          onChange={(id, label) => {
            setOutcomeKpiId(id);
            setOutcomeKpiName(label);
          }}
          onSearch={searchOutcomeKpis}
          placeholder="Search Outcome KPIs…"
        />
      </Field>
      <Field label="Driving KPI" required hint="Which of this strategy's KPIs feeds the Outcome KPI">
        <LookupField value={factorKpiId} onChange={setFactorKpiId} options={candidateDriverKpis} placeholder="Select…" />
      </Field>
      <Field label="Model name" hint="Auto-generated from the result KPI, same as the full Financial Modeler">
        <input type="text" value={previewName} disabled readOnly />
      </Field>
      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
