import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@shared/components/Button/Button";
import { Badge } from "@shared/components/Badge/Badge";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { useAlignmentSession } from "../hooks/useAlignmentSession";
import { AddStakeholderDialog } from "../components/AddStakeholderDialog";
import type { AlignmentStakeholder } from "../models/alignmentStakeholder";

const STATE_BADGE = { NotStarted: "draft", Done: "approved", Cancelled: "rejected" } as const;

export function AlignmentSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, reload, markDone, cancel, addStakeholder } = useAlignmentSession(id!);
  const [addingStakeholder, setAddingStakeholder] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading label="Loading alignment session…" />;
  if (error || !data) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;

  const { session, stakeholders } = data;
  const locked = session.state === "Done" || session.state === "Cancelled";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<AlignmentStakeholder>[] = [
    { key: "person", header: "Person", render: (s) => s.stakeholderName ?? "—" },
    { key: "dept", header: "Department", render: (s) => s.departmentName ?? "—" },
    { key: "added", header: "Added", render: (s) => (s.createdOn ? new Date(s.createdOn).toLocaleDateString() : "—") },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h3 style={{ margin: 0 }}>Alignment — {session.strategyName ?? "(strategy)"}</h3>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {session.reasonLabel} · Requested by {session.createdByName ?? "—"} · {session.createdOn ? new Date(session.createdOn).toLocaleString() : "—"}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Badge status={STATE_BADGE[session.state]}>{session.state === "NotStarted" ? "Not Started" : session.state}</Badge>
        </div>
        <div className="card-body">
          {locked && <div className="alert alert-info">This session is locked and cannot be edited.</div>}

          <div className="section-label">Needed stakeholders ({stakeholders.length})</div>
          {stakeholders.length === 0 ? (
            <div className="hint">No stakeholders added yet.</div>
          ) : (
            <DataTable columns={columns} rows={stakeholders} rowKey={(s) => s.id} />
          )}
          {!locked && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <Button size="sm" onClick={() => setAddingStakeholder(true)}>
                + Add stakeholder
              </Button>
            </div>
          )}
        </div>
        <div className="card-foot">
          <Button onClick={() => navigate("/strategy-formulation/alignment")}>Back</Button>
          <div style={{ flex: 1 }} />
          {session.state !== "Done" && (
            <Button variant="accent" disabled={busy} onClick={() => run(markDone)}>
              Mark Done
            </Button>
          )}
          {session.state === "NotStarted" && (
            <Button variant="danger" disabled={busy} onClick={() => run(cancel)}>
              Cancel session
            </Button>
          )}
          {session.strategyId && (
            <Button onClick={() => navigate(`/strategy-formulation/${session.strategyId}`)}>Open strategy</Button>
          )}
        </div>
      </div>

      {addingStakeholder && (
        <AddStakeholderDialog
          existingStakeholderIds={stakeholders.map((s) => s.stakeholderId).filter((x): x is string => !!x)}
          onAdd={addStakeholder}
          onClose={() => setAddingStakeholder(false)}
        />
      )}
    </div>
  );
}
