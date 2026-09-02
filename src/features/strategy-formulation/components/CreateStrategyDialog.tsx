import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import {
  listDepartments,
  listFunctionsByDepartment,
  listRegions,
  listBusinessUnits,
  listCompanies,
  listMainProcessesByDepartment,
  searchKpis,
} from "../services/referenceDataService";
import { createStrategy, composeStrategyDescription, isGroupRegion } from "../services/strategyService";
import { TRACK_OPERATIONAL, TRACK_SERVICE, STRATEGY_TYPE_SERVICE, STRATEGY_TYPE_DEPARTMENT, COMPLEXITY_OPTIONS } from "../constants/optionSets";
import type { Strategy, StrategyDraft } from "../models/strategy";

interface Props {
  /** Pre-fills Department/Function; locked (read-only) when `lockDeptFn` is true — used when clustering already-selected items that must share one dept/fn. */
  departmentId?: string;
  functionId?: string;
  lockDeptFn?: boolean;
  onCreated: (strategy: Strategy) => void;
  onClose: () => void;
}

const STEP_LABELS = ["Track", "Objective & Strategy", "Process"];

/**
 * Minimal "create a strategy with no Parent Objective" flow — the legacy
 * source's `buNewStrategyWizard`, reused by Bottom-Up, Cluster, and
 * Unassigned. Deliberately never sets `stf_ObjectiveDepartment`; that's
 * exactly why strategies created here show up in "Strategies Without Parent
 * Objective" until manually linked. Collects Company/Complexity/
 * Implementation Confidence/Primary KPI too — real, required fields on the
 * live schema that the legacy source's own minimal flow predates. Laid out
 * as the same 3-step (Track / Objective & Strategy / Process) mini-wizard as
 * the legacy source, with the schema-required fields folded into steps 2-3.
 */
