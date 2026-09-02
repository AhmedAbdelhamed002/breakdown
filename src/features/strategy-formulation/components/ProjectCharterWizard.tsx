import { useEffect, useState, type ReactNode } from "react";
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
  listProjectEntities,
  searchUsers,
} from "../services/referenceDataService";
import { isGroupRegion } from "../services/strategyService";
import { submitProjectCharter } from "../services/projectCharterService";
import { fetchCurrentUser } from "@infrastructure/authentication/currentUser";
import {
  Cr603_projectsescr603_projectcategory,
  Cr603_projectsescr603_prioritylevel,
  Cr603_projectsescr603_projectperiod,
} from "@generated/models/Cr603_projectsesModel";
import { PROJECT_STRATEGIC_TYPE_STRATEGIC, RELATED_STRATEGY_OPTIONS, PROJECT_ASSUMPTION_OPTIONS } from "../models/projectCharter";
import type { ProjectCharterResult } from "../models/projectCharter";

interface Props {
  pocName: string;
  pocObjective: string;
  baselineStart?: string;
  baselineEnd?: string;
  departmentId?: string;
  functionId?: string;
  regionId?: string;
  businessUnitId?: string;
  strategyId?: string;
  onCreated: (result: ProjectCharterResult) => void;
  onClose: () => void;
}

const STEPS = ["Basic Details", "Categorization", "Role Assignment", "Project Classification", "Review"] as const;

