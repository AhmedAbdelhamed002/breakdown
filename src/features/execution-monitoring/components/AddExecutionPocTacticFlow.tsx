import { useEffect, useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { EntityService, AddPocTacticFlow, useKpiPocTacticImpacts } from "@features/target-setting";

interface Props {
  processKpiId: string;
  processKpiName: string;
  departmentId?: string;
  functionId?: string;
  businessUnitId?: string;
  onDone: () => void;
  onClose: () => void;
}

/**
 * "+ POC / Tactic on this process KPI" — the reference prototype's own description: "link it to an
 * Output KPI in the popup (it's appended to that KPI's strategy)". Once an Output KPI is picked,
 * this renders the exact same AddPocTacticFlow Top-down Annual already uses (no changes needed
 * there) scoped to that Output KPI — the Process KPI itself isn't pre-wired as Driver; the user
 * picks it themselves via PocImpactDialog/TacticImpactDialog's own existing Driver KPI field once
 * the flow reaches the Impact step (already fully capable of a Driver KPI different from the
 * Related KPI the item was clustered under, confirmed in this feature's own planning research).
 */
export function AddExecutionPocTacticFlow({ processKpiId, processKpiName, departmentId, functionId, businessUnitId, onDone, onClose }: Props) {
  const [outputKpi, setOutputKpi] = useState<{ id: string; name: string } | null>(null);
  const [outputOptions, setOutputOptions] = useState<{ id: string; label: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [pickedId, setPickedId] = useState("");

  const { eligible, loading: eligibleLoading } = useKpiPocTacticImpacts(outputKpi?.id, businessUnitId);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    EntityService.getKpis(undefined, departmentId, functionId)
      .then((kpis) => {
        if (cancelled) return;
        setOutputOptions(kpis.filter((k) => k.type === "OutPut" || k.type === "Sub Output").map((k) => ({ id: k.id, label: k.name })));
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, functionId, processKpiId]);

  if (outputKpi) {
    return (
      <AddPocTacticFlow
        kpiId={outputKpi.id}
        kpiName={outputKpi.name}
        departmentId={departmentId}
        functionId={functionId}
        businessUnitId={businessUnitId}
        eligible={eligible}
        eligibleLoading={eligibleLoading}
        onDone={onDone}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={`+ POC / Tactic on ${processKpiName}`} onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="alert alert-info">
        This POC/Tactic's driver will be <b>{processKpiName}</b> (a Process KPI). Pick which Output KPI's strategy it should be appended
        to — you'll choose {processKpiName} as the Driver KPI in the next step.
      </div>
      <Field label="Output KPI" required>
        <LookupField
          value={pickedId}
          onChange={(id, label) => {
            setPickedId(id);
            if (id && label) setOutputKpi({ id, name: label });
          }}
          options={outputOptions}
          placeholder={loadingOptions ? "Loading…" : "Select an Output KPI…"}
          disabled={loadingOptions}
        />
      </Field>
    </Modal>
  );
}
