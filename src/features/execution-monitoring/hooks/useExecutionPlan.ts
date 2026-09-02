import { useEffect, useState, useCallback } from "react";
import { EntityService, BreakdownService, type BreakdownRow } from "@features/target-setting";
import type { Poc, Tactic } from "@features/strategy-formulation";
import { getExpectedImpactByKpi, getKpiGapRow, type KpiGapRow } from "../services/gapAnalysisService";
import { getPocsAndTacticsForKpi, getPocsAndTacticsDrivenByProcessKpi, getKpiAchievement, type KpiAchievement } from "../services/executionPlanService";

const isOutputType = (t?: string) => t === "OutPut" || t === "Sub Output";
const isProcessType = (t?: string) => t === "Process" || t === "Sub Process";
// Outcome → Output → Process → everything else, matching the reference prototype's own grouping.
const TYPE_RANK: Record<string, number> = { OutCome: 0, "Sub Outcome": 1, OutPut: 2, "Sub Output": 3, Process: 4, "Sub Process": 5, Input: 6 };

export interface ExecutionPlanKpi {
  id: string;
  name: string;
  type?: string;
  isOutput: boolean;
  isProcess: boolean;
  /** Output KPIs only — read-only context (see the plan's own scope note: attachment is whole-KPI,
   * never scoped to one breakdown row — the Financial Impact system has no such concept). */
  breakdownRows: BreakdownRow[];
  /** This KPI's pm_kpiachievment row for the current BU/month/year (BreakdownService.getAnchor),
   * when one exists — linked onto any task created under this KPI's POCs/Tactics. */
  achievementId?: string;
  pocs: Poc[];
  tactics: Tactic[];
  /** Output KPIs — the same needed-growth/expected-impact/gap formula as Overview (gap). */
  gap?: KpiGapRow;
  /** Process/Outcome/other KPIs — a plain Target vs Actual achievement badge. */
  achievement?: KpiAchievement;
}

/**
 * Every KPI for the current Department/Function, grouped by type, each annotated with its
 * breakdown rows (Output only), its pm_kpiachievment anchor id for the current BU/month/year (any
 * type — linked onto tasks created under it), its connected POCs/Tactics (Output/Process only —
 * never rendered for other types, see ExecutionPlanTab's KpiCard, so it's skipped entirely there),
 * and its own achievement/gap figure.
 *
 * The POC/Tactic discovery underneath (getPocsAndTacticsForKpi/DrivenByProcessKpi) touches
 * pm_tacticimpacts, a "Connector"-bound data source proven in Overview (gap) to fail when called
 * concurrently across KPIs — so every KPI is still processed one at a time here (a plain for-loop),
 * never Promise.all across the whole list. Within one KPI's own iteration, though, the breakdown
 * fetch, POC/Tactic discovery, and gap/achievement fetch touch three unrelated data sources and are
 * independent of each other, so they're run via a single Promise.all — this does NOT reintroduce
 * concurrent pm_tacticimpacts calls, since only one KPI's POC/Tactic discovery is ever in flight at
 * a time (the for-loop still awaits the whole Promise.all before moving to the next KPI). The
 * Output-KPI impact sum (getExpectedImpactByKpi) is still batched once for every Output KPI up
 * front, same as Overview (gap) does, to avoid re-querying pm_pocimpacts once per KPI.
 */
export function useExecutionPlan(departmentId: string, functionId: string, businessUnitId: string, month: number, year: number) {
  const [kpis, setKpis] = useState<ExecutionPlanKpi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!departmentId) {
      setKpis([]);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      const raw = (await EntityService.getKpis(undefined, departmentId, functionId || undefined))
        .slice()
        .sort((a, b) => (TYPE_RANK[a.type ?? ""] ?? 9) - (TYPE_RANK[b.type ?? ""] ?? 9));

      const outputKpiIds = raw.filter((k) => isOutputType(k.type)).map((k) => k.id);
      const impactByKpi = businessUnitId ? await getExpectedImpactByKpi(outputKpiIds, businessUnitId, month, year) : new Map<string, number>();
      if (cancelled) return;

      const result: ExecutionPlanKpi[] = [];
      for (const k of raw) {
        const isOutput = isOutputType(k.type);
        const isProcess = isProcessType(k.type);
        const needsPocsAndTactics = isOutput || isProcess; // never rendered otherwise — see KpiCard

        const [anchorResult, pocsAndTactics, gapOrAchievement] = await Promise.all([
          businessUnitId
            ? BreakdownService.getAnchor(k.id, businessUnitId, year, month).then(
                async (anchor): Promise<{ breakdownRows: BreakdownRow[]; achievementId?: string }> => ({
                  achievementId: anchor.achievementId ?? undefined,
                  breakdownRows: isOutput && anchor.achievementId ? await BreakdownService.getAllRows(anchor.achievementId, k.id) : [],
                })
              )
            : Promise.resolve<{ breakdownRows: BreakdownRow[]; achievementId?: string }>({ breakdownRows: [] }),
          needsPocsAndTactics
            ? isProcess
              ? getPocsAndTacticsDrivenByProcessKpi(k.id)
              : getPocsAndTacticsForKpi(k.id)
            : Promise.resolve<{ pocs: Poc[]; tactics: Tactic[] }>({ pocs: [], tactics: [] }),
          !businessUnitId
            ? Promise.resolve<{ gap?: KpiGapRow; achievement?: KpiAchievement }>({})
            : isOutput
              ? getKpiGapRow({ id: k.id, name: k.name, type: k.type }, businessUnitId, month, year, impactByKpi).then(
                  (gap): { gap?: KpiGapRow; achievement?: KpiAchievement } => ({ gap })
                )
              : getKpiAchievement(k.id, businessUnitId, month, year).then(
                  (achievement): { gap?: KpiGapRow; achievement?: KpiAchievement } => ({ achievement })
                ),
        ]);

        if (cancelled) return;
        result.push({
          id: k.id,
          name: k.name,
          type: k.type,
          isOutput,
          isProcess,
          breakdownRows: anchorResult.breakdownRows,
          achievementId: anchorResult.achievementId,
          pocs: pocsAndTactics.pocs,
          tactics: pocsAndTactics.tactics,
          gap: gapOrAchievement.gap,
          achievement: gapOrAchievement.achievement,
        });
      }
      if (!cancelled) setKpis(result);
    })()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load execution plan");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, functionId, businessUnitId, month, year, reloadTick]);

  const reload = useCallback(() => setReloadTick((x) => x + 1), []);
  return { kpis, loading, error, reload };
}
