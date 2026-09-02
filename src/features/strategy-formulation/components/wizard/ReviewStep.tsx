import { useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { Modal } from "@shared/components/Modal/Modal";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import type { StrategyWizard } from "../../hooks/useStrategyWizard";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { useItemImpactSummaries, type ItemImpactSummary } from "../../hooks/useItemImpactSummaries";
import { validateForSubmit } from "../../services/workflowService";
import { useOptions } from "../../hooks/useOptions";
import { listDepartments } from "../../services/referenceDataService";
import { listObjectiveDepartments } from "../../services/objectiveDepartmentService";
import { listOperationalStrategies } from "../../services/strategyService";
import { StatusBadge } from "../StatusBadge";
import { DecisionLogList } from "../DecisionLogList";
import { CommentsPanel } from "../CommentsPanel";
import { RequestAlignmentDialog } from "../RequestAlignmentDialog";
import { isPendingReview, isLocked } from "../../constants/revisionStatus";
import { ItemRelationshipCard, buildRelationshipTrail } from "./ItemRelationshipCard";
import type { Tactic } from "../../models/tactic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ImpactRollupRow {
  id: string;
  kind: "Tactic" | "Poc";
  name: string;
  kpiName?: string;
  financialModelName?: string;
  impact?: ItemImpactSummary["lastImpact"];
}

function ReviewRow({ label, children, dim }: { label: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div className="review-row">
      <span className="k">{label}</span>
      <span className={`v${dim ? " dim" : ""}`}>{children}</span>
    </div>
  );
}