export function CreateStrategyDialog({ departmentId: fixedDeptId, functionId: fixedFnId, lockDeptFn, onCreated, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [track, setTrack] = useState(TRACK_OPERATIONAL);
  const [departmentId, setDepartmentId] = useState(fixedDeptId ?? "");
  const [functionId, setFunctionId] = useState(fixedFnId ?? "");
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [primaryKpiId, setPrimaryKpiId] = useState("");
  const [complexity, setComplexity] = useState<number | undefined>();
  const [implementationConfidence, setImplementationConfidence] = useState<number | undefined>();
  const [processId, setProcessId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isServiceTrack = track === TRACK_SERVICE;
  const departments = useOptions(listDepartments, []);
  const functions = useOptions(() => listFunctionsByDepartment(departmentId), [departmentId]);
  const companies = useOptions(listCompanies, []);
  const regions = useOptions(listRegions, []);
  const regionLabel = regions.find((r) => r.id === regionId)?.label;
  const businessUnits = useOptions(() => (isGroupRegion(regionLabel) ? Promise.resolve([]) : listBusinessUnits(regionId)), [regionId, regionLabel]);
  const kpis = useOptions(() => (departmentId ? searchKpis("", departmentId, functionId) : Promise.resolve([])), [departmentId, functionId]);
  const processes = useOptions(() => (isServiceTrack ? Promise.resolve([]) : listMainProcessesByDepartment(departmentId)), [isServiceTrack, departmentId]);

  const stepMissing = [
    null,
    !name ? "Strategy Name" : !departmentId ? "Department" : !companyId ? "Company" : !regionId ? "Region" : null,
    !primaryKpiId
      ? "Primary KPI"
      : complexity === undefined
      ? "Complexity"
      : implementationConfidence === undefined
      ? "Implementation Confidence"
      : !startDate
      ? "Start Date"
      : !endDate
      ? "End Date"
      : !isServiceTrack && !processId
      ? "Main Process"
      : null,
  ];
  const missing = stepMissing[1] ?? stepMissing[2];

  async function handleCreate() {
    if (missing) return;
    setSaving(true);
    setError(null);
    try {
      const draft: StrategyDraft = {
        name,
        track,
        strategyType: isServiceTrack ? STRATEGY_TYPE_SERVICE : STRATEGY_TYPE_DEPARTMENT,
        strategyLevel: 620930000, // New
        complexity: complexity as number,
        implementationConfidence: implementationConfidence as number,
        companyId,
        departmentId,
        functionId,
        regionId,
        businessUnitId: businessUnitId || undefined,
        primaryKpiId,
        startDate,
        endDate,
        processId: isServiceTrack ? undefined : processId || undefined,
      };
      const kpi = kpis.find((k) => k.id === primaryKpiId);
      const description = composeStrategyDescription({ kpiName: kpi?.label ?? "", startDate, endDate });
      const strategy = await createStrategy(draft, description);
      onCreated(strategy);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create strategy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Create New Strategy"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>← Back</Button>}
          {step < 2 ? (
            <Button variant="primary" disabled={!!stepMissing[step]} onClick={() => setStep((s) => s + 1)}>
              Continue →
            </Button>
          ) : (
            <Button variant="primary" disabled={!!missing || saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create Strategy"}
            </Button>
          )}
        </>
      }
    >
      <div className="stepper" style={{ marginBottom: 18 }}>
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`step${i === step ? " active" : ""}${i < step ? " done" : ""}`}
            disabled={i > step}
            onClick={() => setStep(i)}
          >
            <span className="n">{i + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <>
          <div className="alert alert-info">No Parent Objective is set here — link one later from "Strategies Without Parent Objective" if needed.</div>
          <div className="grid-2">
            <div
              className={`option-card${track === TRACK_OPERATIONAL ? " selected" : ""}`}
              onClick={() => setTrack(TRACK_OPERATIONAL)}
            >
              <div className="badge track-op">Operational</div>
              <div className="hint" style={{ marginTop: 8 }}>
                What the department commits to do for itself.
              </div>
            </div>
            <div className={`option-card${isServiceTrack ? " selected" : ""}`} onClick={() => setTrack(TRACK_SERVICE)}>
              <div className="badge track-sv">Service</div>
              <div className="hint" style={{ marginTop: 8 }}>
                A supportive function&rsquo;s directed commitment to help a department.
              </div>
            </div>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <Field label="Strategy Name" required>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Department" required>
              {lockDeptFn && fixedDeptId ? (
                <input type="text" value={departments.find((d) => d.id === departmentId)?.label ?? departmentId} disabled readOnly />
              ) : (
                <LookupField
                  value={departmentId}
                  onChange={(id) => {
                    setDepartmentId(id);
                    setFunctionId("");
                  }}
                  options={departments}
                  placeholder="Select…"
                />
              )}
            </Field>
            <Field label="Function">
              {lockDeptFn && fixedFnId ? (
                <input type="text" value={functions.find((f) => f.id === functionId)?.label ?? functionId} disabled readOnly />
              ) : (
                <LookupField value={functionId} onChange={setFunctionId} options={functions} placeholder="Select…" />
              )}
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Company" required>
              <LookupField value={companyId} onChange={setCompanyId} options={companies} placeholder="Select…" />
            </Field>
            <Field label="Region" required>
              <LookupField value={regionId} onChange={setRegionId} options={regions} placeholder="Select…" />
            </Field>
          </div>
          <Field label="Business Unit" hint={isGroupRegion(regionLabel) ? "Not required for Group scope" : undefined}>
            <LookupField
              value={businessUnitId}
              onChange={setBusinessUnitId}
              options={businessUnits}
              disabled={isGroupRegion(regionLabel)}
              placeholder="Select…"
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Primary KPI" required>
            <LookupField value={primaryKpiId} onChange={setPrimaryKpiId} options={kpis} placeholder="Select…" />
          </Field>
          <div className="grid-2">
            <Field label="Complexity" required>
              <select value={complexity ?? ""} onChange={(e) => setComplexity(Number(e.target.value))}>
                <option value="">Select…</option>
                {COMPLEXITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Implementation Confidence" required hint="0-100">
              <input type="number" value={implementationConfidence ?? ""} onChange={(e) => setImplementationConfidence(Number(e.target.value))} />
            </Field>
          </div>
          {!isServiceTrack && (
            <Field label="Main Process" required>
              <LookupField value={processId} onChange={setProcessId} options={processes} placeholder="Select…" />
            </Field>
          )}
          <div className="grid-2">
            <Field label="Start Date" required>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End Date" required>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        </>
      )}

      {stepMissing[step] && <div className="alert alert-warn">Missing: {stepMissing[step]}</div>}
      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
