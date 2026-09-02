import { Pm_pocimpactsService } from "@generated/services/Pm_pocimpactsService";
import { Pm_tacticimpactsService } from "@generated/services/Pm_tacticimpactsService";
import { Stf_decisionlogsService } from "@generated/services/Stf_decisionlogsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { LedgerService } from "@infrastructure/financialImpact/LedgerService";
import { listAllStrategyKpisGrouped } from "./strategyKpiService";
import { getPocImpactRecordsForPoc } from "./pocImpactService";
import { getTacticImpactRecordsForTactic } from "./tacticImpactService";
import { loadExecutionData, type ExecItem } from "./execTrackingService";
import type { Strategy } from "../models/strategy";
import type { StrategyKpi } from "../models/strategyKpi";

export type SignalLevel = "good" | "warning" | "unknown";

export interface StrategyImpactRow {
  id: string;
  itemId: string;
  itemKind: "Tactic" | "Poc";
  itemName?: string;
  kpiName?: string;
  month?: number;
  year?: number;
  driverNewValue?: number;
  summary?: string;
}

/** Every Impact record across every Tactic/POC this strategy owns — the roll-up no single-item Impact dialog gives you. */
export async function listStrategyImpactRecords(items: ExecItem[]): Promise<StrategyImpactRow[]> {
  const perItem = await Promise.all(
    items.map(async (item) => {
      const records = item.kind === "Tactic" ? await getTacticImpactRecordsForTactic(item.id) : await getPocImpactRecordsForPoc(item.id);
      return records.map((r) => ({
        id: r.id,
        itemId: item.id,
        itemKind: item.kind,
        itemName: item.name,
        kpiName: item.kpiName,
        month: r.month,
        year: r.year,
        driverNewValue: r.driverNewValue,
        summary: r.summary,
      }));
    })
  );
  return perItem.flat().sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - ((b.year ?? 0) * 12 + (b.month ?? 0)));
}

export interface OutcomeStanding {
  kpiId: string;
  kpiName: string;
  actual: number | null;
  target: number | null;
  year: number;
  month: number;
}

/** Walks back up to 2 years (same convention as pocImpactService's resolveDriverAchievementMonth) to find the most recent month this KPI actually has a recorded actual or target for — never assumes the current month has been entered yet. */
async function resolveOutcomeStanding(kpiId: string, kpiName: string, businessUnitId: string, today: Date): Promise<OutcomeStanding> {
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  for (const year of [currentYear, currentYear - 1]) {
    const ledger = await LedgerService.getLedger({ kind: "kpi", id: kpiId }, businessUnitId, year);
    const startMonth = year === currentYear ? currentMonth : 12;
    for (let month = startMonth; month >= 1; month--) {
      const entry = ledger.months.find((m) => m.month === month);
      if (entry?.hasRecord && (entry.actual != null || entry.target != null)) {
        return { kpiId, kpiName, actual: entry.actual, target: entry.target, year, month };
      }
    }
  }
  return { kpiId, kpiName, actual: null, target: null, year: currentYear, month: currentMonth };
}

export interface ImpactCoverage {
  totalItems: number;
  itemsWithImpact: number;
  gaps: { id: string; kind: "Tactic" | "Poc"; name?: string }[];
}

export interface WorkflowStanding {
  status: Strategy["revisionStatus"];
  daysSinceLastAction: number | null;
  stalled: boolean;
}

export interface StrategyMonitoringSnapshot {
  strategyId: string;
  outcome: OutcomeStanding | null;
  outcomeSignal: SignalLevel;
  impact: ImpactCoverage;
  impactSignal: SignalLevel;
  workflow: WorkflowStanding;
  workflowSignal: SignalLevel;
  overall: "on-track" | "watch" | "gap";
}

/** A status pending Under Review/Changes Requested longer than this, with no further decision logged, reads as stalled. */
const STALL_THRESHOLD_DAYS = 14;

export interface MonitoringContext {
  pocIdsWithImpact: Set<string>;
  tacticIdsWithImpact: Set<string>;
  /** Most recent stf_decisionlogs timestamp per strategy id. */
  lastDecisionByStrategy: Map<string, string>;
  strategyKpisByStrategy: Map<string, StrategyKpi[]>;
}

/**
 * One bulk read each for Impact coverage and the decision log, shared across every strategy in a
 * single Monitoring computation — the org-wide view was originally built as one network call per
 * Tactic/POC per strategy (and one decision-log call per strategy on top), which flooded the
 * Dataverse connection and never finished for more than a handful of strategies. This mirrors the
 * "list everything once, join client-side" convention execTrackingService.loadExecutionData()
 * already uses for the same reason.
 */
