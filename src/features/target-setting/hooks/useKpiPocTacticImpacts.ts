import { useEffect, useState, useCallback } from "react";
import {
  listStrategyKpisByKpi,
  listPocsByStrategyKpis,
  listTacticsByStrategyKpis,
  listPocsByIds,
  listTacticsByIds,
  findPocIdsWithImpactOnKpi,
  findTacticIdsWithImpactOnKpi,
  getStrategyKpiById,
  fetchUnassignedItems,
  useItemImpactSummaries,
  type Poc,
  type Tactic,
  type UnassignedItem,
  type ItemImpactSummary,
} from "@features/strategy-formulation";

export interface ConnectedContribution {
  kind: "Poc" | "Tactic";
  item: Poc | Tactic;
  strategyId: string;
  summary: ItemImpactSummary;
}

/** Already has a Strategy-KPI link, but no Financial Model/Impact yet — the real strategyId is already known. */
export interface EligibleClustered {
  source: "clustered";
  kind: "Poc" | "Tactic";
  item: Poc | Tactic;
  strategyId: string;
}

/** A Bottom-Up item directly on this KPI, not yet clustered into any Strategy — picking it requires a Strategy-picker step first. */
export interface EligibleUnclustered {
  source: "unclustered";
  kind: "Poc" | "Tactic";
  item: UnassignedItem;
}

export type EligibleCandidate = EligibleClustered | EligibleUnclustered;

interface Candidates {
  tactics: Tactic[];
  pocs: Poc[];
  strategyIdByJunction: Map<string, string>;
  unclustered: UnassignedItem[];
}

const EMPTY_CANDIDATES: Candidates = { tactics: [], pocs: [], strategyIdByJunction: new Map(), unclustered: [] };

/**
 * For one KPI (Top-down Annual's own selected entity, when it's a KPI): every Tactic/POC already
 * connected to it via a Financial Model/Impact (`connected` — feeds the "POCs / Tactics" stacked
 * contributions panel), and every Tactic/POC that's eligible to be newly linked but isn't yet
 * (`eligible` — feeds "Use existing POC/Tactic", already excluding anything in `connected`).
 *
 * Eligibility = directly on this KPI, or on a Strategy whose own Strategy-KPI links to this KPI.
 * An unclustered (Bottom-Up) item can never already have a Financial Model/Impact — that flow
 * requires a real strategyId — so it's always eligible, never connected.
 *
 * A Tactic/POC's own Related KPI (stf_strategykpi, the junction this KPI lookup is keyed on) can
 * differ from the KPI its Impact rows are actually for — a POC's Related KPI is its Driver KPI, but
 * a Financial Model's calculated result can land on an entirely different KPI (and a Tactic's own
 * Driver KPI, pm_driverkpi, is independent of its Related KPI too). So the Related-KPI junction
 * lookup alone misses any item connected to this KPI only through its Impact rows — findPocIds/
 * findTacticIdsWithImpactOnKpi below is the other half, finding items by what they actually produced.
 */
