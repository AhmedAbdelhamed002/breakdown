import { LedgerService } from "@infrastructure/financialImpact/LedgerService";
import {
  listStrategyKpisByKpi,
  listPocsByStrategyKpis,
  listTacticsByStrategyKpis,
  listPocsByIds,
  listTacticsByIds,
  findPocIdsWithImpactOnKpi,
  findTacticIdsWithImpactOnKpi,
  type Poc,
  type Tactic,
} from "@features/strategy-formulation";

export interface KpiPocsAndTactics {
  pocs: Poc[];
  tactics: Tactic[];
}

/**
 * Every POC/Tactic connected to a KPI, discovered both ways — same dual-path logic already proven in
 * Overview (gap)'s own fix (useKpiPocTacticImpacts.ts): a POC/Tactic can be connected via its own
 * Related KPI (the Strategy-KPI junction) or purely through what its Impact rows actually touch,
 * which can be a different KPI entirely (e.g. a Financial Model's calculated result). Neither path
 * alone is reliable on its own.
 */
export async function getPocsAndTacticsForKpi(kpiId: string): Promise<KpiPocsAndTactics> {
  if (!kpiId) return { pocs: [], tactics: [] };
  const strategyKpis = await listStrategyKpisByKpi(kpiId);
  const junctionIds = strategyKpis.map((k) => k.id);
  const [relatedPocs, relatedTactics, extraPocIds, extraTacticIds] = await Promise.all([
    listPocsByStrategyKpis(junctionIds),
    listTacticsByStrategyKpis(junctionIds),
    findPocIdsWithImpactOnKpi(kpiId),
    findTacticIdsWithImpactOnKpi(kpiId),
  ]);
  const knownPocIds = new Set(relatedPocs.map((p) => p.id));
  const knownTacticIds = new Set(relatedTactics.map((t) => t.id));
  const [extraPocs, extraTactics] = await Promise.all([
    listPocsByIds(extraPocIds.filter((id) => !knownPocIds.has(id))),
    listTacticsByIds(extraTacticIds.filter((id) => !knownTacticIds.has(id))),
  ]);
  return { pocs: [...relatedPocs, ...extraPocs], tactics: [...relatedTactics, ...extraTactics] };
}

/**
 * Every POC/Tactic actually driven by a Process KPI — a Process KPI is never a "Related KPI" a
 * POC/Tactic clusters under (that's always its Output/Outcome), only ever a Driver, so this only
 * needs the Impact-row path, not the Strategy-KPI junction one above.
 */
export async function getPocsAndTacticsDrivenByProcessKpi(processKpiId: string): Promise<KpiPocsAndTactics> {
  if (!processKpiId) return { pocs: [], tactics: [] };
  const [pocIds, tacticIds] = await Promise.all([
    findPocIdsWithImpactOnKpi(processKpiId),
    findTacticIdsWithImpactOnKpi(processKpiId),
  ]);
  const [pocs, tactics] = await Promise.all([listPocsByIds(pocIds), listTacticsByIds(tacticIds)]);
  return { pocs, tactics };
}

export interface KpiAchievement {
  target: number | null;
  actual: number | null;
  /** Actual as a percentage of Target, rounded to 1 decimal — null when either figure is missing. */
  pct: number | null;
  /** One of the app's existing badge classes (st-approved/st-submitted/st-returned/st-draft), for a
   * plain achievement badge on KPI types Overview (gap)'s own formula doesn't apply to. */
  cls: string;
}

/** Target vs Actual for one KPI/BU/Month/Year — a simple achievement badge for Process/Outcome KPI
 * cards, which don't run Overview (gap)'s own needed-growth formula. */
export async function getKpiAchievement(kpiId: string, businessUnitId: string, month: number, year: number): Promise<KpiAchievement> {
  if (!kpiId || !businessUnitId) return { target: null, actual: null, pct: null, cls: "st-draft" };
  const ledger = await LedgerService.getLedger({ kind: "kpi", id: kpiId }, businessUnitId, year);
  const entry = ledger.months.find((m) => m.month === month);
  const target = entry?.target ?? null;
  const actual = entry?.actual ?? null;
  const pct = target ? actual != null ? Math.round((actual / target) * 1000) / 10 : null : null;
  const cls = pct == null ? "st-draft" : pct >= 98 ? "st-approved" : pct >= 80 ? "st-submitted" : "st-returned";
  return { target, actual, pct, cls };
}
