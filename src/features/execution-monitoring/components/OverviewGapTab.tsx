import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { useBusinessUnits } from "@shared/hooks/useBusinessUnits";
import { ContextBar } from "@features/target-setting";
import type { ExecutionMonitoringFilters } from "../hooks/useExecutionMonitoringFilters";
import { useOverviewGap } from "../hooks/useOverviewGap";
import type { KpiGapRow } from "../services/gapAnalysisService";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Overview (gap)" — per Output/Outcome KPI: last month's actual, this month's target, the needed
 * growth, and what the strategy's POCs/Tactics are expected to deliver. Flags a gap when expected
 * impact falls short of the needed growth. See gapAnalysisService.getKpiGapRow for the formula.
 */
export function OverviewGapTab({ filters }: { filters: ExecutionMonitoringFilters }) {
  const navigate = useNavigate();
  const { departmentId, setDepartmentId, functionId, setFunctionId, businessUnitId, setBusinessUnitId, month, setMonth, year, setYear } = filters;
  const { rows, loading, error } = useOverviewGap(departmentId, functionId, businessUnitId, month, year);
  const { businessUnits } = useBusinessUnits();
  const buName = businessUnits.find((b) => b.id === businessUnitId)?.name;
  const flaggedCount = rows.filter((r) => r.gap != null && r.gap > 0).length;

  const columns: Column<KpiGapRow>[] = [
    {
      key: "kpi",
      header: "KPI",
      render: (r) => (
        <div className="flex" style={{ gap: 8, alignItems: "center" }}>
          <b>{r.kpiName}</b>
          {r.kpiType && <span className="pill">{r.kpiType}</span>}
        </div>
      ),
    },
    { key: "lastActual", header: "Last mo. actual", align: "right", render: (r) => <span className="mono">{fmt(r.lastActual)}</span> },
    { key: "target", header: "Target", align: "right", render: (r) => <span className="mono">{fmt(r.target)}</span> },
    {
      key: "growth",
      header: "Needed growth",
      align: "right",
      render: (r) => (
        <>
          <div className="mono">{r.pctGrowth != null ? `${r.pctGrowth}%` : "—"}</div>
          {r.absGrowth != null && <div className="mono-sub">{fmt(r.absGrowth)}</div>}
        </>
      ),
    },
    {
      key: "impact",
      header: "Expected impact",
      align: "right",
      render: (r) => (
        <span className="mono" style={{ color: r.impact > 0 ? "var(--success)" : undefined }}>
          {fmt(r.impact)}
        </span>
      ),
    },
    {
      key: "gap",
      header: "Gap",
      align: "right",
      render: (r) => {
        if (r.gap == null) return <span className="mono-sub">—</span>;
        const gapBad = r.gap > 0;
        return <span className={`badge ${gapBad ? "st-returned" : "st-approved"}`}>{gapBad ? `${fmt(r.gap)} short` : "covered"}</span>;
      },
    },
    {
      key: "action",
      header: "",
      render: (r) =>
        r.gap != null && r.gap > 0 ? (
          <button className="btn btn-xs btn-accent" onClick={() => navigate("/execution-monitoring/exec")}>
            Add POCs/Tactics →
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <ContextBar
        departmentId={departmentId}
        setDepartmentId={setDepartmentId}
        functionId={functionId}
        setFunctionId={setFunctionId}
        businessUnitId={businessUnitId}
        setBusinessUnitId={setBusinessUnitId}
        month={month}
        setMonth={setMonth}
        year={year}
        setYear={setYear}
      />
      <div className="alert alert-info" style={{ marginTop: 12 }}>
        Per KPI: last month's actual, this month's target, the <b>needed growth</b> ((target − last actual) / last actual), and what the
        strategy's POCs/Tactics are expected to deliver. If expected impact is below the needed growth, the gap is flagged — add more
        POCs/Tactics, or change the impact of existing ones.
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-head">
          <div>
            <h3>
              {MONTHS[month - 1]} {year}
              {buName ? ` · ${buName}` : ""} · Gap analysis
            </h3>
            {rows.length > 0 && (
              <div className="sub">
                {flaggedCount === 0
                  ? `All ${rows.length} KPI${rows.length === 1 ? "" : "s"} covered`
                  : `${flaggedCount} of ${rows.length} KPI${rows.length === 1 ? "" : "s"} flagged`}
              </div>
            )}
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflow: "auto" }}>
          {loading ? (
            <Loading label="Loading gap analysis…" />
          ) : error ? (
            <ErrorState message={error} />
          ) : !businessUnitId ? (
            <div className="empty-state">
              <h4>Select a Business Unit</h4>
              <p>Pick a Business Unit above to see the gap analysis.</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <h4>No Output/Outcome KPIs</h4>
              <p>None found for this Department/Function selection.</p>
            </div>
          ) : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.kpiId} />
          )}
        </div>
      </div>
    </div>
  );
}
