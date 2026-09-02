import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { useExecutionOverview } from "../hooks/useExecutionOverview";
import { StatusBadge } from "../components/StatusBadge";
import type { RevisionStatus } from "../constants/revisionStatus";
import type { ExecStrategyData } from "../services/execTrackingService";

type StatusFilter = "all" | RevisionStatus;

export function ExecutionTrackingPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useExecutionOverview();
  const [search, setSearch] = useState("");
  // Defaults to Approved-only, matching the legacy source's real initial filter (spec addendum item 21).
  const [status, setStatus] = useState<StatusFilter>("Approved");
  const [onlyNoTasks, setOnlyNoTasks] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((row) => {
      if (status !== "all" && row.strategy.revisionStatus !== status) return false;
      if (onlyNoTasks && row.taskCount > 0) return false;
      if (search) {
        const haystack = [row.strategy.name, row.strategy.departmentName].join(" ").toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, search, status, onlyNoTasks]);

  const columns: Column<ExecStrategyData>[] = [
    {
      key: "strategy",
      header: "Strategy",
      render: (r) => (
        <div>
          <div>{r.strategy.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {r.strategy.departmentName ?? "—"} {r.strategy.functionName && `· ${r.strategy.functionName}`}
          </div>
        </div>
      ),
    },
    { key: "track", header: "Track", render: (r) => <span className={`badge ${r.strategy.track === "Service" ? "track-sv" : "track-op"}`}>{r.strategy.track}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.strategy.revisionStatus} /> },
    { key: "tactics", header: "Tactics", render: (r) => r.items.filter((i) => i.kind === "Tactic").length },
    { key: "pocs", header: "POCs", render: (r) => r.items.filter((i) => i.kind === "Poc").length },
    { key: "tasks", header: "Tasks", render: (r) => (r.taskCount === 0 ? <span className="badge">0</span> : r.taskCount) },
    { key: "last", header: "Last task created", render: (r) => (r.lastTaskCreated ? new Date(r.lastTaskCreated).toLocaleDateString() : "—") },
  ];

  if (loading) return <Loading label="Loading strategy execution…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <h3>Strategy Execution</h3>
        </div>
        <div className="card-body">
          <div className="filter-grid">
            <input className="inp" type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="inp" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="UnderReview">Under Review</option>
              <option value="ChangesRequested">Changes Requested</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Reopened">Reopened</option>
            </select>
            <label className="chk">
              <input type="checkbox" checked={onlyNoTasks} onChange={(e) => setOnlyNoTasks(e.target.checked)} />
              Only strategies with no tasks
            </label>
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
