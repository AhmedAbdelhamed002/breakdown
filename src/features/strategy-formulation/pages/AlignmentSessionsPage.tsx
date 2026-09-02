import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/Button/Button";
import { Badge } from "@shared/components/Badge/Badge";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { useAsync } from "@shared/hooks/useAsync";
import { listAlignmentSessions } from "../services/alignmentSessionService";
import { listStrategies } from "../services/strategyService";
import { RequestAlignmentDialog } from "../components/RequestAlignmentDialog";
import type { AlignmentSession } from "../models/alignmentSession";

interface Row extends AlignmentSession {
  departmentName?: string;
  functionName?: string;
}

const STATE_BADGE = { NotStarted: "draft", Done: "approved", Cancelled: "rejected" } as const;

export function AlignmentSessionsPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync<Row[]>(async () => {
    const [sessions, strategies] = await Promise.all([listAlignmentSessions(), listStrategies()]);
    const strategyById = new Map(strategies.map((s) => [s.id, s]));
    return sessions.map((s) => {
      const strat = s.strategyId ? strategyById.get(s.strategyId) : undefined;
      return { ...s, departmentName: strat?.departmentName, functionName: strat?.functionName };
    });
  }, []);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const term = search.toLowerCase();
    return data.filter((r) =>
      [r.strategyName, r.departmentName, r.functionName, r.reasonLabel, r.createdByName].join(" ").toLowerCase().includes(term)
    );
  }, [data, search]);

  const columns: Column<Row>[] = [
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
    { key: "reason", header: "Reason", render: (r) => r.reasonLabel ?? "—" },
    { key: "state", header: "Status", render: (r) => <Badge status={STATE_BADGE[r.state]}>{r.state === "NotStarted" ? "Not Started" : r.state}</Badge> },
    { key: "by", header: "Requested by", render: (r) => r.createdByName ?? "—" },
    { key: "when", header: "When", render: (r) => (r.createdOn ? new Date(r.createdOn).toLocaleDateString() : "—") },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button size="sm" onClick={() => navigate(`/strategy-formulation/alignment/${r.id}`)}>
          Open ↗
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <h3>Alignment Sessions</h3>
          <div style={{ flex: 1 }} />
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Request Alignment
          </Button>
        </div>
        <div className="card-body">
          <input
            className="inp"
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 16, width: "100%" }}
          />
          {loading ? (
            <Loading label="Loading alignment sessions…" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No alignment sessions" description="Request one from a strategy's Review step, or the button above." />
          ) : (
            <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
          )}
        </div>
      </div>
      {creating && (
        <RequestAlignmentDialog
          onCreated={(session) => navigate(`/strategy-formulation/alignment/${session.id}`)}
          onClose={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
