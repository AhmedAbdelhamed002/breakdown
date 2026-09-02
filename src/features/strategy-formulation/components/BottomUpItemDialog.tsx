import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { listCategories } from "../services/categoryService";
import { searchKpis, searchUsers, listRegions, listSpecialties, listMainProcessesByDepartment, listDepartments, listFunctionsByDepartment } from "../services/referenceDataService";
import { searchProjects } from "../services/projectCharterService";
import { ProjectCharterWizard } from "./ProjectCharterWizard";
import type { BottomUpTacticDraft, BottomUpPocDraft } from "../services/bottomUpItemService";

const CATEGORY_SCOPE_TACTIC = 1;
const CATEGORY_SCOPE_POC = 2;
/** No strategy/track exists yet at this point — categories are always scoped as Departmental (the closest analogue to "Operational"), per the legacy source. */
const CATEGORY_TYPE_OPERATIONAL = 1;
const SCOPE_OPTIONS = ["Region", "Specialty", "Both"];

interface Props {
  kind: "Tactic" | "Poc";
  departmentId?: string;
  functionId?: string;
  strategyId?: string;
  onSave: (draft: BottomUpTacticDraft | BottomUpPocDraft) => Promise<void>;
  onClose: () => void;
}

export function BottomUpItemDialog({ kind, departmentId: initialDepartmentId, functionId: initialFunctionId, strategyId, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeDepartmentId, setScopeDepartmentId] = useState(initialDepartmentId ?? "");
  const [scopeFunctionId, setScopeFunctionId] = useState(initialFunctionId ?? "");
  /** A caller that already fixed Department/Function (e.g. the Bottom-Up wizard, past its own Scope
   * step) keeps that scope locked here; only when nothing is fixed yet (the standalone Unassigned
   * Tactics & POCs "+ Add" flow) does this form offer its own pickers to filter the KPI list. */
  const scopeLocked = !!initialDepartmentId;
  const departmentId = scopeLocked ? initialDepartmentId : scopeDepartmentId;
  const functionId = scopeLocked ? initialFunctionId : scopeFunctionId;
  const departments = useOptions(listDepartments, []);
  const departmentFunctions = useOptions(() => listFunctionsByDepartment(scopeDepartmentId), [scopeDepartmentId]);
  const [kpiId, setKpiId] = useState("");
  const [kpiLabel, setKpiLabel] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [target, setTarget] = useState(0);
  const [currentBaseline, setCurrentBaseline] = useState<number | undefined>();
  const [deadline, setDeadline] = useState("");
  const [neededBudget, setNeededBudget] = useState<number | undefined>();
  const [processId, setProcessId] = useState("");
  const [experimentScope, setExperimentScope] = useState("Region");
  const [regionId, setRegionId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [kpiTargetValue, setKpiTargetValue] = useState(0);
  const [successDueDate, setSuccessDueDate] = useState("");
  const [killCondition, setKillCondition] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>();
  const [projectName, setProjectName] = useState<string | undefined>();
  const [creatingCharter, setCreatingCharter] = useState(false);
  const [linkingProject, setLinkingProject] = useState(false);
  const [linkProjectId, setLinkProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useOptions(
    () => listCategories(kind === "Tactic" ? CATEGORY_SCOPE_TACTIC : CATEGORY_SCOPE_POC, CATEGORY_TYPE_OPERATIONAL),
    [kind]
  );
  const regions = useOptions(listRegions, []);
  const specialties = useOptions(listSpecialties, []);
  const processes = useOptions(() => (kind === "Tactic" ? listMainProcessesByDepartment(departmentId) : Promise.resolve([])), [kind, departmentId]);

  const needsRegion = kind === "Poc" && (experimentScope === "Region" || experimentScope === "Both");
  const needsSpecialty = kind === "Poc" && (experimentScope === "Specialty" || experimentScope === "Both");
  const regionLabel = regions.find((r) => r.id === regionId)?.label;
  const specialtyLabel = specialties.find((s) => s.id === specialtyId)?.label;
  const categoryLabel = categories.find((c) => c.id === categoryId)?.label;

  function formatPreviewDate(value: string) {
    if (!value) return "[date]";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const pocPreview =
    kind === "Poc"
      ? (() => {
          const loc: string[] = [];
          if (needsRegion) loc.push(regionLabel ?? "[Region]");
          if (needsSpecialty) loc.push(`${specialtyLabel ?? "[Specialty]"} specialty`);
          const locPart = loc.length ? ` in ${loc.join(" + ")}` : "";
          return `Run ${name || "[POC Name]"} (${categoryLabel ?? "Category"} POC)${locPart} to raise ${kpiLabel ?? "[KPI Name]"} to ${
            kpiTargetValue || "[target]"
          } by ${formatPreviewDate(successDueDate)}.`;
        })()
      : "";

  const canSave =
    kind === "Tactic"
      ? !!(name && kpiId && categoryId && assigneeId && target && deadline)
      : !!(name && kpiId && categoryId && (!needsRegion || regionId) && (!needsSpecialty || specialtyId) && kpiTargetValue && successDueDate && killCondition && from && to);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (kind === "Tactic") {
        await onSave({
          name,
          description: description || undefined,
          kpiId,
          kpiLabel,
          categoryId,
          assigneeId,
          target: Number(target),
          deadline,
          currentBaseline,
          neededBudget,
          processId: processId || undefined,
        });
      } else {
        await onSave({
          name,
          description: description || undefined,
          kpiId,
          kpiLabel,
          categoryId,
          experimentScope,
          regionId: needsRegion ? regionId : undefined,
          specialtyId: needsSpecialty ? specialtyId : undefined,
          kpiTargetValue: Number(kpiTargetValue),
          successDueDate,
          killCondition,
          from,
          to,
          neededBudget,
          projectId,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={kind === "Tactic" ? "Add Tactic" : "Add POC"}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Add"}
          </Button>
        </>
      }
    >
      <Field label="Name" required>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {!scopeLocked && (
        <div className="grid-2">
          <Field label="Department" hint="Filters the KPI list below.">
            <LookupField
              value={scopeDepartmentId}
              onChange={(id) => {
                setScopeDepartmentId(id);
                setScopeFunctionId("");
                setKpiId("");
              }}
              options={departments}
              placeholder="All departments…"
            />
          </Field>
          <Field label="Function">
            <LookupField
              value={scopeFunctionId}
              onChange={(id) => {
                setScopeFunctionId(id);
                setKpiId("");
              }}
              options={departmentFunctions}
              disabled={!scopeDepartmentId}
              placeholder="All functions…"
            />
          </Field>
        </div>
      )}
      <Field label="Related KPI" required hint={!scopeLocked ? "Filtered by Department & Function above." : undefined}>
        <LookupField
          key={`${departmentId ?? ""}::${functionId ?? ""}`}
          value={kpiId}
          onChange={(id, label) => {
            setKpiId(id);
            setKpiLabel(label);
          }}
          onSearch={(term) => searchKpis(term, departmentId, functionId)}
          selectedLabel={kpiLabel}
          placeholder="Search KPIs…"
        />
      </Field>
      <Field label="Category" required>
        <LookupField value={categoryId} onChange={setCategoryId} options={categories} placeholder="Select category…" />
      </Field>

      {kind === "Tactic" ? (
        <>
          <Field label="Assignee" required>
            <LookupField value={assigneeId} onChange={setAssigneeId} onSearch={searchUsers} placeholder="Search any user…" />
          </Field>
          <div className="grid-2">
            <Field label="Current Baseline">
              <input type="number" value={currentBaseline ?? ""} onChange={(e) => setCurrentBaseline(Number(e.target.value))} />
            </Field>
            <Field label="Target" required>
              <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Deadline" required>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            <Field label="Needed Budget">
              <input type="number" value={neededBudget ?? ""} onChange={(e) => setNeededBudget(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Related Process">
            <LookupField value={processId} onChange={setProcessId} options={processes} placeholder="None…" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Experiment Scope" required>
            <select value={experimentScope} onChange={(e) => setExperimentScope(e.target.value)}>
              {SCOPE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid-2">
            {needsRegion && (
              <Field label="Region" required>
                <LookupField value={regionId} onChange={setRegionId} options={regions} placeholder="Select region…" />
              </Field>
            )}
            {needsSpecialty && (
              <Field label="Specialty" required>
                <LookupField value={specialtyId} onChange={setSpecialtyId} options={specialties} placeholder="Select specialty…" />
              </Field>
            )}
          </div>
          <div className="grid-2">
            <Field label="KPI Target Value" required>
              <input type="number" value={kpiTargetValue} onChange={(e) => setKpiTargetValue(Number(e.target.value))} />
            </Field>
            <Field label="Success Due Date" required>
              <input type="date" value={successDueDate} onChange={(e) => setSuccessDueDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Kill Condition" required>
            <textarea value={killCondition} onChange={(e) => setKillCondition(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="From" required>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To" required>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Budget (Experimental Cap)">
            <input type="number" value={neededBudget ?? ""} onChange={(e) => setNeededBudget(Number(e.target.value))} />
          </Field>

          <div className="hint" style={{ marginBottom: 16 }}>
            {pocPreview}
          </div>

          <div className="section-label">Related Project</div>
          {projectId ? (
            <div className="alert alert-ok">
              Linked to project <b>{projectName ?? "this project"}</b>.{" "}
              <Button
                size="xs"
                onClick={() => {
                  setProjectId(undefined);
                  setProjectName(undefined);
                }}
              >
                Unlink
              </Button>
            </div>
          ) : linkingProject ? (
            <div className="field">
              <LookupField
                key={departmentId ?? ""}
                value={linkProjectId}
                onChange={(id, label) => {
                  setLinkProjectId(id);
                  if (id && label) {
                    setProjectId(id);
                    setProjectName(label);
                    setLinkingProject(false);
                    setLinkProjectId("");
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
            <>
              <div className="alert alert-warn">No existing project is linked to this POC. A POC cannot move to execution without a project.</div>
              <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
                <Button size="sm" variant="accent" onClick={() => setCreatingCharter(true)}>
                  + Create Project Request (Charter)
                </Button>
                <Button size="sm" onClick={() => setLinkingProject(true)}>
                  Link existing project…
                </Button>
              </div>
            </>
          )}
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
              }}
              onClose={() => setCreatingCharter(false)}
            />
          )}
        </>
      )}

      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
