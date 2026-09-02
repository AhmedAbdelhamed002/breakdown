import { useEffect, useState } from "react";
import { EntityService } from "@features/target-setting";
import { getExpectedImpactByKpi, getKpiGapRow, type KpiGapRow } from "../services/gapAnalysisService";

// The raw strategy_kpitype choice labels (Strategy_kpisesstrategy_kpitype in the generated model) are
// literally 'OutCome' / 'OutPut' — not the more natural 'Outcome' / 'Output' — confirmed against the
// generated enum after this filter silently excluded every KPI regardless of type.
const OUTPUT_OUTCOME = new Set(["OutPut", "OutCome"]);

/**
 * Gap-analysis rows for every Output/Outcome KPI under the given Department/Function, for one
 * Business Unit/Month/Year — see gapAnalysisService.getKpiGapRow for the per-row formula.
 */
export function useOverviewGap(departmentId: string, functionId: string, businessUnitId: string, month: number, year: number) {
  const [rows, setRows] = useState<KpiGapRow[]>([]);
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
      const kpis = (await EntityService.getKpis(undefined, departmentId, functionId || undefined)).filter(
        (k) => k.type && OUTPUT_OUTCOME.has(k.type)
      );
      const impactByKpi = await getExpectedImpactByKpi(kpis.map((k) => k.id), businessUnitId, month, year);
      const gapRows = await Promise.all(
        kpis.map((k) => getKpiGapRow({ id: k.id, name: k.name, type: k.type }, businessUnitId, month, year, impactByKpi))
      );
      if (cancelled) return;
      setRows(gapRows);
    })()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load gap analysis");
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
