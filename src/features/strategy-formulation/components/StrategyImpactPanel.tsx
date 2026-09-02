import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import type { StrategyImpactRow } from "../services/strategyMonitoringService";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(n: number | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

/** Every Impact record across this strategy's own Tactics/POCs, in one place — the roll-up no single-item Impact dialog gives you (see strategyMonitoringService.listStrategyImpactRecords). */
export function StrategyImpactPanel({ rows }: { rows: StrategyImpactRow[] }) {
  const columns: Column<StrategyImpactRow>[] = [
    { key: "kind", header: "Type", render: (r) => <span className={`badge ${r.itemKind === "Tactic" ? "track-op" : "track-sv"}`}>{r.itemKind}</span> },
    { key: "name", header: "Tactic/POC", render: (r) => r.itemName ?? "—" },
    { key: "kpi", header: "KPI", render: (r) => r.kpiName ?? "—" },
    { key: "period", header: "Period", render: (r) => (r.month ? `${MONTHS[r.month - 1]} ${r.year}` : "—") },
    { key: "value", header: "Driver New Value", render: (r) => <span className="mono">{fmt(r.driverNewValue)}</span> },
    { key: "detail", header: "Detail", render: (r) => <span className="muted" style={{ fontSize: 11.5 }}>{r.summary ?? "—"}</span> },
  ];

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <h4>No Impact applied yet</h4>
        <p>Open a Tactic or POC's own "Impact" action to link a Financial Model and apply one.</p>
      </div>
    );
  }

  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />;
}