export function useKpiPocTacticImpacts(kpiId: string | undefined, businessUnitId?: string) {
  const [candidates, setCandidates] = useState<Candidates>(EMPTY_CANDIDATES);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!kpiId) {
      setCandidates(EMPTY_CANDIDATES);
      return;
    }
    setLoadingCandidates(true);
    (async () => {
      const strategyKpis = await listStrategyKpisByKpi(kpiId);
      const junctionIds = strategyKpis.map((k) => k.id);
      const strategyIdByJunction = new Map(strategyKpis.map((k) => [k.id, k.strategyId ?? ""]));
      const [tactics, pocs, unassigned, extraPocIds, extraTacticIds] = await Promise.all([
        listTacticsByStrategyKpis(junctionIds),
        listPocsByStrategyKpis(junctionIds),
        fetchUnassignedItems(),
        findPocIdsWithImpactOnKpi(kpiId),
        findTacticIdsWithImpactOnKpi(kpiId),
      ]);
      if (cancelled) return;

      const knownPocIds = new Set(pocs.map((p) => p.id));
      const knownTacticIds = new Set(tactics.map((t) => t.id));
      const [extraPocs, extraTactics] = await Promise.all([
        listPocsByIds(extraPocIds.filter((id) => !knownPocIds.has(id))),
        listTacticsByIds(extraTacticIds.filter((id) => !knownTacticIds.has(id))),
      ]);
      if (cancelled) return;

      // These extras weren't found via this KPI's own junctions, so their own Related-KPI junction
      // isn't in strategyIdByJunction yet either — resolve each one directly (same lookup
      // PocImpactDialog uses for the identical "prop doesn't cover this junction" gap).
      const extraJunctionIds = Array.from(
        new Set([...extraPocs.map((p) => p.strategyKpiId), ...extraTactics.map((t) => t.strategyKpiId)].filter(Boolean))
      );
      const extraJunctions = await Promise.all(extraJunctionIds.map((id) => getStrategyKpiById(id)));
      if (cancelled) return;
      for (const j of extraJunctions) {
        if (j) strategyIdByJunction.set(j.id, j.strategyId ?? "");
      }

      setCandidates({
        tactics: [...tactics, ...extraTactics],
        pocs: [...pocs, ...extraPocs],
        strategyIdByJunction,
        unclustered: unassigned.filter((i) => i.kpiId === kpiId),
      });
    })().finally(() => {
      if (!cancelled) setLoadingCandidates(false);
    });
    return () => {
      cancelled = true;
    };
  }, [kpiId, reloadTick]);

  const { summaries, loading: loadingSummaries } = useItemImpactSummaries(candidates.tactics, candidates.pocs);

  /**
   * A single Tactic/POC can carry impact rows for more than one KPI and month at once — a POC's
   * Apply cycle writes one row for its own Driver KPI plus one per other KPI the Financial Model
   * affects (see upsertPocImpactMonth), across every month in the cycle. useItemImpactSummaries'
   * own `lastImpact` just takes the latest row by month across ALL of those, regardless of which
   * KPI it's for — fine for a generic "has this ever had an impact" summary, but wrong here: this
   * hook is scoped to one specific KPI, so the contribution shown must be the row that actually
   * matches it, not whichever unrelated KPI/month happened to sort last. Falls back to `undefined`
   * (not the generic lastImpact) when nothing matches — the caller's own month/KPI filtering already
   * treats a missing lastImpact as "nothing to show for this period", which is the correct read here.
   * Also scoped to `businessUnitId` when given, same reasoning — a Region = Group POC's Apply cycle
   * keys its rows by BU too (see upsertPocImpactMonth's keyByBu), so more than one BU's own row can
   * otherwise sort in as "the" match for this KPI/month.
   */
  function impactForKpi(summary: ReturnType<typeof summaries.get>, forKpiId: string | undefined) {
    if (!forKpiId) return undefined;
    const matches = (summary?.allImpacts ?? []).filter(
      (i) => i.kpiId === forKpiId && (!businessUnitId || i.buId === businessUnitId)
    );
    return matches[matches.length - 1];
  }

  const connected: ConnectedContribution[] = [];
  const eligible: EligibleCandidate[] = [];

  for (const t of candidates.tactics) {
    const summary = summaries.get(t.id);
    const strategyId = candidates.strategyIdByJunction.get(t.strategyKpiId) ?? "";
    if (summary && (summary.hasImpact || summary.financialModelId)) {
      connected.push({ kind: "Tactic", item: t, strategyId, summary: { ...summary, lastImpact: impactForKpi(summary, kpiId) } });
    } else {
      eligible.push({ source: "clustered", kind: "Tactic", item: t, strategyId });
    }
  }
  for (const p of candidates.pocs) {
    const summary = summaries.get(p.id);
    const strategyId = candidates.strategyIdByJunction.get(p.strategyKpiId) ?? "";
    if (summary && (summary.hasImpact || summary.financialModelId)) {
      connected.push({ kind: "Poc", item: p, strategyId, summary: { ...summary, lastImpact: impactForKpi(summary, kpiId) } });
    } else {
      eligible.push({ source: "clustered", kind: "Poc", item: p, strategyId });
    }
  }
  for (const u of candidates.unclustered) {
    eligible.push({ source: "unclustered", kind: u.kind, item: u });
  }

  const reload = useCallback(() => setReloadTick((x) => x + 1), []);

  return { connected, eligible, loading: loadingCandidates || loadingSummaries, reload };
}
