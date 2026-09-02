import { useEffect, useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { useOptions } from "../../hooks/useOptions";
import {
  listFunctionsByDepartment,
  listCompanies,
  listRegions,
  listBusinessUnits,
  listSpecialties,
  listDepartments,
  listMainProcessesByDepartment,
  searchKpis,
} from "../../services/referenceDataService";
import { listObjectiveDepartments } from "../../services/objectiveDepartmentService";
import { getObjective } from "../../services/objectiveService";
import { getKpiDetail } from "../../services/strategyKpiService";
import { findMissingRequiredFields, composeStrategyDescription, isGroupRegion } from "../../services/strategyService";
import {
  STRATEGY_TYPE_OPTIONS,
  STRATEGY_LEVEL_OPTIONS,
  COMPLEXITY_OPTIONS,
  STRATEGY_TYPE_SPECIALTY,
  STRATEGY_TYPE_SERVICE,
} from "../../constants/optionSets";

export function ObjectiveStrategyStep({ wizard }: { wizard: StrategyWizard }) {
  const { core } = wizard.state;
  const saved = !!wizard.state.strategyId;
  const locked = (field: unknown) => saved && field !== undefined && field !== "";
  /** Captured once on mount: true when the wizard was opened from a specific
   * objective row ("+ Create New Strategy" under it) or from a specific KPI's
   * "+ <Type>" button in the Strategy Tree — i.e. StrategyWizardPage pre-filled
   * objectiveDepartmentId (or strategyType, which is otherwise never pre-set)
   * before the user touched anything. That origin — not just "does this field
   * have a value" — is what locks the Parent Objective and its auto-filled
   * chain immediately, before the first save, mirroring the prototype's
   * `s._rowObjectiveId` behavior. */
  const [lockedFromEntry] = useState(
    () => !wizard.state.strategyId && !!(wizard.state.core.objectiveDepartmentId || wizard.state.core.strategyType)
  );

  const objectiveDepartments = useOptions(listObjectiveDepartments, []);
  const departments = useOptions(listDepartments, []);
  const companies = useOptions(listCompanies, []);
  const regions = useOptions(listRegions, []);
  const functions = useOptions(() => listFunctionsByDepartment(core.departmentId), [core.departmentId]);
  const regionLabel = regions.find((r) => r.id === core.regionId)?.label;
  const businessUnits = useOptions(() => (isGroupRegion(regionLabel) ? Promise.resolve([]) : listBusinessUnits(core.regionId)), [core.regionId, regionLabel]);
  const specialties = useOptions(listSpecialties, []);
  const mainProcesses = useOptions(() => listMainProcessesByDepartment(core.departmentId), [core.departmentId]);
  const kpis = useOptions(() => (core.departmentId ? searchKpis("", core.departmentId, core.functionId) : Promise.resolve([])), [core.departmentId, core.functionId]);
  const [autoLoadedObjectiveId, setAutoLoadedObjectiveId] = useState<string | undefined>();
  const [derivedKpiOption, setDerivedKpiOption] = useState<{ id: string; label: string } | undefined>();
  const kpiOptions = derivedKpiOption && !kpis.some((k) => k.id === derivedKpiOption.id) ? [derivedKpiOption, ...kpis] : kpis;
  /** The Main KPI's own Process is frequently outside its department's process
   * list (`mainProcesses` is scoped to core.departmentId, but a KPI's process
   * can belong to a different department) — so `mainProcesses` alone can miss
   * it. Carry the label straight off the KPI record as a fallback, same
   * pattern as `derivedKpiOption` above. */
  const [derivedProcessOption, setDerivedProcessOption] = useState<{ id: string; label: string } | undefined>();

  const selectedObjDept = objectiveDepartments.find((o) => o.id === core.objectiveDepartmentId);
  const selectedKpi = kpiOptions.find((k) => k.id === core.primaryKpiId);
  const selectedDept = departments.find((d) => d.id === core.departmentId);
  const selectedFn = functions.find((f) => f.id === core.functionId);
  const selectedBu = businessUnits.find((b) => b.id === core.businessUnitId);
  const selectedProcess = mainProcesses.find((p) => p.id === core.processId) ?? (derivedProcessOption?.id === core.processId ? derivedProcessOption : undefined);

  const description = selectedKpi
    ? composeStrategyDescription({
        kpiName: selectedKpi.label,
        departmentName: selectedDept?.label,
        functionName: selectedFn?.label,
        businessUnitName: selectedBu?.label,
        regionName: regionLabel,
        current: core.kpiCurrent,
        target: core.kpiTarget,
        startDate: core.startDate,
        endDate: core.endDate,
      })
    : "";

  const missing = findMissingRequiredFields({ draft: core, isServiceTrack: false, regionLabel });
  const boundOutcomeKpi = wizard.pendingOutcomeKpi ?? wizard.state.kpis.find((k) => k.role === "Outcome");
  const boundOutcomeKpiName = boundOutcomeKpi ? ("name" in boundOutcomeKpi ? boundOutcomeKpi.name : boundOutcomeKpi.kpiName) : "";

  /**
   * Auto-population from the selected Parent Objective's KPI hierarchy:
   * Objective.primaryKpi -> Strategy.strategy_kpi (Main KPI), Main
   * KPI.strategy_process -> Strategy.cr18c_process, and the Main KPI's own
   * parent binding in btm_kpidriverbindings -> the bound Outcome KPI, staged
   * to be linked via stf_strategykpi once the Strategy itself is saved (see
   * strategyKpiService.ts's getKpiDetail/findParentKpiIdOf — KPI parent/child
   * now comes from that table, btm_KPI = parent / btm_DriverKPI = child, not
   * strategy_kpises' own process_parentkpi self-relation). The Main KPI's own
   * parent points one level *up* the hierarchy, i.e. the Outcome this Output
   * rolls up to — confirmed against live Dataverse rows; it is not a child
   * pointing down at this KPI. Department and Function are likewise always
   * re-derived from the KPI's own record (never left to whatever happened to
   * be selected before) — the KPI is the source of truth for both, not the
   * other way around. Any missing piece (no primary KPI, no process, no
   * parent KPI) is left empty rather than blocking Strategy creation — see
   * the Create-Strategy KPI auto-population spec.
   */
  async function applyPrimaryKpi(primaryKpiId: string) {
    if (!primaryKpiId) {
      setDerivedKpiOption(undefined);
      setDerivedProcessOption(undefined);
      wizard.setPendingOutcomeKpi(undefined);
      wizard.setCore({ primaryKpiId: undefined, processId: undefined, subProcessId: undefined });
      return;
    }

    const mainKpi = await getKpiDetail(primaryKpiId);
    setDerivedKpiOption({ id: mainKpi.id, label: mainKpi.name });
    setDerivedProcessOption(mainKpi.processId ? { id: mainKpi.processId, label: mainKpi.processName ?? mainKpi.processId } : undefined);
    const regionChanged = !!mainKpi.regionId && mainKpi.regionId !== core.regionId;
    wizard.setCore({
      primaryKpiId: mainKpi.id,
      departmentId: mainKpi.departmentId ?? core.departmentId,
      functionId: mainKpi.functionId ?? core.functionId,
      regionId: mainKpi.regionId ?? core.regionId,
      // Business Unit only makes sense within its own Region — a stale one from a different
      // Region would silently survive otherwise, same as the manual Region picker's own reset.
      businessUnitId: regionChanged ? undefined : core.businessUnitId,
      processId: mainKpi.processId,
      subProcessId: undefined,
    });
    wizard.setPendingOutcomeKpi(mainKpi.outcomeKpiId ? { id: mainKpi.outcomeKpiId, name: mainKpi.outcomeKpiName ?? mainKpi.outcomeKpiId } : undefined);
  }

  async function handleObjectiveDepartmentChange(objectiveDepartmentId: string) {
    const opt = objectiveDepartments.find((o) => o.id === objectiveDepartmentId);
    setAutoLoadedObjectiveId(objectiveDepartmentId);
    setDerivedKpiOption(undefined);
    setDerivedProcessOption(undefined);
    wizard.setCore({ objectiveDepartmentId, departmentId: opt?.departmentId, primaryKpiId: undefined, processId: undefined, subProcessId: undefined });
    wizard.setPendingOutcomeKpi(undefined);
    if (!opt?.objectiveId) return;
    try {
      const objective = await getObjective(opt.objectiveId);
      if (!objective.primaryKpiId) return;
      await applyPrimaryKpi(objective.primaryKpiId);
    } catch {
      // Best-effort auto-population — the user can still fill Primary KPI in manually.
    }
  }

  useEffect(() => {
    if (saved || !core.objectiveDepartmentId || autoLoadedObjectiveId === core.objectiveDepartmentId) return;
    if (!objectiveDepartments.some((o) => o.id === core.objectiveDepartmentId)) return;
    setAutoLoadedObjectiveId(core.objectiveDepartmentId);
    if (core.primaryKpiId) {
      // Arrived with an explicit KPI (e.g. a specific KPI's "+ <Type>" button in
      // the Strategy Tree) — resolve its Process/Outcome chain, but don't let
      // the objective's own primary KPI override the one we were handed.
      void applyPrimaryKpi(core.primaryKpiId);
      return;
    }
    void handleObjectiveDepartmentChange(core.objectiveDepartmentId);
  }, [autoLoadedObjectiveId, core.objectiveDepartmentId, objectiveDepartments, saved]);

  /**
   * Reopening an already-saved strategy loads primaryKpiId/processId straight
   * from Dataverse (via useStrategyWizard's load effect), but
   * `derivedKpiOption`/`derivedProcessOption`/`pendingOutcomeKpi` are only
   * ever populated by `applyPrimaryKpi`, which only runs when the user
   * actively picks a Parent Objective or Main KPI — never on load. Without
   * them, Main KPI/Process/Outcome KPI (and the Description composed from
   * them) render blank even though the strategy is correctly linked in
   * Dataverse. Resolve the same KPI detail here too, purely for display —
   * core.processId/subProcessId are deliberately left untouched.
   */
  const [resolvedKpiIdForDisplay, setResolvedKpiIdForDisplay] = useState<string | undefined>();
  useEffect(() => {
    if (!saved || !core.primaryKpiId || resolvedKpiIdForDisplay === core.primaryKpiId) return;
    setResolvedKpiIdForDisplay(core.primaryKpiId);
    (async () => {
      try {
        const mainKpi = await getKpiDetail(core.primaryKpiId!);
        setDerivedKpiOption({ id: mainKpi.id, label: mainKpi.name });
        setDerivedProcessOption(mainKpi.processId ? { id: mainKpi.processId, label: mainKpi.processName ?? mainKpi.processId } : undefined);
        if (mainKpi.outcomeKpiId && !wizard.state.kpis.some((k) => k.role === "Outcome")) {
          wizard.setPendingOutcomeKpi({ id: mainKpi.outcomeKpiId, name: mainKpi.outcomeKpiName ?? mainKpi.outcomeKpiId });
        }
      } catch {
        // Best-effort — leave the fields blank if the lookup fails.
      }
    })();
  }, [saved, core.primaryKpiId, resolvedKpiIdForDisplay]);

  async function handlePrimaryKpiChange(primaryKpiId: string) {
    try {
      await applyPrimaryKpi(primaryKpiId);
    } catch {
      setDerivedKpiOption(undefined);
      setDerivedProcessOption(undefined);
      wizard.setCore({ primaryKpiId, processId: undefined, subProcessId: undefined });
      wizard.setPendingOutcomeKpi(undefined);
    }
  }

  async function handleContinue() {
    if (missing.length > 0) return;
    const ok = await wizard.saveDraft(description);
    if (ok) wizard.goNext();
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Objective &amp; Strategy</h3>
          <div className="sub">Select the parent objective, then confirm the inherited context and KPI chain.</div>
        </div>
      </div>
      <div className="card-body">
        <Field
          label="Parent Objective"
          required
          hint={
            lockedFromEntry
              ? "Locked — inherited from the objective you created this strategy on."
              : locked(core.objectiveDepartmentId)
                ? "Locked after save — the parent objective cannot be changed once the strategy exists in Dataverse."
                : "The manager selects a parent objective; objectives are created by Directors (BRL-10). Department/Region/BU/FY inherit from it."
          }
        >
          <LookupField
            value={core.objectiveDepartmentId ?? ""}
            onChange={(id) => void handleObjectiveDepartmentChange(id)}
            options={objectiveDepartments}
            disabled={lockedFromEntry || locked(core.objectiveDepartmentId)}
            placeholder="Select an objective…"
          />
        </Field>

        <div className="grid-2">
          <Field label="Department" required hint="Inherited from the selected objective">
            <input type="text" value={selectedDept?.label ?? ""} placeholder="Select a parent objective" disabled readOnly />
          </Field>
          <Field label="Function" required hint="Auto — the function that owns the selected Main KPI">
            <input type="text" value={selectedFn?.label ?? ""} placeholder="Select the Main KPI" disabled readOnly />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Strategy Name" required>
            <input
              type="text"
              value={core.name ?? ""}
              disabled={locked(core.name)}
              onChange={(e) => wizard.setCore({ name: e.target.value })}
            />
          </Field>
          <Field label="Company" required>
            <LookupField
              value={core.companyId ?? ""}
              onChange={(id) => wizard.setCore({ companyId: id })}
              options={companies}
              disabled={locked(core.companyId)}
              placeholder="Select…"
            />
          </Field>
        </div>

        <div className="section-label">Scope</div>
        <div className="grid-2">
          <Field label="Region" required>
            <LookupField
              value={core.regionId ?? ""}
              onChange={(id) => wizard.setCore({ regionId: id, businessUnitId: undefined })}
              options={regions}
              disabled={locked(core.regionId)}
              placeholder="Select…"
            />
          </Field>
          <Field label="Business Unit" required={!isGroupRegion(regionLabel)} hint={isGroupRegion(regionLabel) ? "Not required for Group scope" : undefined}>
            <LookupField
              value={core.businessUnitId ?? ""}
              onChange={(id) => wizard.setCore({ businessUnitId: id })}
              options={businessUnits}
              disabled={locked(core.businessUnitId) || isGroupRegion(regionLabel)}
              placeholder="Select…"
            />
          </Field>
        </div>

        <div className="section-label">Measurable</div>
        <Field
          label="Main KPI — Output"
          required
          hint={
            lockedFromEntry && core.primaryKpiId
              ? "Auto — the primary KPI from the linked objective. Locked."
              : "Auto-populated from the selected Parent Objective primary KPI"
          }
        >
          <LookupField
            value={core.primaryKpiId ?? ""}
            onChange={(id) => void handlePrimaryKpiChange(id)}
            options={kpiOptions}
            disabled={locked(core.primaryKpiId) || (lockedFromEntry && !!core.primaryKpiId)}
            placeholder="Select…"
          />
        </Field>
        <Field
          label="Outcome KPI (bound)"
          hint={boundOutcomeKpiName ? "Child Outcome KPI found from Main KPI and linked to the Strategy KPI table when saved" : "No child Outcome KPI found for the selected Main KPI"}
        >
          <input type="text" value={boundOutcomeKpiName} placeholder="Not found" readOnly disabled />
        </Field>
        <Field
          label="Process"
          hint={selectedProcess ? "Auto — the process linked to the Main KPI" : "No process linked to the selected Main KPI"}
        >
          <input type="text" value={selectedProcess?.label ?? ""} placeholder="Not linked" readOnly disabled />
        </Field>
        <div className="grid-2">
          <Field
            label="Strategy Type"
            required
            hint={
              lockedFromEntry && core.strategyType !== undefined
                ? "Auto — set from the Strategy Tree's \"+ Type\" button. Locked."
                : undefined
            }
          >
            <select
              value={core.strategyType ?? ""}
              disabled={locked(core.strategyType) || (lockedFromEntry && core.strategyType !== undefined)}
              onChange={(e) => wizard.setCore({ strategyType: Number(e.target.value) })}
            >
              <option value="">Select…</option>
              {STRATEGY_TYPE_OPTIONS.filter((o) => o.value !== STRATEGY_TYPE_SERVICE).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Strategy Level" required>
            <select
              value={core.strategyLevel ?? ""}
              disabled={locked(core.strategyLevel)}
              onChange={(e) => wizard.setCore({ strategyLevel: Number(e.target.value) })}
            >
              <option value="">Select…</option>
              {STRATEGY_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {core.strategyType === STRATEGY_TYPE_SPECIALTY && (
          <Field label="Specialty" required>
            <LookupField
              value={core.specialty ?? ""}
              onChange={(label) => wizard.setCore({ specialty: label })}
              options={specialties.map((s) => ({ id: s.label, label: s.label }))}
              placeholder="Select…"
            />
          </Field>
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

        <Field label="Description" hint="Composed automatically from the fields above">
          <textarea value={description} readOnly />
        </Field>

        {missing.length > 0 && (
          <div className="alert alert-warn">Complete these required fields before continuing: {missing.join(", ")}.</div>
        )}
        {selectedObjDept && !core.departmentId && (
          <div className="alert alert-warn">Could not determine the department for this objective.</div>
        )}
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
