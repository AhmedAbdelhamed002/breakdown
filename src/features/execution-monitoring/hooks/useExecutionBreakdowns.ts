import { useEffect, useState } from "react";
import { EntityService, BreakdownService, type BreakdownRow, type BaseEntity } from "@features/target-setting";

export interface BreakdownOverviewRow {
  kpiId: string;
  kpiName: string;
  kpiType?: string;
  kpiAggType?: BaseEntity["aggType"];
  /** The pm_kpiachievments record this breakdown hangs off — always set (see the filter below). */
  achievementId: string;
  target: number | null;
  rows: BreakdownRow[];
}

/**
 * One row per KPI Achievement (pm_kpiachievments) that actually exists for this Business
 * Unit/Month/Year, scoped to the given Department/Function — a KPI with no achievement row for the
 * period has nothing to show here (same "no target this month" case BreakdownService's own docs
 * describe). Each row carries its full breakdown detail (BreakdownService.getAllRows), not just a
 * depth count, since this screen's whole point is showing "what's already broken down" at a glance.
 */
export function useExecutionBreakdowns(departmentId: string, functionId: string, businessUnitId: string, month: number, year: number) {
  const [rows, setRows] = useState<BreakdownOverviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!departmentId || !businessUnitId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      const [kpis, anchors] = await Promise.all([
        EntityService.getKpis(undefined, departmentId, functionId || undefined),
        BreakdownService.getAnchors(businessUnitId, year, month),
      ]);

      const detailed = (
        await Promise.all(
          kpis.map(async (kpi): Promise<BreakdownOverviewRow | null> => {
            const anchor = anchors.get(kpi.id);
            if (!anchor?.achievementId) return null;
            const rows = await BreakdownService.getAllRows(anchor.achievementId, kpi.id);
            return {
              kpiId: kpi.id,
              kpiName: kpi.name,
              kpiType: kpi.type,
              kpiAggType: kpi.aggType,
              achievementId: anchor.achievementId,
              target: anchor.target,
              rows,
            };
          })
        )
      ).filter((r): r is BreakdownOverviewRow => r !== null);

      if (!cancelled) setRows(detailed);
    })()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load breakdowns");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, functionId, businessUnitId, month, year]);

  return { rows, loading, error };
}
