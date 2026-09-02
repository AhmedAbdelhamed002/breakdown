import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { useOptions } from "../../hooks/useOptions";
import { listFunctionsByDepartment, listCompanies, listRegions } from "../../services/referenceDataService";
import { listOperationalStrategies, findMissingRequiredFields, composeStrategyDescription } from "../../services/strategyService";
import { COMPLEXITY_OPTIONS } from "../../constants/optionSets";

export function SupportLinkStep({ wizard }: { wizard: StrategyWizard }) {
  const { core } = wizard.state;
  const saved = !!wizard.state.strategyId;

  const functions = useOptions(() => listFunctionsByDepartment(undefined), []);
  const companies = useOptions(listCompanies, []);
  const regions = useOptions(listRegions, []);
  const operationalStrategies = useOptions(listOperationalStrategies, []);
  const supportedStrategy = operationalStrategies.find((s) => s.id === core.supportedStrategyId);
  const operationalStrategyOptions = operationalStrategies.map((s) => ({ id: s.id, label: s.name }));

  function pickSupportedStrategy(id: string) {
    const strategy = operationalStrategies.find((s) => s.id === id);
    // A service strategy tracks the same KPI/department/BU/region as the
    // operational strategy it supports — it has no "Measurable & Achievable"
    // step of its own (spec: Support Link + Service Objective steps).
    wizard.setCore({
      supportedStrategyId: id,
      supportedDepartmentId: strategy?.departmentId,
      departmentId: strategy?.departmentId,
      functionId: strategy?.functionId,
      businessUnitId: strategy?.businessUnitId,
      regionId: strategy?.regionId,
      primaryKpiId: strategy?.primaryKpiId,
      kpiCurrent: strategy?.kpiCurrent,
      kpiTarget: strategy?.kpiTarget,
    });
  }

  const missing = findMissingRequiredFields({ draft: core, isServiceTrack: true });

  async function handleContinue() {
    if (missing.length > 0) return;
    const description = composeStrategyDescription({
      kpiName: core.name ?? "",
      departmentName: supportedStrategy?.departmentName,
      startDate: core.startDate,
      endDate: core.endDate,
    });
    const ok = await wizard.saveDraft(description);
    if (ok) wizard.goNext();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Support Link</h3>
      </div>
      <div className="card-body">
        <Field label="Strategy Name" required>
          <input type="text" value={core.name ?? ""} disabled={saved && !!core.name} onChange={(e) => wizard.setCore({ name: e.target.value })} />
        </Field>

        <div className="grid-2">
          <Field label="Supportive Function (owner)" required>
            <LookupField
              value={core.supportiveFunctionId ?? ""}
              onChange={(id) => wizard.setCore({ supportiveFunctionId: id })}
              options={functions}
              placeholder="Select…"
            />
          </Field>
          <Field label="Company" required>
            <LookupField value={core.companyId ?? ""} onChange={(id) => wizard.setCore({ companyId: id })} options={companies} placeholder="Select…" />
          </Field>
        </div>

        <Field label="Supported Operational Strategy" required hint="A service strategy supports exactly one operational strategy">
          <LookupField
            value={core.supportedStrategyId ?? ""}
            onChange={(id) => pickSupportedStrategy(id)}
            options={operationalStrategyOptions}
            placeholder="Select…"
          />
        </Field>

        {supportedStrategy && (
          <div className="info-row">
            <div>
              <span className="k">Supported Department</span>
              {supportedStrategy.departmentName ?? "—"}
            </div>
            <div>
              <span className="k">Business Unit</span>
              {supportedStrategy.businessUnitName ?? "—"}
            </div>
            <div>
              <span className="k">Region</span>
              {regions.find((r) => r.id === core.regionId)?.label ?? "—"}
            </div>
          </div>
        )}

        <div className="grid-2">
          <Field label="Complexity" required>
            <select value={core.complexity ?? ""} onChange={(e) => wizard.setCore({ complexity: Number(e.target.value) })}>
              <option value="">Select…</option>
              {COMPLEXITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Implementation Confidence" required hint="0-100">
            <input
              type="number"
              value={core.implementationConfidence ?? ""}
              onChange={(e) => wizard.setCore({ implementationConfidence: Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Start Date" required>
            <input type="date" value={core.startDate ?? ""} onChange={(e) => wizard.setCore({ startDate: e.target.value })} />
          </Field>
          <Field label="End Date" required>
            <input type="date" value={core.endDate ?? ""} onChange={(e) => wizard.setCore({ endDate: e.target.value })} />
          </Field>
        </div>

        {missing.length > 0 && <div className="alert alert-warn">Complete these required fields before continuing: {missing.join(", ")}.</div>}
      </div>
      <div className="card-foot">
        <Button onClick={wizard.goBack}>Back</Button>
        <Button variant="primary" disabled={missing.length > 0 || wizard.saving} onClick={handleContinue}>
          {wizard.saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