export function ReviewStep({ wizard }: { wizard: StrategyWizard }) {
  const { state, isServiceTrack } = wizard;
  const strategyId = state.strategyId;
  const workflow = useWorkflowActions(strategyId, wizard.setRevisionStatus);
  const [requestingAlignment, setRequestingAlignment] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const departments = useOptions(listDepartments, []);
  const objectiveDepartments = useOptions(listObjectiveDepartments, []);
  const operationalStrategies = useOptions(listOperationalStrategies, []);
  const { summaries } = useItemImpactSummaries(state.tactics, state.pocs);

  function driverKpiNameFor(tactic: Tactic): string | undefined {
    return state.kpis.find((k) => k.kpiId === tactic.driverKpiId)?.kpiName;
  }

  const impactRollupRows: ImpactRollupRow[] = [
    ...state.tactics.map((t): ImpactRollupRow => ({
      id: t.id,
      kind: "Tactic",
      name: t.name ?? "",
      kpiName: t.strategyKpiName ?? t.kpiName,
      financialModelName: summaries.get(t.id)?.financialModelName,
      impact: summaries.get(t.id)?.lastImpact,
    })),
    ...state.pocs.map((p): ImpactRollupRow => ({
      id: p.id,
      kind: "Poc",
      name: p.name ?? "",
      kpiName: p.strategyKpiName ?? p.kpiName,
      financialModelName: summaries.get(p.id)?.financialModelName,
      impact: summaries.get(p.id)?.lastImpact,
    })),
  ].filter((r) => r.financialModelName || r.impact);

  const impactRollupColumns: Column<ImpactRollupRow>[] = [
    { key: "kind", header: "Type", render: (r) => <span className={`badge ${r.kind === "Tactic" ? "track-op" : "track-sv"}`}>{r.kind}</span> },
    { key: "name", header: "Tactic/POC", render: (r) => r.name || "—" },
    { key: "kpi", header: "KPI", render: (r) => r.kpiName ?? "—" },
    { key: "model", header: "Financial Model", render: (r) => r.financialModelName ?? "—" },
    { key: "period", header: "Period", render: (r) => (r.impact?.month ? `${MONTHS[r.impact.month - 1]} ${r.impact.year}` : "—") },
    { key: "value", header: "Driver New Value", render: (r) => <span className="mono">{r.impact?.driverNewValue?.toLocaleString() ?? "—"}</span> },
  ];

  if (!strategyId) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="alert alert-warn">Save the strategy through the earlier steps before reviewing.</div>
        </div>
      </div>
    );
  }

  const errors = validateForSubmit({
    draft: state.core,
    isServiceTrack,
    processId: state.core.processId,
    kpis: state.kpis,
    tacticsCount: state.tactics.length,
    pocsCount: state.pocs.length,
  });

  const status = state.revisionStatus;
  const canSubmit = status === "Draft" || status === "ChangesRequested" || status === "Rejected" || status === "Reopened";
  const canDecide = isPendingReview(status);
  const canReopen = status === "Approved" || status === "Rejected";
  const readOnly = isLocked(status);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Review &amp; Submit</h3>
      </div>
      <div className="card-body">
        <ReviewRow label="Track">
          <span className={`badge ${isServiceTrack ? "track-sv" : "track-op"}`}>{isServiceTrack ? "Service" : "Operational"}</span>
        </ReviewRow>
        <ReviewRow label="Strategy" dim={!state.core.name}>
          {state.core.name || "—"}
        </ReviewRow>
        {isServiceTrack ? (
          <>
            <ReviewRow label="Supports" dim={!state.core.supportedStrategyId}>
              {operationalStrategies.find((s) => s.id === state.core.supportedStrategyId)?.name ?? "—"}
            </ReviewRow>
            <ReviewRow label="Function" dim={!state.core.departmentId}>
              {departments.find((d) => d.id === state.core.departmentId)?.label ?? "—"}
            </ReviewRow>
          </>
        ) : (
          <>
            <ReviewRow label="Objective" dim={!state.core.objectiveDepartmentId}>
              {objectiveDepartments.find((o) => o.id === state.core.objectiveDepartmentId)?.label ?? "—"}
            </ReviewRow>
            <ReviewRow label="Department" dim={!state.core.departmentId}>
              {departments.find((d) => d.id === state.core.departmentId)?.label ?? "—"}
            </ReviewRow>
          </>
        )}
        <ReviewRow label="KPIs" dim={state.kpis.length === 0}>
          {state.kpis.length === 0
            ? "—"
            : state.kpis.map((k) => (
                <div className="item-line" key={k.id}>
                  {k.kpiName} <span className={`kpi-role ${k.role.toLowerCase()}`}>{k.role}</span>
                </div>
              ))}
        </ReviewRow>

        <div className="section-label">Tactics</div>
        {state.tactics.length === 0 ? (
          <div className="empty-state">
            <h4>No tactics</h4>
          </div>
        ) : (
          state.tactics.map((t) => (
            <ItemRelationshipCard
              key={t.id}
              kind="Tactic"
              name={t.name ?? ""}
              trail={buildRelationshipTrail(t.strategyKpiName ?? t.kpiName, driverKpiNameFor(t), summaries.get(t.id)?.financialModelName)}
              hasImpact={!!summaries.get(t.id)?.hasImpact}
              stats={[
                { label: "Current → Target", value: `${t.currentBaseline ?? "—"} → ${t.target}` },
                { label: "Deadline", value: t.deadline ?? "—" },
              ]}
            />
          ))
        )}

        <div className="section-label" style={{ marginTop: 20 }}>POCs</div>
        {state.pocs.length === 0 ? (
          <div className="empty-state">
            <h4>No POCs</h4>
          </div>
        ) : (
          state.pocs.map((p) => (
            <ItemRelationshipCard
              key={p.id}
              kind="Poc"
              name={p.name ?? ""}
              trail={buildRelationshipTrail(p.strategyKpiName ?? p.kpiName, undefined, summaries.get(p.id)?.financialModelName)}
              hasImpact={!!summaries.get(p.id)?.hasImpact}
              stats={[
                { label: "Target", value: p.kpiTargetValue ?? "—" },
                { label: "Due", value: p.successDueDate ?? "—" },
                { label: "Project", value: p.projectName ?? "Not linked yet" },
              ]}
            />
          ))
        )}

        <div className="section-label" style={{ marginTop: 20 }}>Financial Models &amp; Calculated Impact</div>
        {impactRollupRows.length === 0 ? (
          <div className="empty-state">
            <h4>No Impact applied yet</h4>
            <p>Open a Tactic or POC's own "Impact" action in the previous step to link a Financial Model and apply one.</p>
          </div>
        ) : (
          <DataTable columns={impactRollupColumns} rows={impactRollupRows} rowKey={(r) => r.id} />
        )}

        <div className="section-label">Governance</div>
        <StatusBadge status={status} />

        {readOnly && (
          <div className="alert alert-info" style={{ marginTop: 16 }}>
            This strategy is locked while {status === "Approved" ? "approved" : "pending review"}.
          </div>
        )}
        {errors.length > 0 && canSubmit && (
          <div className="alert alert-warn" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 6 }}>
              <b>Cannot submit yet — missing or incomplete information:</b>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {workflow.error && (
          <div className="alert alert-warn" style={{ marginTop: 16 }}>
            {workflow.error}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 20 }}>
          {canSubmit && (
            <Button variant="primary" disabled={errors.length > 0 || workflow.busy} onClick={workflow.submit}>
              Submit for Review
            </Button>
          )}
          {canDecide && (
            <>
              <Button variant="accent" disabled={workflow.busy} onClick={workflow.approve}>
                Approve
              </Button>
              <Button
                disabled={workflow.busy}
                onClick={() => {
                  const noteText = window.prompt("Note for the change request:") ?? "";
                  if (noteText) workflow.requestChanges(noteText);
                }}
              >
                Request Changes
              </Button>
              <Button
                variant="danger"
                disabled={workflow.busy}
                onClick={() => {
                  const rationale = window.prompt("Rejection rationale (required):") ?? "";
                  if (rationale.trim()) workflow.reject(rationale);
                }}
              >
                Reject
              </Button>
            </>
          )}
          {canReopen && (
            <Button
              disabled={workflow.busy}
              onClick={() => {
                const note = window.prompt("What needs to change? (required to reopen):") ?? "";
                if (note.trim()) workflow.reopen(note);
              }}
            >
              Reopen
            </Button>
          )}
          <Button disabled={workflow.busy} onClick={() => setRequestingAlignment(true)}>
            Request Alignment Session
          </Button>
          <Button onClick={() => setActivityOpen(true)}>Comments &amp; Change Requests</Button>
        </div>
      </div>
      <div className="card-foot">
        <Button onClick={wizard.goBack}>Back</Button>
        <div />
      </div>

      {activityOpen && (
        <Modal title="Comments & Change Requests" onClose={() => setActivityOpen(false)} wide footer={<Button onClick={() => setActivityOpen(false)}>Close</Button>}>
          <div className="section-label" style={{ marginTop: 0 }}>Decision Log</div>
          <DecisionLogList strategyId={strategyId} />
          <div className="section-label">Comments</div>
          <CommentsPanel strategyId={strategyId} changeRequestBlocked={status === "Approved" || status === "Rejected"} />
        </Modal>
      )}
      {requestingAlignment && (
        <RequestAlignmentDialog
          strategyId={strategyId}
          strategyName={state.core.name}
          onCreated={() => {}}
          onClose={() => setRequestingAlignment(false)}
        />
      )}
    </div>
  );
}
