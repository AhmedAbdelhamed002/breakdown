import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { ContextBar, type BreakdownDeepLinkState } from "@features/target-setting";
import type { ExecutionMonitoringFilters } from "../hooks/useExecutionMonitoringFilters";
import { useExecutionBreakdowns, type BreakdownOverviewRow } from "../hooks/useExecutionBreakdowns";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function BreakdownKpiCard({
  row,
  open,
  onToggle,
  onAddOrEdit,
}: {
  row: BreakdownOverviewRow;
  open: boolean;
  onToggle: () => void;
  onAddOrEdit: () => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-head between" style={{ cursor: "pointer" }} onClick={onToggle}>
        <div>
          <h3>
            {row.kpiName} {row.kpiType && <span className="pill">{row.kpiType}</span>}
          </h3>
          <div className="sub">Target {fmt(row.target)} · {row.rows.length} breakdown row{row.rows.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex" style={{ gap: 10, alignItems: "center" }}>
          <button
            className="btn btn-sm btn-accent"
            onClick={(e) => {
              e.stopPropagation();
              onAddOrEdit();
            }}
          >
            + Add / Edit breakdown for this KPI
          </button>
          <span>{open ? "▾" : "▸"}</span>
        </div>
      </div>
      {open && (
        <div className="card-body" style={{ padding: 0, overflow: "auto" }}>
          {row.rows.length === 0 ? (
            <div className="muted" style={{ padding: 14, fontSize: 12.5 }}>No breakdown rows yet for this KPI Achievement.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Dimension</th>
                  <th>Level</th>
                  <th className="tright">Target</th>
                  <th className="tright">Actual</th>
                </tr>
              </thead>
              <tbody>
                {row.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.pathLabel || r.name}</td>
                    <td><span className="pill">{r.dimension}</span></td>
                    <td className="muted">{r.level}</td>
                    <td className="tright mono">{fmt(r.target)}</td>
                    <td className="tright mono">{r.actualRecorded ? fmt(r.actual) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Breakdowns" — every KPI Achievement (pm_kpiachievments) that exists for the selected Business
 * Unit/Department/Function/Month/Year, each with its own breakdown detail shown inline. "+ Add /
 * Edit breakdown for this KPI" deep-links into Modeler & Target Setting's own Breakdown editor with
 * the same filters and that KPI already open — see BreakdownPage's own BreakdownDeepLinkState.
 */
export function BreakdownsTab({ filters }: { filters: ExecutionMonitoringFilters }) {
  const navigate = useNavigate();
  const { departmentId, setDepartmentId, functionId, setFunctionId, businessUnitId, setBusinessUnitId, month, setMonth, year, setYear } = filters;
  const { rows, loading, error } = useExecutionBreakdowns(departmentId, functionId, businessUnitId, month, year);
  const [openKpiId, setOpenKpiId] = useState<Record<string, boolean>>({});

  function goToBreakdown(row: BreakdownOverviewRow) {
    const state: BreakdownDeepLinkState = {
      businessUnitId,
      departmentId,
      functionId,
      month,
      year,
      kpiId: row.kpiId,
      kpiName: row.kpiName,
      kpiType: row.kpiType,
      kpiAggType: row.kpiAggType,
    };
    navigate("/modeler-target-setting/breakdown", { state });
  }

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
        Every KPI Achievement recorded for <b>{MONTHS[month - 1]} {year}</b> in this Business Unit/Department/Function, with its own
        breakdown detail. Use <b>+ Add / Edit breakdown for this KPI</b> to jump straight into that KPI's breakdown editor.
      </div>

      {loading ? (
        <Loading label="Loading KPI Achievements…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !businessUnitId ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <EmptyState title="Select a Business Unit" description="Pick a Business Unit above to see its KPI Achievements." />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <EmptyState
              title="No KPI Achievements found"
              description={`No KPI has an Achievement record for ${MONTHS[month - 1]} ${year} in this selection.`}
            />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {rows.map((row) => (
            <BreakdownKpiCard
              key={row.kpiId}
              row={row}
              open={!!openKpiId[row.kpiId]}
              onToggle={() => setOpenKpiId((prev) => ({ ...prev, [row.kpiId]: !prev[row.kpiId] }))}
              onAddOrEdit={() => goToBreakdown(row)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