export async function loadMonitoringContext(): Promise<MonitoringContext> {
  const [pocImpactRows, tacticImpactRows, decisionRows, strategyKpisByStrategy] = await Promise.all([
    resultOrThrow(await Pm_pocimpactsService.getAll({ select: ["pm_pocimpactid", "_pm_poc_value"] }), "List all POC impacts for coverage"),
    resultOrThrow(await Pm_tacticimpactsService.getAll({ select: ["pm_tacticimpactid", "_pm_tactic_value"] }), "List all Tactic impacts for coverage"),
    resultOrThrow(await Stf_decisionlogsService.getAll({ orderBy: ["createdon desc"] }), "List all decision logs"),
    listAllStrategyKpisGrouped(),
  ]);

  const lastDecisionByStrategy = new Map<string, string>();
  for (const r of decisionRows) {
    const strategyId = r._stf_parentstrategy_value;
    if (strategyId && r.stf_timestamp && !lastDecisionByStrategy.has(strategyId)) lastDecisionByStrategy.set(strategyId, r.stf_timestamp);
  }

  return {
    pocIdsWithImpact: new Set(pocImpactRows.map((r) => r._pm_poc_value).filter((id): id is string => !!id)),
    tacticIdsWithImpact: new Set(tacticImpactRows.map((r) => r._pm_tactic_value).filter((id): id is string => !!id)),
    lastDecisionByStrategy,
    strategyKpisByStrategy,
  };
}

/**
 * Combines three independent signals into one read on whether a Strategy is succeeding or has
 * gaps — none of this is tracked as a stored field anywhere; it's computed fresh every time from
 * the same KPI ledger, Impact, and decision-log data the rest of the app already writes to.
 * `context` is optional only for a single-strategy caller (e.g. the Execution Strategy page); the
 * org-wide list always passes one shared context computed once (see listMonitoringSnapshots).
 */
export async function getStrategyMonitoringSnapshot(
  strategy: Strategy,
  items: ExecItem[],
  today: Date = new Date(),
  context?: MonitoringContext
): Promise<StrategyMonitoringSnapshot> {
  const ctx = context ?? (await loadMonitoringContext());
  const strategyKpis = ctx.strategyKpisByStrategy.get(strategy.id) ?? [];

  // Outcome KPI standing
  const outcomeKpi = strategyKpis.find((k) => k.role === "Outcome");
  const outcome =
    outcomeKpi && strategy.businessUnitId ? await resolveOutcomeStanding(outcomeKpi.kpiId, outcomeKpi.kpiName, strategy.businessUnitId, today) : null;
  const outcomeSignal: SignalLevel =
    !outcome || outcome.actual == null || outcome.target == null ? "unknown" : outcome.actual >= outcome.target ? "good" : "warning";

  // Impact coverage — a plain Set lookup per item, no network call.
  const gaps = items
    .filter((item) => !(item.kind === "Tactic" ? ctx.tacticIdsWithImpact.has(item.id) : ctx.pocIdsWithImpact.has(item.id)))
    .map((item) => ({ id: item.id, kind: item.kind, name: item.name }));
  const impact: ImpactCoverage = { totalItems: items.length, itemsWithImpact: items.length - gaps.length, gaps };
  const impactSignal: SignalLevel = items.length === 0 ? "unknown" : gaps.length === 0 ? "good" : "warning";

  // Workflow stall
  const lastAction = ctx.lastDecisionByStrategy.get(strategy.id);
  const daysSinceLastAction = lastAction ? Math.floor((today.getTime() - new Date(lastAction).getTime()) / 86_400_000) : null;
  const inReview = strategy.revisionStatus === "UnderReview" || strategy.revisionStatus === "ChangesRequested";
  const stalled = inReview && daysSinceLastAction != null && daysSinceLastAction > STALL_THRESHOLD_DAYS;
  const workflow: WorkflowStanding = { status: strategy.revisionStatus, daysSinceLastAction, stalled };
  const workflowSignal: SignalLevel = stalled ? "warning" : "good";

  const warnings = [outcomeSignal, impactSignal, workflowSignal].filter((s) => s === "warning").length;
  const overall = warnings === 0 ? "on-track" : warnings === 1 ? "watch" : "gap";

  return { strategyId: strategy.id, outcome, outcomeSignal, impact, impactSignal, workflow, workflowSignal, overall };
}

export interface MonitoringOverviewRow {
  strategy: Strategy;
  items: ExecItem[];
  snapshot: StrategyMonitoringSnapshot;
}

/** Every strategy with its monitoring snapshot computed — the org-wide "who's on track, who has gaps" view. */
export async function listMonitoringSnapshots(): Promise<MonitoringOverviewRow[]> {
  const [data, context] = await Promise.all([loadExecutionData(), loadMonitoringContext()]);
  const snapshots = await Promise.all(data.map((d) => getStrategyMonitoringSnapshot(d.strategy, d.items, new Date(), context)));
  return data.map((d, i) => ({ strategy: d.strategy, items: d.items, snapshot: snapshots[i] }));
}