function YesNoToggle({ value, onChange, disabled }: { value: boolean | undefined; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      style={{
        display: "inline-flex",
        borderRadius: "var(--r-pill)",
        border: "1px solid var(--border)",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      {[
        { v: true, label: "Yes" },
        { v: false, label: "No" },
      ].map(({ v, label }) => {
        const active = value === v;
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(v)}
            style={{
              border: "none",
              minWidth: 52,
              padding: "6px 14px",
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              cursor: disabled ? "not-allowed" : "pointer",
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : "var(--text-muted)",
              transition: "background 0.12s ease, color 0.12s ease",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** One collapsible-looking group of Review's summary rows, headed by the step it came from — with a
 * jump-back-to-edit shortcut, since Review is the one place all four earlier steps land together. */
function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="between" style={{ marginBottom: 6 }}>
        <div className="section-label" style={{ margin: 0 }}>
          {title}
        </div>
        <button type="button" className="btn btn-xs" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--r-sm)", padding: "2px 14px" }}>{children}</div>
    </div>
  );
}

/**
 * Best-effort port of the legacy Project Charter mini-wizard, adapted to two
 * confirmed live-schema mismatches (see models/projectCharter.ts): Strategic
 * Type defaults to "Strategic" here (editable) rather than the legacy's
 * permanently-disabled dead field, and Main Objective is captured as free
 * text rather than the legacy's non-existent lookup. Both need confirming
 * with the Projects module owner.
 */
export function ProjectCharterWizard({
  pocName,
  pocObjective,
  baselineStart,
  baselineEnd,
  departmentId: fixedDeptId,
  functionId: fixedFnId,
  regionId: fixedRegionId,
  businessUnitId: fixedBuId,
  strategyId,
  onCreated,
  onClose,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(`POC — ${pocName}`);
  const [objective, setObjective] = useState(pocObjective);
  const [companyId, setCompanyId] = useState("");
  const [departmentId] = useState(fixedDeptId ?? "");
  const [regionId, setRegionId] = useState(fixedRegionId ?? "");
  const [businessUnitId, setBusinessUnitId] = useState(fixedBuId ?? "");
  const [baselineStartDate, setBaselineStartDate] = useState(baselineStart ?? "");
  const [baselineEndDate, setBaselineEndDate] = useState(baselineEnd ?? "");
  const [category, setCategory] = useState<number | undefined>();
  const [entityId, setEntityId] = useState("");
  const [priority, setPriority] = useState<number | undefined>();
  const [period, setPeriod] = useState<number | undefined>();
  const [strategicType, setStrategicType] = useState(PROJECT_STRATEGIC_TYPE_STRATEGIC);
  const [assumption, setAssumption] = useState<number | undefined>();
  const [relatedStrategy, setRelatedStrategy] = useState(RELATED_STRATEGY_OPTIONS[1].value);
  const [isTechnologyProject, setIsTechnologyProject] = useState(false);
  const [assignedId, setAssignedId] = useState("");
  const [assignedLabel, setAssignedLabel] = useState<string | undefined>();
  const [smoPmo1Id, setSmoPmo1Id] = useState("");
  const [smoPmo1Label, setSmoPmo1Label] = useState<string | undefined>();
  const [smoPmo2Id, setSmoPmo2Id] = useState("");
  const [smoPmo2Label, setSmoPmo2Label] = useState<string | undefined>();
  const [followUpId, setFollowUpId] = useState("");
  const [followUpLabel, setFollowUpLabel] = useState<string | undefined>();
  const [sponsorId, setSponsorId] = useState("");
  const [sponsorLabel, setSponsorLabel] = useState<string | undefined>();
  const [regulatoryMandatoryCandidate, setRegulatoryMandatoryCandidate] = useState<boolean | undefined>(undefined);
  const [financialReturn, setFinancialReturn] = useState(false);
  const [strategicAlignment, setStrategicAlignment] = useState(false);
  const [capitalEfficiency, setCapitalEfficiency] = useState(false);
  const [riskInverseScored, setRiskInverseScored] = useState(false);
  const [urgencyCostOfDelay, setUrgencyCostOfDelay] = useState(false);
  const [qualityPatientImpactEnhancement, setQualityPatientImpactEnhancement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatorLabel, setCreatorLabel] = useState<string | undefined>();

  const departments = useOptions(listDepartments, []);
  const companies = useOptions(listCompanies, []);
  const regions = useOptions(listRegions, []);
  const regionLabel = regions.find((r) => r.id === regionId)?.label;
  const businessUnits = useOptions(() => (isGroupRegion(regionLabel) ? Promise.resolve([]) : listBusinessUnits(regionId)), [regionId, regionLabel]);
  const functions = useOptions(() => (fixedDeptId ? listFunctionsByDepartment(fixedDeptId) : Promise.resolve([])), [fixedDeptId]);
  const functionLabel = functions.find((f) => f.id === fixedFnId)?.label;
  const entities = useOptions(listProjectEntities, []);

  /** Assigned Person defaults to whoever is running the wizard (still editable) — same "pre-filled,
   * editable" convention as Execution Plan's Task "Raised by" field. Also captures the current user's
   * name for the read-only "Project Creator" row in Review — cr603_ProjectCreator is bound to this
   * same user automatically at submit time (see submitProjectCharter), this is display-only. */
  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser().then((user) => {
      if (cancelled || !user?.id) return;
      setCreatorLabel(user.fullName);
      setAssignedId((prev) => prev || user.id);
      setAssignedLabel((prev) => prev ?? user.fullName);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const basicMissing =
    !name ? "Project Name" :
    !objective ? "Objective" :
    !companyId ? "Company" :
    !regionId ? "Region" :
    !businessUnitId ? "Business Unit" :
    !baselineStartDate ? "Baseline Start Date" :
    !baselineEndDate ? "Baseline End Date" :
    baselineEndDate < baselineStartDate ? "Baseline End Date can't be before Start Date" :
    null;

  const categorizationMissing =
    category === undefined ? "Category" :
    !entityId ? "Entity" :
    priority === undefined ? "Priority Level" :
    period === undefined ? "Project Period" :
    null;

  const roleMissing =
    !assignedId ? "Assigned Person" :
    !smoPmo1Id ? "SMO/PMO 1" :
    smoPmo1Id && smoPmo1Id === smoPmo2Id ? "SMO/PMO 1 and SMO/PMO 2 can't be the same person" :
    !followUpId ? "Follow up" :
    null;

  const classificationMissing = regulatoryMandatoryCandidate === undefined ? "Regulatory / Mandatory Candidate" : null;

  const stepMissing = [basicMissing, categorizationMissing, roleMissing, classificationMissing, null][stepIndex];
  const anyMissing = basicMissing ?? categorizationMissing ?? roleMissing ?? classificationMissing;

  /** Regulatory/Mandatory Candidate has no default — the user must explicitly pick Yes/No — and
   * picking Yes forces every other classification flag to No (a Regulatory/Mandatory project is
   * exempted from being scored on the rest), per the live form's own rule. */
  function handleRegulatoryMandatoryChange(value: boolean) {
    setRegulatoryMandatoryCandidate(value);
    if (value) {
      setFinancialReturn(false);
      setStrategicAlignment(false);
      setCapitalEfficiency(false);
      setRiskInverseScored(false);
      setUrgencyCostOfDelay(false);
      setQualityPatientImpactEnhancement(false);
    }
  }

  function goNext() {
    if (stepMissing) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleCreate() {
    if (anyMissing) return;
    setSaving(true);
    setError(null);
    try {
      const result = await submitProjectCharter({
        name,
        objective,
        companyId,
        departmentId,
        regionId,
        businessUnitId,
        functionId: fixedFnId,
        baselineStartDate,
        baselineEndDate,
        category: category as number,
        entityId,
        priority: priority as number,
        period: period as number,
        strategicType,
        assumption,
        relatedStrategy,
        isTechnologyProject,
        assignedId,
        smoPmo1Id,
        smoPmo2Id: smoPmo2Id || undefined,
        followUpId,
        sponsorId: sponsorId || undefined,
        mainObjectiveText: objective,
        strategyId,
        regulatoryMandatoryCandidate: regulatoryMandatoryCandidate as boolean,
        financialReturn,
        strategicAlignment,
        capitalEfficiency,
        riskInverseScored,
        urgencyCostOfDelay,
        qualityPatientImpactEnhancement,
      });
      onCreated(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project charter");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Create Project Request (Charter)"
      onClose={onClose}
      wide
      footer={
        <>
          {stepIndex === 0 ? <Button onClick={onClose}>Cancel</Button> : <Button onClick={goBack}>← Back</Button>}
          {stepIndex < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!!stepMissing} onClick={goNext}>
              Next →
            </Button>
          ) : (
            <Button variant="primary" disabled={!!anyMissing || saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create & Link to POC →"}
            </Button>
          )}
        </>
      }
    >
      <div className="stepper">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`step${i === stepIndex ? " active" : ""}${i < stepIndex ? " done" : ""}`}
            onClick={() => setStepIndex(i)}
          >
            <span className="n">{i + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {stepIndex === 0 && (
        <>
          <Field label="Project Name" required>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Objective" required>
            <textarea value={objective} onChange={(e) => setObjective(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Company" required>
              <LookupField value={companyId} onChange={setCompanyId} options={companies} placeholder="Select…" />
            </Field>
            <Field label="Department" hint="Inherited from the POC's strategy scope">
              <input type="text" value={departments.find((d) => d.id === departmentId)?.label ?? "—"} disabled readOnly />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Function" hint="Inherited from the POC's strategy scope">
              <input type="text" value={functionLabel ?? "—"} disabled readOnly />
            </Field>
            <Field label="Project Status" hint="New project requests always start Pending">
              <input type="text" value="Pending" disabled readOnly />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Region" required>
              <LookupField value={regionId} onChange={setRegionId} options={regions} placeholder="Select…" />
            </Field>
            <Field label="Business Unit" required hint={isGroupRegion(regionLabel) ? "Region is Group — pick a specific Business Unit for the project" : undefined}>
              <LookupField value={businessUnitId} onChange={setBusinessUnitId} options={businessUnits} placeholder="Select…" />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Baseline Start Date" required>
              <input type="date" value={baselineStartDate} onChange={(e) => setBaselineStartDate(e.target.value)} />
            </Field>
            <Field label="Baseline End Date" required>
              <input type="date" value={baselineEndDate} onChange={(e) => setBaselineEndDate(e.target.value)} />
            </Field>
          </div>
          <div
            style={{
              border: "1px solid var(--accent-soft)",
              background: "var(--accent-faint)",
              borderRadius: "var(--r-sm)",
              padding: "14px 16px",
            }}
          >
            <div className="between" style={{ gap: 16 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Technology Project</span>
              <YesNoToggle value={isTechnologyProject} onChange={setIsTechnologyProject} />
            </div>
          </div>
        </>
      )}

      {stepIndex === 1 && (
        <>
          <div className="grid-2">
            <Field label="Project Category" required>
              <select value={category ?? ""} onChange={(e) => setCategory(Number(e.target.value))}>
                <option value="">Select…</option>
                {Object.entries(Cr603_projectsescr603_projectcategory).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Entity" required>
              <LookupField value={entityId} onChange={setEntityId} options={entities} placeholder="Select…" />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Priority Level" required>
              <select value={priority ?? ""} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value="">Select…</option>
                {Object.entries(Cr603_projectsescr603_prioritylevel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project Period" required>
              <select value={period ?? ""} onChange={(e) => setPeriod(Number(e.target.value))}>
                <option value="">Select…</option>
                {Object.entries(Cr603_projectsescr603_projectperiod).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Strategic Type" required hint="Best-effort default — confirm with the Projects module owner">
              <select value={strategicType} onChange={(e) => setStrategicType(Number(e.target.value))}>
                <option value={322020000}>Strategic</option>
                <option value={322020001}>Non Strategic</option>
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Project Assumption">
              <select value={assumption ?? ""} onChange={(e) => setAssumption(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">None</option>
                {PROJECT_ASSUMPTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {strategicType === PROJECT_STRATEGIC_TYPE_STRATEGIC && (
              <Field label="Related Strategy">
                <select value={relatedStrategy} onChange={(e) => setRelatedStrategy(Number(e.target.value))}>
                  {RELATED_STRATEGY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </>
      )}

      {stepIndex === 2 && (
        <>
          <div className="grid-2">
            <Field label="Assigned Person" required>
              <LookupField
                value={assignedId}
                onChange={(id, label) => {
                  setAssignedId(id);
                  setAssignedLabel(label);
                }}
                selectedLabel={assignedLabel}
                onSearch={searchUsers}
                placeholder="Search any user…"
              />
            </Field>
            <Field label="SMO/PMO 1" required>
              <LookupField
                value={smoPmo1Id}
                onChange={(id, label) => {
                  setSmoPmo1Id(id);
                  setSmoPmo1Label(label);
                }}
                selectedLabel={smoPmo1Label}
                onSearch={searchUsers}
                placeholder="Search any user…"
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="SMO/PMO 2">
              <LookupField
                value={smoPmo2Id}
                onChange={(id, label) => {
                  setSmoPmo2Id(id);
                  setSmoPmo2Label(label);
                }}
                selectedLabel={smoPmo2Label}
                onSearch={searchUsers}
                placeholder="Search any user (optional)…"
              />
            </Field>
            <Field label="Follow up" required>
              <LookupField
                value={followUpId}
                onChange={(id, label) => {
                  setFollowUpId(id);
                  setFollowUpLabel(label);
                }}
                selectedLabel={followUpLabel}
                onSearch={searchUsers}
                placeholder="Search any user…"
              />
            </Field>
          </div>
          <Field label="Sponsor">
            <LookupField
              value={sponsorId}
              onChange={(id, label) => {
                setSponsorId(id);
                setSponsorLabel(label);
              }}
              selectedLabel={sponsorLabel}
              onSearch={searchUsers}
              placeholder="Search any user (optional)…"
            />
          </Field>
        </>
      )}

      {stepIndex === 3 && (
        <>
          <div
            style={{
              border: "1px solid var(--accent-soft)",
              background: "var(--accent-faint)",
              borderRadius: "var(--r-sm)",
              padding: "14px 16px",
              marginBottom: 22,
            }}
          >
            <div className="between" style={{ gap: 16 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                Regulatory / Mandatory Candidate <span style={{ color: "var(--danger)" }}>*</span>
              </span>
              <YesNoToggle value={regulatoryMandatoryCandidate} onChange={handleRegulatoryMandatoryChange} />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Regulatory/Mandatory projects are exempt from scoring — picking Yes locks every criterion below to No.
            </div>
          </div>

          <div className="section-label" style={{ margin: "0 0 2px" }}>
            Scoring Criteria
          </div>
          <div style={{ opacity: regulatoryMandatoryCandidate === true ? 0.5 : 1, transition: "opacity 0.15s ease" }}>
            {(
              [
                { label: "Financial Return (ROI/IRR)", value: financialReturn, onChange: setFinancialReturn },
                { label: "Strategic Alignment", value: strategicAlignment, onChange: setStrategicAlignment },
                { label: "Capital Efficiency", value: capitalEfficiency, onChange: setCapitalEfficiency },
                { label: "Risk (Inverse-Scored)", value: riskInverseScored, onChange: setRiskInverseScored },
                { label: "Urgency / Cost of Delay", value: urgencyCostOfDelay, onChange: setUrgencyCostOfDelay },
                { label: "Quality & Patient Impact Enhancement", value: qualityPatientImpactEnhancement, onChange: setQualityPatientImpactEnhancement },
              ] as const
            ).map((row, i, arr) => (
              <div
                key={row.label}
                className="between"
                style={{ padding: "12px 2px", borderBottom: i < arr.length - 1 ? "1px solid var(--border-faint)" : "none" }}
              >
                <span style={{ fontSize: 13.5 }}>{row.label}</span>
                <YesNoToggle value={row.value} onChange={row.onChange} disabled={regulatoryMandatoryCandidate === true} />
              </div>
            ))}
          </div>
        </>
      )}

      {stepIndex === 4 && (
        <>
          <div className="sub" style={{ marginBottom: 16 }}>
            Review every field below, then create the project and link it to this POC. Use Edit to jump back to any step.
          </div>

          <ReviewSection title="1 · Basic Details" onEdit={() => setStepIndex(0)}>
            <div className="summary-row">
              <span className="k">Project Name</span>
              <span className="v">{name}</span>
            </div>
            <div className="summary-row">
              <span className="k">Objective</span>
              <span className="v">{objective}</span>
            </div>
            <div className="summary-row">
              <span className="k">Company</span>
              <span className="v">{companies.find((c) => c.id === companyId)?.label ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Department</span>
              <span className="v">{departments.find((d) => d.id === departmentId)?.label ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Function</span>
              <span className="v">{functionLabel ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Project Status</span>
              <span className="v">Pending</span>
            </div>
            <div className="summary-row">
              <span className="k">Region</span>
              <span className="v">{regionLabel ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Business Unit</span>
              <span className="v">{businessUnits.find((b) => b.id === businessUnitId)?.label ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Baseline Start</span>
              <span className="v">{baselineStartDate || "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Baseline End</span>
              <span className="v">{baselineEndDate || "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Technology Project</span>
              <span className="v">{isTechnologyProject ? "Yes" : "No"}</span>
            </div>
          </ReviewSection>

          <ReviewSection title="2 · Categorization" onEdit={() => setStepIndex(1)}>
            <div className="summary-row">
              <span className="k">Category</span>
              <span className="v">{category !== undefined ? Cr603_projectsescr603_projectcategory[category as keyof typeof Cr603_projectsescr603_projectcategory] : "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Entity</span>
              <span className="v">{entities.find((e) => e.id === entityId)?.label ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Priority</span>
              <span className="v">{priority !== undefined ? Cr603_projectsescr603_prioritylevel[priority as keyof typeof Cr603_projectsescr603_prioritylevel] : "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Period</span>
              <span className="v">{period !== undefined ? Cr603_projectsescr603_projectperiod[period as keyof typeof Cr603_projectsescr603_projectperiod] : "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Strategic Type</span>
              <span className="v">{strategicType === PROJECT_STRATEGIC_TYPE_STRATEGIC ? "Strategic" : "Non Strategic"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Assumption</span>
              <span className="v">{PROJECT_ASSUMPTION_OPTIONS.find((o) => o.value === assumption)?.label ?? "None"}</span>
            </div>
            {strategicType === PROJECT_STRATEGIC_TYPE_STRATEGIC && (
              <div className="summary-row">
                <span className="k">Related Strategy</span>
                <span className="v">{RELATED_STRATEGY_OPTIONS.find((o) => o.value === relatedStrategy)?.label ?? "—"}</span>
              </div>
            )}
          </ReviewSection>

          <ReviewSection title="3 · Role Assignment" onEdit={() => setStepIndex(2)}>
            <div className="summary-row">
              <span className="k">Assigned Person</span>
              <span className="v">{assignedLabel ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">SMO/PMO 1</span>
              <span className="v">{smoPmo1Label ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">SMO/PMO 2</span>
              <span className="v">{smoPmo2Id ? (smoPmo2Label ?? "—") : "None"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Follow up</span>
              <span className="v">{followUpLabel ?? "—"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Sponsor</span>
              <span className="v">{sponsorId ? (sponsorLabel ?? "—") : "None"}</span>
            </div>
          </ReviewSection>

          <ReviewSection title="4 · Project Classification" onEdit={() => setStepIndex(3)}>
            <div className="summary-row">
              <span className="k">Regulatory / Mandatory Candidate</span>
              <span className="v">{regulatoryMandatoryCandidate ? "Yes" : "No"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Financial Return (ROI/IRR)</span>
              <span className="v">{financialReturn ? "Yes" : "No"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Strategic Alignment</span>
              <span className="v">{strategicAlignment ? "Yes" : "No"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Capital Efficiency</span>
              <span className="v">{capitalEfficiency ? "Yes" : "No"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Risk (Inverse-Scored)</span>
              <span className="v">{riskInverseScored ? "Yes" : "No"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Urgency / Cost of Delay</span>
              <span className="v">{urgencyCostOfDelay ? "Yes" : "No"}</span>
            </div>
            <div className="summary-row">
              <span className="k">Quality & Patient Impact Enhancement</span>
              <span className="v">{qualityPatientImpactEnhancement ? "Yes" : "No"}</span>
            </div>
          </ReviewSection>

          <div className="summary-row" style={{ border: "none", padding: "8px 2px 0" }}>
            <span className="k muted">System-assigned</span>
            <span className="v">Project Creator: {creatorLabel ?? "—"}</span>
          </div>
        </>
      )}

      {stepMissing && <div className="alert alert-warn">Missing: {stepMissing}</div>}
      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
