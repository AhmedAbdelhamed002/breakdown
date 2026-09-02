import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/Button/Button";
import { Badge } from "@shared/components/Badge/Badge";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { resolveCurrentUserId } from "@infrastructure/authentication/currentUser";
import { useChangeRequests, type ChangeRequestRow } from "../hooks/useChangeRequests";

type StatusFilter = "all" | "Open" | "Resolved";

export function ChangeRequestsPage() {
  const navigate = useNavigate();
  const { rows, loading, error, reload, resolve, reopen } = useChangeRequests();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (search) {
        const haystack = [r.strategyName, r.text, r.departmentName, r.functionName, r.authorName].join(" ").toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, status, search]);

  const openCount = filtered.filter((r) => r.status === "Open").length;

  async function handleResolve(row: ChangeRequestRow) {
    const actorId = await resolveCurrentUserId();
    if (!actorId) {
      setActionError("Cannot determine the signed-in user. This action requires the Power Platform host context.");
      return;
    }
    const response = window.prompt("Response (optional):") ?? undefined;
    setBusyId(row.id);
    setActionError(null);
    try {
      await resolve(row.id, row.strategyId, actorId, actorId, response || undefined);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReopen(row: ChangeRequestRow) {
    const actorId = await resolveCurrentUserId();
    if (!actorId) {
      setActionError("Cannot determine the signed-in user. This action requires the Power Platform host context.");
      return;
    }
    setBusyId(row.id);
    setActionError(null);
    try {
      await reopen(row.id, row.strategyId, actorId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to reopen");
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<ChangeRequestRow>[] = [
    {
      key: "strategy",
      header: "Strategy",
      render: (r) => (
        <div>
          <div>{r.strategyName ?? "(strategy)"}</div>
          {r.functionName && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.functionName}</div>}
        </div>
      ),
    },
    { key: "dept", header: "Department", render: (r) => r.departmentName ?? "—" },
    { key: "text", header: "Request", render: (r) => r.text },
    { key: "by", header: "Raised by", render: (r) => r.authorName ?? "—" },
    { key: "when", header: "Date", render: (r) => (r.createdOn ? new Date(r.createdOn).toLocaleString() : "—") },
    { key: "status", header: "Status", render: (r) => <Badge status={r.status === "Resolved" ? "approved" : "submitted"}>{r.status}</Badge> },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="btn-row">
          <Button size="sm" onClick={() => navigate(`/strategy-formulation/${r.strategyId}`)}>
            Open ↗
          </Button>
          {r.status === "Open" ? (
            <Button size="sm" variant="accent" disabled={busyId === r.id} onClick={() => handleResolve(r)}>
              Resolve
            </Button>
          ) : (
            <Button size="sm" disabled={busyId === r.id} onClick={() => handleReopen(r)}>
              Reopen
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <h3>Change Requests</h3>
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>
            {filtered.length} request(s) · {openCount} open
          </span>
        </div>
        <div className="card-body">
          <div className="filter-grid">
            <input className="inp" type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="inp" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="Open">Open</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
          {actionError && <div className="alert alert-warn">{actionError}</div>}
          {loading ? (
            <Loading label="Loading change requests…" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No change requests" description="Change requests raised from a strategy's Comments panel show up here." />
          ) : (
            <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
          )}
        </div>
      </div>
    </div>
  );
}
