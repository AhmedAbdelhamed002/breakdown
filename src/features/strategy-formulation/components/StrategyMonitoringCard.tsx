import { Badge, type BadgeStatus } from "@shared/components/Badge/Badge";
import { REVISION_STATUS_LABEL } from "../constants/revisionStatus";
import type { StrategyMonitoringSnapshot, SignalLevel } from "../services/strategyMonitoringService";

const OVERALL_BADGE: Record<StrategyMonitoringSnapshot["overall"], { label: string; status: BadgeStatus }> = {
  "on-track": { label: "On Track", status: "approved" },
  watch: { label: "Needs Attention", status: "review" },
  gap: { label: "Gaps Found", status: "rejected" },
};

const SIGNAL_DOT: Record<SignalLevel, string> = { good: "var(--success)", warning: "var(--warning)", unknown: "var(--text-muted)" };

function SignalRow({ level, label, detail }: { level: SignalLevel; label: string; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: SIGNAL_DOT[level], marginTop: 5, flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{detail}</div>
      </div>
    </div>
  );
}

/** The three signals combined into one read on whether a Strategy is succeeding or has gaps — see strategyMonitoringService.ts for how each is computed. */
export function StrategyMonitoringCard({ snapshot }: { snapshot: StrategyMonitoringSnapshot }) {
  const overall = OVERALL_BADGE[snapshot.overall];

  const outcomeDetail = !snapshot.outcome
    ? "No Outcome KPI, or no Business Unit set, to measure against."
    : snapshot.outcome.actual == null || snapshot.outcome.target == null
      ? `${snapshot.outcome.kpiName}: no Actual/Target recorded yet.`
      : `${snapshot.outcome.kpiName}: ${snapshot.outcome.actual} vs target ${snapshot.outcome.target} (${snapshot.outcome.month}/${snapshot.outcome.year}).`;

  const impactDetail =
    snapshot.impact.totalItems === 0
      ? "No Tactics/POCs yet."
      : snapshot.impact.gaps.length === 0
        ? `All ${snapshot.impact.totalItems} Tactic(s)/POC(s) have Impact applied.`
        : `${snapshot.impact.gaps.length} of ${snapshot.impact.totalItems} have no Impact applied yet: ${snapshot.impact.gaps.map((g) => g.name ?? g.kind).join(", ")}.`;

  const workflowDetail = snapshot.workflow.stalled
    ? `${REVISION_STATUS_LABEL[snapshot.workflow.status]} for ${snapshot.workflow.daysSinceLastAction} days with no further decision.`
    : `${REVISION_STATUS_LABEL[snapshot.workflow.status]}${snapshot.workflow.daysSinceLastAction != null ? ` — last decision ${snapshot.workflow.daysSinceLastAction}d ago.` : "."}`;

  return (
    <div className="card">
      <div className="card-head">
        <div className="between">
          <h3>Monitoring</h3>
          <Badge status={overall.status}>{overall.label}</Badge>
        </div>
      </div>
      <div className="card-body">
        <SignalRow level={snapshot.outcomeSignal} label="Outcome KPI" detail={outcomeDetail} />
        <SignalRow level={snapshot.impactSignal} label="Impact coverage" detail={impactDetail} />
        <SignalRow level={snapshot.workflowSignal} label="Approval workflow" detail={workflowDetail} />
      </div>
    </div>
  );
}
