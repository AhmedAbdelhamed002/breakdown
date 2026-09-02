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
  searchKpis,
  searchUsers,
  getUserLabel,
} from "../services/referenceDataService";
import { listThemes } from "../services/themeService";
import { isGroupRegion } from "../services/strategyService";
import {
  composeObjectiveDescription,
  findMissingObjectiveFields,
  findObjectiveDescriptionError,
} from "../services/objectiveService";
import { OBJECTIVE_TYPE_CROSS_DEPARTMENTAL, OBJECTIVE_TYPE_DEPARTMENTAL, type Objective, type ObjectiveDraft } from "../models/objective";
import type { PickerOption } from "../models/reference";

interface Props {
  existing?: Objective;
  /** Seeds these fields for a brand-new objective (ignored once `existing` is set). Lets a caller like the Org Objectives cascade pre-fill what it already knows — department/function/KPI derived from the selected Org Outcome/Output. */
  initialDraft?: Partial<Pick<ObjectiveDraft, "departmentId" | "functionId" | "primaryKpiId" | "regionId" | "orgOutputId">>;
  /** Read-only banner shown at the top of the dialog — e.g. which Org Outcome/Output/Department this objective is being created from. */
  contextNote?: string;
  /** Display label for `initialDraft.orgOutputId` — shown as a locked, read-only "Org Output" field (it's derived from what was already selected upstream, not editable here). Omit to hide the field entirely (e.g. the plain Strategy Formulation create flow, which has no Org Output). */
  orgOutputLabel?: string;
  /**
   * Seeds an editable "Contributing Departments" list (add/remove freely before saving —
   * nothing is written to Dataverse until Save). Omit to hide the section entirely; only
   * meaningful for a brand-new objective. On save, the Lead Department is folded in
   * automatically so it's always represented alongside whatever else the user kept/added.
   */
  initialContributingDepartments?: PickerOption[];
  onSave: (draft: ObjectiveDraft, description: string, contributingDepartments?: PickerOption[]) => Promise<void>;
  onClose: () => void;
}

