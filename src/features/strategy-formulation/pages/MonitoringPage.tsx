import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { Badge, type BadgeStatus } from "@shared/components/Badge/Badge";
import { useMonitoringOverview } from "../hooks/useMonitoringOverview";
import { StatusBadge } from "../components/StatusBadge";
import type { MonitoringOverviewRow, StrategyMonitoringSnapshot } from "../services/strategyMonitoringService";

type OverallFilter = "all" | StrategyMonitoringSnapshot["overall"];

const OVERALL_BADGE: Record<StrategyMonitoringSnapshot["overall"], { label: string; status: BadgeStatus }> = {
  "on-track": { label: "On Track", status: "approved" },
  watch: { label: "Needs Attention", status: "review" },
  gap: { label: "Gaps Found", status: "rejected" },
};

/** The org-wide read on whether each strategy is succeeding or has gaps — combines Outcome KPI standing, Impact coverage, and approval-workflow stall (see strategyMonitoringService.ts). */
export function MonitoringPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useMonitoringOverview();
  const [search, setSearch] = useState("");
  const [overall, setOverall] = useState<OverallFilter>("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((row) => {
      if (overall !== "all" && row.snapshot.overall !== overall) return false;
      if (search) {
        const haystack = [row.strategy.name, row.strategy.departmentName].join(" ").toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, search, overall]);

  const columns: Column<MonitoringOverviewRow>[] = [
    {
      key: "strategy",
      header: "Strategy",
      render: (r) => (
        <div>
          <div>{r.strategy.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.strategy.departmentName ?? "—"}</div>
        </div>
      ),
    },
    { key: "status", header: "Workflow", render: (r) => <StatusBadge status={r.strategy.revisionStatus} /> },
    {
      key: "outcome",
      header: "Outcome KPI",
      render: (r) =>
        !r.snapshot.outcome || r.snapshot.outcome.actual == null || r.snapshot.outcome.target == null ? (
          <span className="muted">No data</span>
        ) : (
          <span className="mono">
            {r.snapshot.outcome.actual} / {r.snapshot.outcome.target}
          </span>
        ),
    },
    {
      key: "impact",
      header: "Impact coverage",
      render: (r) =>
        r.snapshot.impact.totalItems === 0 ? (
          <span className="muted">No items</span>
        ) : (
          `${r.snapshot.impact.itemsWithImpact}/${r.snapshot.impact.totalItems}`
        ),
    },
    {
      key: "workflow",
      header: "Days in status",
      render: (r) => (r.snapshot.workflow.daysSinceLastAction != null ? `${r.snapshot.workflow.daysSinceLastAction}d` : "—"),
    },
    {
      key: "overall",
      header: "Overall",
      render: (r) => {
        const b = OVERALL_BADGE[r.snapshot.overall];
        return <Badge status={b.status}>{b.label}</Badge>;
      },
    },
  ];

  if (loading) return <Loading label="Loading monitoring data…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <h3>Strategy Monitoring</h3>
        </div>
        <div className="card-body">
          <div className="filter-grid">
            <input className="inp" type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="inp" value={overall} onChange={(e) => setOverall(e.target.value as OverallFilter)}>
              <option value="all">All strategies</option>
              <option value="on-track">On Track</option>
              <option value="watch">Needs Attention</option>
              <option value="gap">Gaps Found</option>
            </select>
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No strategies match" description="Try widening your filters." />
          ) : (
            <DataTable columns={columns} rows={filtered} rowKey={(r) => r.strategy.id} onRowClick={(r) => navigate(`/strategy-formulation/execution/${r.strategy.id}`)} />
          )}
        </div>
      </div>
    </div>
  );
}
