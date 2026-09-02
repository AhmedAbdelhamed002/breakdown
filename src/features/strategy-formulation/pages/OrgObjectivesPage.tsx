import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { useObjectiveTree, isDepartmentRowCovered } from "../hooks/useObjectiveTree";
import type { DepartmentCoverageRow, DepartmentKpiRow, OrgOutputKpiRow, KpiStrategyButton } from "../hooks/useObjectiveTree";
import { useOptions } from "../hooks/useOptions";
import { listDepartments, listFunctionsByDepartment } from "../services/referenceDataService";
import { createObjective, updateObjective } from "../services/objectiveService";
import { addContributingDepartment } from "../services/objectiveDepartmentService";
import { ObjectiveCard } from "../components/ObjectiveCard";
import { ObjectiveDialog } from "../components/ObjectiveDialog";
import { ManageDepartmentsDialog } from "../components/ManageDepartmentsDialog";
import type { Objective, ObjectiveDraft } from "../models/objective";

type Role = "director" | "deptmgr";
type CoverageFilter = "all" | "gaps" | "covered";

export function OrgObjectivesPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useObjectiveTree();
  const [role, setRole] = useState<Role>("director");
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [functionId, setFunctionId] = useState("");
  const [coverage, setCoverage] = useState<CoverageFilter>("all");
  const [editing, setEditing] = useState<Objective | "new" | null>(null);
  const [managingDepartments, setManagingDepartments] = useState<Objective | null>(null);

  const departments = useOptions(listDepartments, []);
  const functions = useOptions(() => listFunctionsByDepartment(departmentId), [departmentId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(({ objective, departments: rows }) => {
      if (search && !objective.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (departmentId && objective.departmentId !== departmentId && !rows.some((r) => r.departmentId === departmentId)) return false;
      if (functionId && objective.functionId !== functionId) return false;
      const anyGap = rows.length === 0 || rows.some((r) => !isDepartmentRowCovered(r));
      const allCovered = rows.length > 0 && rows.every(isDepartmentRowCovered);
      if (coverage === "gaps" && !anyGap) return false;
      if (coverage === "covered" && !allCovered) return false;
      return true;
    });
  }, [data, search, departmentId, functionId, coverage]);

  const stats = useMemo(() => {
    const all = data ?? [];
    const fullyCovered = all.filter((d) => d.departments.length > 0 && d.departments.every(isDepartmentRowCovered)).length;
    const hasGaps = all.filter((d) => d.departments.length === 0 || d.departments.some((r) => !isDepartmentRowCovered(r))).length;
    const engagedDepartments = new Set(all.flatMap((d) => d.departments.map((r) => r.departmentId))).size;
    return { total: all.length, fullyCovered, hasGaps, engagedDepartments };
  }, [data]);

  const filtersActive = !!(search || departmentId || functionId || coverage !== "all");
  function clearFilters() {
    setSearch("");
    setDepartmentId("");
    setFunctionId("");
    setCoverage("all");
  }

  async function handleSaveObjective(draft: ObjectiveDraft, description: string) {
    if (editing === "new") {
      const { objective, measurableFieldsError } = await createObjective(draft, description);
      if (measurableFieldsError) {
        window.alert(`Objective created, but measurable/time-bound fields failed to save: ${measurableFieldsError}`);
      }
      void objective;
    } else if (editing) {
      await updateObjective(editing.id, {
        description,
        currentValue: draft.currentValue,
        targetValue: draft.targetValue,
        startDate: draft.startDate,
        endDate: draft.endDate,
      });
    }
    await reload();
  }

  function handleCreateStrategy(row: DepartmentCoverageRow, kpi: DepartmentKpiRow, button: KpiStrategyButton) {
    const params = new URLSearchParams({
      objectiveDepartmentId: row.objDeptId,
      departmentId: row.departmentId,
      primaryKpiId: kpi.kpiId,
      strategyType: String(button.strategyType),
    });
    if (kpi.functionId) params.set("functionId", kpi.functionId);
    navigate(`/strategy-formulation/new?${params.toString()}`);
  }

  function handleOpenStrategy(id: string) {
    navigate(`/strategy-formulation/${id}`);
  }

  /**
   * An Org-Output KPI row has no objective-department junction row the first time a
   * Strategy is created against it (it was reached via the objective's Org Output, not
   * via "Manage contributing departments") — find-or-create one so the Strategy still
   * points at a real objectiveDepartmentId, same as every other Strategy in the app.
   */
  async function handleCreateStrategyForOutputKpi(objective: Objective, kpi: OrgOutputKpiRow, button: KpiStrategyButton) {
    if (!kpi.departmentId) return;
    const objDept = await addContributingDepartment(objective.id, objective.title, kpi.departmentId, kpi.departmentName ?? "");
    const params = new URLSearchParams({
      objectiveDepartmentId: objDept.id,
      departmentId: kpi.departmentId,
      primaryKpiId: kpi.kpiId,
      strategyType: String(button.strategyType),
    });
    if (kpi.functionId) params.set("functionId", kpi.functionId);
    navigate(`/strategy-formulation/new?${params.toString()}`);
  }

  if (loading) return <Loading label="Loading objectives…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div style={{ padding: 24 }}>
      <div className="between" style={{ marginBottom: 16, alignItems: "center" }}>
        <div className="rolebar">
          <div className="seg">
            <button className={role === "director" ? "on" : undefined} onClick={() => setRole("director")}>
              Director
            </button>
            <button className={role === "deptmgr" ? "on" : undefined} onClick={() => setRole("deptmgr")}>
              Dept Manager
            </button>
          </div>
          <span className="role-hint">
            {role === "director" ? "Objective creation and governed Strategy review" : "Strategy authoring across departments and functions"}
          </span>
        </div>
        {role === "director" && (
          <Button variant="primary" onClick={() => setEditing("new")}>
            + Create Objective
          </Button>
        )}
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-body">
            <div className="stat-inline">
              <span className="stat">{stats.total}</span>
              <span className="muted">Objectives</span>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0, cursor: "pointer" }} onClick={() => setCoverage("covered")}>
          <div className="card-body">
            <div className="stat-inline">
              <span className="stat" style={{ color: "var(--success)" }}>{stats.fullyCovered}</span>
              <span className="muted">Fully Covered</span>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0, cursor: "pointer" }} onClick={() => setCoverage("gaps")}>
          <div className="card-body">
            <div className="stat-inline">
              <span className="stat" style={{ color: "var(--warning)" }}>{stats.hasGaps}</span>
              <span className="muted">Need Attention</span>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-body">
            <div className="stat-inline">
              <span className="stat">{stats.engagedDepartments}</span>
              <span className="muted">Departments Engaged</span>
            </div>
          </div>
        </div>
      </div>

      <div className="obj-toolbar">
        <Field label="Search">
          <input className="inp search" type="text" placeholder="Objective title…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Department">
          <LookupField
            value={departmentId}
            onChange={(id) => {
              setDepartmentId(id);
              setFunctionId("");
            }}
            options={departments}
            placeholder="All departments…"
          />
        </Field>
        <Field label="Function">
          <LookupField value={functionId} onChange={setFunctionId} options={functions} disabled={!departmentId} placeholder="All functions…" />
        </Field>
        <Field label="Coverage">
          <select className="inp" style={{ minWidth: 150 }} value={coverage} onChange={(e) => setCoverage(e.target.value as CoverageFilter)}>
            <option value="all">All coverage</option>
            <option value="gaps">Has gaps</option>
            <option value="covered">Fully covered</option>
          </select>
        </Field>
        {filtersActive && (
          <Button size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
          {filtered.length} of {data?.length ?? 0} objectives
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No objectives match" description="Try widening your filters." />
      ) : (
        filtered.map((item) => (
          <ObjectiveCard
            key={item.objective.id}
            item={item}
            role={role}
            onEdit={() => setEditing(item.objective)}
            onManageDepartments={() => setManagingDepartments(item.objective)}
            onCreateStrategy={handleCreateStrategy}
            onCreateStrategyForOutputKpi={handleCreateStrategyForOutputKpi}
            onOpenStrategy={handleOpenStrategy}
          />
        ))
      )}

      {editing && (
        <ObjectiveDialog
          existing={editing === "new" ? undefined : editing}
          onSave={handleSaveObjective}
          onClose={() => setEditing(null)}
        />
      )}
      {managingDepartments && (
        <ManageDepartmentsDialog
          objective={managingDepartments}
          onClose={() => setManagingDepartments(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