export function ObjectiveDialog({
  existing,
  initialDraft,
  contextNote,
  orgOutputLabel,
  initialContributingDepartments,
  onSave,
  onClose,
}: Props) {
  const isEdit = !!existing;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [type, setType] = useState(existing?.type ?? OBJECTIVE_TYPE_CROSS_DEPARTMENTAL);
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? initialDraft?.departmentId ?? "");
  const [functionId, setFunctionId] = useState(existing?.functionId ?? initialDraft?.functionId ?? "");
  const [regionId, setRegionId] = useState(existing?.regionId ?? initialDraft?.regionId ?? "");
  const [businessUnitId, setBusinessUnitId] = useState(existing?.businessUnitId ?? "");
  const [parentThemeId, setParentThemeId] = useState(existing?.parentThemeId ?? "");
  const [ownerId, setOwnerId] = useState(existing?.ownerId ?? "");
  const [primaryKpiId, setPrimaryKpiId] = useState(existing?.primaryKpiId ?? initialDraft?.primaryKpiId ?? "");
  const [currentValue, setCurrentValue] = useState<number | undefined>(existing?.currentValue);
  const [targetValue, setTargetValue] = useState<number | undefined>(existing?.targetValue);
  const [startDate, setStartDate] = useState(existing?.startDate ?? "");
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contributingDepartments, setContributingDepartments] = useState<PickerOption[]>(initialContributingDepartments ?? []);
  const [addDeptId, setAddDeptId] = useState("");

  const departments = useOptions(listDepartments, []);
  const functions = useOptions(() => listFunctionsByDepartment(departmentId), [departmentId]);
  const regions = useOptions(listRegions, []);
  const regionLabel = regions.find((r) => r.id === regionId)?.label;
  const businessUnits = useOptions(() => (isGroupRegion(regionLabel) ? Promise.resolve([]) : listBusinessUnits(regionId)), [regionId, regionLabel]);
  const themes = useOptions(listThemes, []);
  const kpis = useOptions(() => (departmentId ? searchKpis("", departmentId, functionId) : Promise.resolve([])), [departmentId, functionId]);
  // The Owner field is live-search-only (no preloaded options list to self-heal from), and the
  // row's own denormalized stf_ownername shadow field isn't reliably populated by the SDK — so
  // resolve the actual name by id directly rather than trusting either of those for the edit-mode label.
  const resolvedOwner = useOptions(
    () => (existing?.ownerId ? getUserLabel(existing.ownerId).then((u) => (u ? [u] : [])) : Promise.resolve([])),
    [existing?.ownerId]
  );
  const ownerLabel = resolvedOwner[0]?.label ?? existing?.ownerName;

  const department = departments.find((d) => d.id === departmentId);
  const selectedKpi = kpis.find((k) => k.id === primaryKpiId);
  const selectedFn = functions.find((f) => f.id === functionId);
  const selectedBu = businessUnits.find((b) => b.id === businessUnitId);

  const description = selectedKpi
    ? composeObjectiveDescription({
        kpiName: selectedKpi.label,
        departmentName: department?.label,
        functionName: selectedFn?.label,
        businessUnitName: selectedBu?.label,
        regionName: regionLabel,
        current: currentValue,
        target: targetValue,
        startDate,
        endDate,
      })
    : "";

  const draft: ObjectiveDraft = {
    title,
    type,
    departmentId,
    functionId: functionId || undefined,
    businessUnitId: businessUnitId || undefined,
    regionId,
    parentThemeId: parentThemeId || undefined,
    ownerId,
    primaryKpiId,
    currentValue: currentValue as number,
    targetValue: targetValue as number,
    orgOutputId: existing?.orgOutputId ?? initialDraft?.orgOutputId,
    startDate,
    endDate,
  };
  const missing = findMissingObjectiveFields({ draft });
  const descriptionError = findObjectiveDescriptionError(description);
  const canSave = missing.length === 0 && !descriptionError;
  const showContributingDepartments = !isEdit && initialContributingDepartments !== undefined;

  function addContributingDepartmentToList() {
    const dept = departments.find((d) => d.id === addDeptId);
    if (!dept || contributingDepartments.some((d) => d.id === dept.id)) return;
    setContributingDepartments((prev) => [...prev, dept]);
    setAddDeptId("");
  }

  function removeContributingDepartmentFromList(id: string) {
    setContributingDepartments((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      // The Lead Department always ends up represented, whether or not the user left it in
      // the editable list — otherwise it wouldn't show up with its own KPIs in the Strategy Tree.
      const finalDepartments = showContributingDepartments
        ? contributingDepartments.some((d) => d.id === departmentId)
          ? contributingDepartments
          : [...contributingDepartments, ...(department ? [department] : [])]
        : undefined;
      await onSave(draft, description, finalDepartments);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save objective");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? "Edit Objective" : "Create Objective"}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {contextNote && <div className="alert alert-info">{contextNote}</div>}

      {orgOutputLabel && (
        <Field label="Org Output" hint="Derived from the Org Output already selected — not editable here">
          <input type="text" value={orgOutputLabel} disabled readOnly />
        </Field>
      )}

      <Field label="Title" required>
        <input type="text" value={title} disabled={isEdit} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="Type" required hint={isEdit ? "Immutable after creation" : undefined}>
        <select value={type} disabled={isEdit} onChange={(e) => setType(Number(e.target.value))}>
          <option value={OBJECTIVE_TYPE_CROSS_DEPARTMENTAL}>Cross-Departmental (Organizational)</option>
          <option value={OBJECTIVE_TYPE_DEPARTMENTAL}>Departmental</option>
        </select>
      </Field>

      <div className="section-label">Scope</div>
      <div className="grid-2">
        <Field label="Lead Department" required>
          <LookupField
            value={departmentId}
            disabled={isEdit && !!existing?.departmentId}
            onChange={(id) => {
              setDepartmentId(id);
              setFunctionId("");
              setPrimaryKpiId("");
            }}
            options={departments}
            selectedLabel={existing?.departmentName}
            placeholder="Select…"
          />
        </Field>
        <Field label="Function" required>
          <LookupField
            value={functionId}
            onChange={setFunctionId}
            disabled={isEdit && !!existing?.functionId}
            options={functions}
            selectedLabel={existing?.functionName}
            placeholder="Select…"
          />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Region" required>
          <LookupField
            value={regionId}
            disabled={isEdit && !!existing?.regionId}
            onChange={(id) => {
              setRegionId(id);
              setBusinessUnitId("");
            }}
            options={regions}
            selectedLabel={existing?.regionName}
            placeholder="Select…"
          />
        </Field>
        <Field label="Business Unit" hint={isGroupRegion(regionLabel) ? "Not required for Group scope" : undefined}>
          <LookupField
            value={businessUnitId}
            disabled={(isEdit && !!existing?.businessUnitId) || isGroupRegion(regionLabel)}
            onChange={setBusinessUnitId}
            options={businessUnits}
            selectedLabel={existing?.businessUnitName}
            placeholder="Select…"
          />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Parent Theme">
          <LookupField
            value={parentThemeId}
            disabled={isEdit && !!existing?.parentThemeId}
            onChange={setParentThemeId}
            options={themes.map((t) => ({ id: t.id, label: t.name }))}
            selectedLabel={existing?.parentThemeName}
            placeholder="None…"
          />
        </Field>
        <Field label="Owner" required>
          <LookupField
            value={ownerId}
            disabled={isEdit && !!existing?.ownerId}
            onChange={setOwnerId}
            onSearch={searchUsers}
            selectedLabel={ownerLabel}
            placeholder="Search any user…"
          />
        </Field>
      </div>

      {showContributingDepartments && (
        <>
          <div className="section-label">Contributing Departments</div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Pre-filled from the departments that own a Dept Output KPI linked to this Org Output — remove any that
            don't belong, or add more, before saving.
          </div>
          {contributingDepartments.length > 0 && (
            <div className="flex" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {contributingDepartments.map((dept) => (
                <span key={dept.id} className="chip">
                  {dept.label}
                  <button type="button" onClick={() => removeContributingDepartmentFromList(dept.id)} aria-label={`Remove ${dept.label}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="grid-2">
            <Field label="Add a department">
              <LookupField
                value={addDeptId}
                onChange={setAddDeptId}
                options={departments.filter((d) => !contributingDepartments.some((c) => c.id === d.id))}
                placeholder="Select…"
              />
            </Field>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button size="sm" disabled={!addDeptId} onClick={addContributingDepartmentToList}>
                + Add
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="section-label">Measurable &amp; Achievable</div>
      <Field label="Primary KPI" required>
        <LookupField
          value={primaryKpiId}
          disabled={isEdit && !!existing?.primaryKpiId}
          onChange={setPrimaryKpiId}
          options={kpis}
          selectedLabel={existing?.primaryKpiName}
          placeholder="Select…"
        />
      </Field>
      <div className="grid-2">
        <Field label="Current value" required>
          <input type="number" value={currentValue ?? ""} onChange={(e) => setCurrentValue(Number(e.target.value))} />
        </Field>
        <Field label="Target value" required>
          <input type="number" value={targetValue ?? ""} onChange={(e) => setTargetValue(Number(e.target.value))} />
        </Field>
      </div>

      <div className="section-label">Time-bound</div>
      <div className="grid-2">
        <Field label="Start Date" required>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End Date" required>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Description" hint="Composed automatically from the fields above" error={descriptionError}>
        <textarea value={description} readOnly />
      </Field>

      {missing.length > 0 && <div className="alert alert-warn">Complete these required fields before continuing: {missing.join(", ")}.</div>}
      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
