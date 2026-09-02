import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { Badge } from "@shared/components/Badge/Badge";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { listCategories } from "../services/categoryService";
import { listRegions, listSpecialties } from "../services/referenceDataService";
import { searchProjects } from "../services/projectCharterService";
import { ProjectCharterWizard } from "./ProjectCharterWizard";
import type { StrategyKpi } from "../models/strategyKpi";
import type { Poc, PocDraft } from "../models/poc";

const CATEGORY_SCOPE_POC = 2;

interface Props {
  strategyKpis: StrategyKpi[];
  strategyType: number;
  isServiceTrack: boolean;
  departmentId?: string;
  functionId?: string;
  strategyId?: string;
  /** The parent Strategy's own Region — seeds this POC's Region so it matches its Strategy by
   * default, without locking the field (a POC can still scope to a different Region). */
  strategyRegionId?: string;
  existing?: Poc;
  /** Only meaningful (and only ever called) while viewing an existing POC — linking/creating a
   * project there has no other Save step to ride along with, so it must persist immediately, the
   * same "saved to Dataverse right away" convention already used elsewhere in this step. */
  onLinkProject?: (projectId: string) => Promise<void>;
  onSave: (draft: PocDraft) => Promise<Poc>;
  onClose: () => void;
}

/** Step 1 of Create POC: identity, scope, success-criteria, and project fields only. Financial
 * Model / Driver KPI / Impact calculation live in PocImpactDialog (Step 2), chained right after a
 * successful save here — kept separate so this step never writes pm_Model onto the POC record
 * (see pocService.ts's own note on why that write is avoided). */
