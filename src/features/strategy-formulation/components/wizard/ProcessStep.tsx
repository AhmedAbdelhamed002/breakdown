import { useEffect, useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { useOptions } from "../../hooks/useOptions";
import { listMainProcessesByDepartment, listSubProcesses } from "../../services/referenceDataService";
import { resolveProcessName } from "../../services/strategyKpiService";

export function ProcessStep({ wizard }: { wizard: StrategyWizard }) {
  const { core } = wizard.state;
  const mainProcesses = useOptions(() => listMainProcessesByDepartment(core.departmentId), [core.departmentId]);
  const subProcesses = useOptions(() => (core.processId ? listSubProcesses(core.processId) : Promise.resolve([])), [core.processId]);

  /**
   * The saved Main Process is frequently outside the strategy's own
   * department's process list (it's the KPI's process, which can belong to a
   * different department) — same finding as ObjectiveStrategyStep's
   * derivedProcessOption. Without this, the "Main Process" select shows
   * blank on reopen even though core.processId is correctly set.
   */
  const [derivedProcessOption, setDerivedProcessOption] = useState<{ id: string; label: string } | undefined>();
  useEffect(() => {
    if (!core.processId || mainProcesses.some((p) => p.id === core.processId)) {
      setDerivedProcessOption(undefined);
      return;
    }
    if (derivedProcessOption?.id === core.processId) return;
    let cancelled = false;
    (async () => {
      const label = await resolveProcessName(core.processId);
      if (!cancelled && label) setDerivedProcessOption({ id: core.processId as string, label });
    })();
    return () => {
      cancelled = true;
    };
  }, [core.processId, mainProcesses, derivedProcessOption]);

  const processOptions = derivedProcessOption && !mainProcesses.some((p) => p.id === derivedProcessOption.id) ? [derivedProcessOption, ...mainProcesses] : mainProcesses;
  const selectedProcessLabel = processOptions.find((p) => p.id === core.processId)?.label ?? derivedProcessOption?.label ?? "";
  /**
   * Snapshot of whatever Main Process was already persisted when this step opened —
   * `wizard.state.strategyId` is already set by the time this step is reached (an
   * earlier step created the draft), so gating the lock on "core.processId has any
   * value" instead of this snapshot would lock the field the instant the user picks
   * one locally, before Continue ever saves it. Locking must only ever reflect what
   * was actually saved in a prior Continue press or an earlier session, never an
   * in-progress pick still awaiting Continue.
   */
  const [savedProcessId] = useState(core.processId);
  /** Once the strategy is saved with a Main Process, it's locked — same "locked after save" convention as the rest of the wizard (ObjectiveStrategyStep's `locked()`). */
  const processLocked = !!wizard.state.strategyId && !!savedProcessId;

  async function handleContinue() {
    if (!core.processId) {
      wizard.goNext();
      return;
    }
    const ok = await wizard.saveDraft(wizard.state.core.name ?? "");
    if (ok) wizard.goNext();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Process</h3>
      </div>
      <div className="card-body">
        <Field label="Main Process" hint={processLocked ? "Locked after save" : "Auto-populated from the Main KPI when available"}>
          {processLocked ? (
            <input type="text" value={selectedProcessLabel} disabled readOnly />
          ) : (
            <LookupField
              value={core.processId ?? ""}
              onChange={(id) => wizard.setCore({ processId: id, subProcessId: undefined })}
              options={processOptions}
              placeholder="Select…"
            />
          )}
        </Field>
        <Field label="Sub-Process" hint="Optional">
          <LookupField
            value={core.subProcessId ?? ""}
            onChange={(id) => wizard.setCore({ subProcessId: id })}
            options={subProcesses}
            disabled={!core.processId}
            placeholder="Select…"
          />
        </Field>
        {!core.processId && <div className="alert alert-info">No process is linked to the selected Main KPI. The strategy can continue without one.</div>}
      </div>
      <div className="card-foot">
        <Button onClick={wizard.goBack}>Back</Button>
        <Button variant="primary" disabled={wizard.saving} onClick={handleContinue}>
          {wizard.saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
