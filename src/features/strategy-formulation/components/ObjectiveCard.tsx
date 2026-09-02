import { Button } from "@shared/components/Button/Button";
import { StatusBadge } from "./StatusBadge";
import { OBJECTIVE_TYPE_DEPARTMENTAL, type Objective } from "../models/objective";
import { isDepartmentRowCovered } from "../hooks/useObjectiveTree";
import type { ObjectiveWithCoverage, DepartmentCoverageRow, DepartmentKpiRow, OrgOutputKpiRow, KpiStrategyButton } from "../hooks/useObjectiveTree";

const OBJECTIVE_STATUS_LABEL: Record<number, string> = { 1: "Active", 2: "Achieved", 3: "Deferred" };

function coverageSummary(departments: DepartmentCoverageRow[]): { label: string; className: "full" | "partial" | "none" } {
  if (departments.length === 0) return { label: "No departments", className: "none" };
  const coveredCount = departments.filter(isDepartmentRowCovered).length;
  if (coveredCount === departments.length) return { label: "Fully Covered", className: "full" };
  if (coveredCount === 0) return { label: `${departments.length} Gap${departments.length === 1 ? "" : "s"}`, className: "none" };
  return { label: `${departments.length - coveredCount} of ${departments.length} Gaps`, className: "partial" };
}

interface Props {
  item: ObjectiveWithCoverage;
  role: "director" | "deptmgr";
  onEdit: () => void;
  onManageDepartments: () => void;
  onCreateStrategy: (row: DepartmentCoverageRow, kpi: DepartmentKpiRow, button: KpiStrategyButton) => void;
  onCreateStrategyForOutputKpi: (objective: Objective, kpi: OrgOutputKpiRow, button: KpiStrategyButton) => void;
  onOpenStrategy: (id: string) => void;
}

export function ObjectiveCard({ item, role, onEdit, onManageDepartments, onCreateStrategy, onCreateStrategyForOutputKpi, onOpenStrategy }: Props) {
  const { objective, departments, serviceStrategies, orgOutputKpis } = item;
  const isDepartmental = objective.type === OBJECTIVE_TYPE_DEPARTMENTAL;
  const coverage = coverageSummary(departments);

  return (
    <div className="obj-card">
      <div className="obj-head">
        <div className="obj-meta">
          <h3>{objective.title}</h3>
          <div className="desc">
            {isDepartmental ? "Departmental Objective" : "Organizational Objective"}
            {objective.departmentName && ` · ${objective.departmentName}`}
            {objective.functionName && ` · ${objective.functionName}`}
            {objective.year && ` · FY ${objective.year}`}
          </div>
          <div className="chips">
            <span className={`coverage-pill ${coverage.className}`}>{coverage.label}</span>
            <span className="badge obj-type">{isDepartmental ? "Departmental" : "Cross-Departmental"}</span>
            {objective.status !== 1 && <span className="pill">{OBJECTIVE_STATUS_LABEL[objective.status] ?? "Active"}</span>}
          </div>
        </div>
        {role === "director" && (
          <Button size="sm" onClick={onEdit}>
            ✎ Edit
          </Button>
        )}
      </div>
      <div className="obj-body">
        {departments.length === 0 ? (
          <div className="cov-empty">No contributing departments yet.</div>
        ) : (
          departments.map((row) => {
            const coveredCount = row.kpis.filter((k) => k.covered).length;
            return (
              <div key={row.objDeptId} className="cov-row">
                <div className="cov-dept">
                  {row.departmentName}
                  <div className="sub">Department</div>
                  <span className="count">
                    {coveredCount}/{row.kpis.length} output KPIs covered
                  </span>
                </div>
                <div className="cov-strats">
                  {row.kpis.length === 0 ? (
                    <span className="cov-empty">No output KPIs for this department</span>
                  ) : (
                    row.kpis.map((kpi) => (
                      <div key={kpi.kpiId} className="cov-strat">
                        <span className="nm">{kpi.kpiName}</span>
                        {kpi.functionName && (
                          <span className="muted" style={{ fontSize: 10.5 }}>
                            {kpi.functionName}
                          </span>
                        )}
                        {role === "deptmgr" && kpi.buttons.length > 0 && (
                          <div className="flex" style={{ marginLeft: "auto", gap: 2, flexWrap: "wrap" }}>
                            {kpi.buttons.map((button) =>
                              button.existingStrategyId ? (
                                <Button key={button.flag} size="xs" onClick={() => onOpenStrategy(button.existingStrategyId!)}>
                                  Open {button.label} Strategy
                                </Button>
                              ) : (
                                <Button key={button.flag} size="xs" variant="accent" onClick={() => onCreateStrategy(row, kpi, button)}>
                                  + {button.label}
                                </Button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}

        {orgOutputKpis.length > 0 && (
          <div className="cov-row">
            <div className="cov-dept">
              Org Output KPIs
              <div className="sub">Linked via this objective's Org Output, not yet under a contributing department</div>
              <span className="count">
                {orgOutputKpis.filter((k) => k.covered).length}/{orgOutputKpis.length} covered
              </span>
            </div>
            <div className="cov-strats">
              {orgOutputKpis.map((kpi) => (
                <div key={kpi.kpiId} className="cov-strat">
                  <span className="nm">{kpi.kpiName}</span>
                  <span className="muted" style={{ fontSize: 10.5 }}>
                    {[kpi.departmentName, kpi.functionName].filter(Boolean).join(" · ")}
                  </span>
                  {role === "deptmgr" && kpi.buttons.length > 0 && (
                    <div className="flex" style={{ marginLeft: "auto", gap: 2, flexWrap: "wrap" }}>
                      {kpi.buttons.map((button) =>
                        button.existingStrategyId ? (
                          <Button key={button.flag} size="xs" onClick={() => onOpenStrategy(button.existingStrategyId!)}>
                            Open {button.label} Strategy
                          </Button>
                        ) : (
                          <Button
                            key={button.flag}
                            size="xs"
                            variant="accent"
                            onClick={() => onCreateStrategyForOutputKpi(objective, kpi, button)}
                          >
                            + {button.label}
                          </Button>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {serviceStrategies.length > 0 && (
          <div className="svc-block">
            <div className="lbl">Service support ({serviceStrategies.length})</div>
            <div style={serviceStrategies.length > 5 ? { maxHeight: 260, overflowY: "auto", paddingRight: 4 } : undefined}>
              {serviceStrategies.map((s) => (
                <div key={s.id} className="svc-line" style={{ justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      Supports {s.supportedStrategyName ?? "an operational strategy"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "0 0 auto" }}>
                    <StatusBadge status={s.revisionStatus} />
                    <Button size="xs" onClick={() => onOpenStrategy(s.id)}>
                      Open ↗
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {!isDepartmental && (
        <div className="card-foot">
          <Button size="sm" onClick={onManageDepartments}>
            Manage contributing departments
          </Button>
        </div>
      )}
    </div>
  );
}