export function PocCreateDialog({ strategyKpis, strategyType, isServiceTrack, departmentId, functionId, strategyId, strategyRegionId, existing, onLinkProject, onSave, onClose }: Props) {
  /** An existing POC is only ever opened here to be viewed, not edited — Tactics & POCs no longer
   * supports in-place editing (delete + re-add instead), so `existing` now doubles as the read-only
   * flag rather than needing a separate prop. */
  const readOnly = !!existing;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [strategyKpiId, setStrategyKpiId] = useState(existing?.strategyKpiId ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  /** Every new POC is scoped to both Region and Specialty — the old Region/Specialty/Both toggle
   * is gone, but a POC saved under the old single-scope model still displays with only the field(s)
   * it actually recorded. */
  const experimentScope = existing?.experimentScope ?? "Both";
  const [regionId, setRegionId] = useState(existing?.regionId ?? strategyRegionId ?? "");
  const [specialtyId, setSpecialtyId] = useState(existing?.specialtyId ?? "");
  const kpiTargetValue = existing?.kpiTargetValue ?? 0;
  const [successDueDate, setSuccessDueDate] = useState(existing?.successDueDate ?? "");
  const [killCondition, setKillCondition] = useState(existing?.killCondition ?? "");
  const [from, setFrom] = useState(existing?.from ?? "");
  const [to, setTo] = useState(existing?.to ?? "");
  const [neededBudget, setNeededBudget] = useState(existing?.neededBudget);
  const [serviceExecutionMode, setServiceExecutionMode] = useState(existing?.serviceExecutionMode ?? 1);
  const [projectId, setProjectId] = useState(existing?.projectId);
  const [projectName, setProjectName] = useState(existing?.projectName);
  const [creatingCharter, setCreatingCharter] = useState(false);
  const [linkingProject, setLinkingProject] = useState(false);
  const [linkProjectId, setLinkProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  /** Persists a just-picked/just-created project onto this already-saved POC — only reachable in
   * View mode (readOnly), where there's no separate Save button for it to ride along with. */
  async function persistProjectLink(newProjectId: string) {
    if (!onLinkProject) return;
    setLinking(true);
    setLinkError(null);
    try {
      await onLinkProject(newProjectId);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Failed to link project");
    } finally {
      setLinking(false);
    }
  }

  const needsRegion = experimentScope === "Region" || experimentScope === "Both";
  const needsSpecialty = experimentScope === "Specialty" || experimentScope === "Both";

  const categories = useOptions(() => listCategories(CATEGORY_SCOPE_POC, strategyType), [strategyType]);
  const regions = useOptions(listRegions, []);
  const specialties = useOptions(listSpecialties, []);
  const kpiOptions = strategyKpis.map((k) => ({ id: k.id, label: k.kpiName }));

  const canSave =
    name &&
    description &&
    strategyKpiId &&
    categoryId &&
    successDueDate &&
    killCondition &&
    from &&
    to &&
    (!isServiceTrack ? !!neededBudget : true) &&
    (!needsRegion || regionId);

  const previewKpiLabel = kpiOptions.find((k) => k.id === strategyKpiId)?.label ?? existing?.strategyKpiName ?? "[KPI Name]";
  const previewCategoryLabel = categories.find((c) => c.id === categoryId)?.label ?? "[Category]";
  const previewScopeLabel =
    [needsRegion ? regions.find((r) => r.id === regionId)?.label : undefined, needsSpecialty ? specialties.find((s) => s.id === specialtyId)?.label : undefined]
      .filter(Boolean)
      .join(" / ") || "[Region]";

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        strategyKpiId,
        categoryId,
        experimentScope,
        regionId: needsRegion ? regionId : undefined,
        specialtyId: needsSpecialty ? specialtyId : undefined,
        kpiTargetValue: Number(kpiTargetValue),
        successDueDate,
        killCondition,
        from,
        to,
        neededBudget: isServiceTrack ? undefined : neededBudget,
        serviceExecutionMode: isServiceTrack ? serviceExecutionMode : undefined,
        projectId,
      });
      // Not onClose() here — every caller's onSave already moves its own state on to the
      // chained PocImpactDialog step. Closing here too would tear that transition back down
      // (onClose is the whole flow's close handler in AddPocTacticFlow/AddExecItemDialog, not
      // just this step's), skipping straight past Link Financial Model & Calculate Impact.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={existing ? "View POC" : "Add POC"}
      onClose={onClose}
      footer={
        readOnly ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canSave || saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Create POC"}
            </Button>
          </>
        )
      }
    >
      <Field label="POC Name" required>
        <input type="text" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="What is tested" required hint="Description of the experiment">
        <textarea value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Related KPI" required hint="Drawn from this strategy's KPIs.">
        <LookupField
          value={strategyKpiId}
          onChange={setStrategyKpiId}
          options={kpiOptions}
          selectedLabel={existing?.strategyKpiName}
          placeholder="Related KPI…"
          disabled={readOnly}
        />
      </Field>

      <Field label="Experiment Scope">
        <div className="grid-2">
          {needsRegion && (
            <Field label="Region" required>
              <LookupField value={regionId} onChange={setRegionId} options={regions} selectedLabel={existing?.regionName} placeholder="Choose Region…" disabled={readOnly} />
            </Field>
          )}
          {needsSpecialty && (
            <Field label="Specialty">
              <LookupField value={specialtyId} onChange={setSpecialtyId} options={specialties} selectedLabel={existing?.specialtyName} placeholder="Choose Specialty…" disabled={readOnly} />
            </Field>
          )}
        </div>
      </Field>

      <Field label="Category" required hint="Operational POC set: Role Change / New Process.">
        <LookupField value={categoryId} onChange={setCategoryId} options={categories} selectedLabel={existing?.categoryName} placeholder="Category…" disabled={readOnly} />
      </Field>

      <div className="grid-2">
        <Field label="From" required>
          <input type="date" value={from} disabled={readOnly} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" required>
          <input type="date" value={to} disabled={readOnly} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>SUCCESS CRITERIA</span>
      </div>
      <div style={{ marginBottom: 6 }}>
        <Field label="Success due date" required>
          <input type="date" value={successDueDate} disabled={readOnly} onChange={(e) => setSuccessDueDate(e.target.value)} />
        </Field>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 16 }}>
        Success = the chosen KPI shows improvement by the due date.
      </div>

      <Field label="Kill Condition" required hint="What condition ends this experiment early">
        <textarea value={killCondition} placeholder="When to stop" disabled={readOnly} onChange={(e) => setKillCondition(e.target.value)} />
      </Field>

      {!isServiceTrack && (
        <Field label="Budget (Experimental Cap)" required>
          <input type="number" step="any" value={neededBudget ?? ""} disabled={readOnly} onChange={(e) => setNeededBudget(Number(e.target.value))} />
        </Field>
      )}
      {isServiceTrack && (
        <Field label="Execution Mode" required hint="Service POCs may execute as a TMS Task or a Project, unlike Tactics (TMS-only)">
          <select value={serviceExecutionMode} disabled={readOnly} onChange={(e) => setServiceExecutionMode(Number(e.target.value))}>
            <option value={1}>TMS</option>
            <option value={2}>Project</option>
          </select>
        </Field>
      )}

      <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Related Project</span>
        <Badge status="submitted">CHANGED</Badge>
      </div>
      {projectId ? (
        <div className="alert alert-ok">
          Linked to project <b>{projectName ?? "this project"}</b>.
          {!readOnly && (
            <>
              {" "}
              <Button
                size="xs"
                onClick={() => {
                  setProjectId(undefined);
                  setProjectName(undefined);
                }}
              >
                Unlink
              </Button>
            </>
          )}
        </div>
      ) : linkingProject ? (
        <div className="field">
          <LookupField
            value={linkProjectId}
            onChange={(id, label) => {
              setLinkProjectId(id);
              if (id && label) {
                setProjectId(id);
                setProjectName(label);
                setLinkingProject(false);
                setLinkProjectId("");
                if (readOnly) void persistProjectLink(id);
              }
            }}
            onSearch={(term) => searchProjects(term, departmentId)}
            placeholder="Search existing projects…"
          />
          <div className="flex" style={{ gap: 10, marginTop: 8 }}>
            <Button
              size="sm"
              onClick={() => {
                setLinkingProject(false);
                setLinkProjectId("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="alert alert-warn">
          <div style={{ marginBottom: 10 }}>
            <b>⚠ No existing project is linked to this POC.</b> A POC cannot move to execution without a project.
          </div>
          <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
            <Button size="sm" variant="accent" disabled={linking} onClick={() => setCreatingCharter(true)}>
              + Create Project Request (Charter)
            </Button>
            <Button size="sm" disabled={linking} onClick={() => setLinkingProject(true)}>
              {linking ? "Linking…" : "Link existing project…"}
            </Button>
          </div>
          {linkError && (
            <div className="alert alert-warn" style={{ marginTop: 8 }}>
              {linkError}
            </div>
          )}
        </div>
      )}

      <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>SMART PREVIEW</span>
        <Badge status="draft">NEW — AUTO &amp; LOCKED</Badge>
      </div>
      <div className="preview-box">
        Run <b>{name || "[POC Name]"}</b> ({previewCategoryLabel} POC) in <b>{previewScopeLabel}</b> to raise <b>{previewKpiLabel}</b> by{" "}
        <b>{successDueDate || "[date]"}</b>.
      </div>

      {creatingCharter && (
        <ProjectCharterWizard
          pocName={name}
          pocObjective={description}
          baselineStart={from}
          baselineEnd={to}
          departmentId={departmentId}
          functionId={functionId}
          strategyId={strategyId}
          onCreated={(result) => {
            setProjectId(result.id);
            setProjectName(result.name);
            if (readOnly) void persistProjectLink(result.id);
          }}
          onClose={() => setCreatingCharter(false)}
        />
      )}
    </Modal>
  );
}
