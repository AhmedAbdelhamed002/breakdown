import { Pm_pocimpactsService } from "@generated/services/Pm_pocimpactsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { LedgerService } from "@infrastructure/financialImpact/LedgerService";
import { findTacticIdsWithImpactOnKpi, getTacticImpactRecordsForTactic } from "@features/strategy-formulation";

/**
 * Expected impact per KPI for one Business Unit/Month/Year — the sum of every connected POC/Tactic's
 * own contribution for that KPI. Uses the same field Top-down Annual's own "POCs/Tactics" panel
 * already stacks (pm_pocimpactvalue / pm_tacticimpactvalue — the Driver's own resulting value on
 * that row; see PocTacticContributionsPanel.tsx's `entry.proposed += li.driverNewValue`), so this
 * tab's numbers stay consistent with what's already shown elsewhere in the app for the same KPI.
 *
 * pm_pocimpacts is native Dataverse — one broad, filtered query covers every KPI at once.
 *
 * pm_tacticimpacts is bound as a "Connector" data source instead (see
 * .power/schemas/appschemas/dataSourcesInfo.ts) — confirmed live it fails outright on anything
 * broader than a single lookup-equality filter (a statecode-only filter alone was already too much,
 * not just the original BU+month+year one). The only shape proven to work against it anywhere in
 * this app is findTacticIdsWithImpactOnKpi's own (`_pm_driverkpi_value eq '<kpiId>' and statecode eq
 * 0`), so Tactics are read the same way it already does — per KPI, not as one broad query.
 *
 * Also confirmed live: firing those per-KPI calls concurrently (Promise.all across every KPI) makes
 * them fail too, even though the exact same call succeeds everywhere else it's already used (always
 * one KPI at a time, e.g. useKpiPocTacticImpacts). This Connector binding appears to have a low
 * concurrency limit, not just a narrow filter shape — so every pm_tacticimpacts call here runs
 * strictly one at a time (a plain for-loop, not Promise.all), trading speed for actually working.
 */
export async function getExpectedImpactByKpi(kpiIds: string[], businessUnitId: string, month: number, year: number): Promise<Map<string, number>> {
  const impactByKpi = new Map<string, number>();
  if (!businessUnitId) return impactByKpi;

  const add = (kpiId: string | undefined, value: number | undefined) => {
    if (!kpiId || value == null) return;
    impactByKpi.set(kpiId, (impactByKpi.get(kpiId) ?? 0) + value);
  };

  const pocFilter = `_pm_bu_value eq '${businessUnitId}' and pm_month eq ${month} and pm_year eq ${year} and statecode eq 0`;
  const pocRows = resultOrThrow(
    await Pm_pocimpactsService.getAll({ select: ["_pm_kpi_value", "pm_pocimpactvalue"], filter: pocFilter }),
    "List POC impacts for gap analysis"
  );
  pocRows.forEach((r) => add(r._pm_kpi_value, r.pm_pocimpactvalue));

  // TEMP diagnostics: pm_tacticimpacts (a "Connector" data source) has failed every filter shape
  // tried so far, including the one already proven to work one-at-a-time elsewhere in the app — so
  // a Tactic-side failure here must not take down the whole gap analysis (the POC-side numbers above
  // are still valid), and needs real error detail instead of the SDK's own near-empty error object.
  for (const kpiId of kpiIds) {
    try {
      const tacticIds = await findTacticIdsWithImpactOnKpi(kpiId);
      for (const tacticId of tacticIds) {
        const records = await getTacticImpactRecordsForTactic(tacticId);
        records.forEach((r) => {
          if (r.buId === businessUnitId && r.month === month && r.year === year) add(kpiId, r.driverNewValue);
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[gap-analysis] Tactic impact lookup failed for KPI", kpiId, {
        name: e instanceof Error ? e.name : typeof e,
        message: e instanceof Error ? e.message : String(e),
        cause: e instanceof Error ? (e as { cause?: unknown }).cause : undefined,
        stack: e instanceof Error ? e.stack : undefined,
      });
    }
  }

  return impactByKpi;
}

/**
 * The KPI's Actual for the month before the given one — correctly crossing the year boundary for
 * January (reads December of the previous year), unlike the reference prototype's own same-year-only
 * shortcut.
 */
export async function getLastMonthActual(kpiId: string, businessUnitId: string, month: number, year: number): Promise<number | null> {
  if (!kpiId || !businessUnitId) return null;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const ledger = await LedgerService.getLedger({ kind: "kpi", id: kpiId }, businessUnitId, prevYear);
  const entry = ledger.months.find((m) => m.month === prevMonth);
  return entry?.actual ?? null;
}

export interface KpiGapRow {
  kpiId: string;
  kpiName: string;
  kpiType?: string;
  target: number | null;
  lastActual: number | null;
  /** Needed absolute growth: target − last actual. */
  absGrowth: number | null;
  /** Needed growth as a percentage of last actual: (target − last actual) / last actual × 100. */
  pctGrowth: number | null;
  /** Expected impact from connected POCs/Tactics this month (see getExpectedImpactByKpi). */
  impact: number;
  /** absGrowth − impact. Positive ⇒ POCs/Tactics fall short of the needed growth (flagged). */
  gap: number | null;
}

/** One KPI's full gap-analysis row — target, last actual, needed growth, expected impact, and gap. */
export async function getKpiGapRow(
  kpi: { id: string; name: string; type?: string },
  businessUnitId: string,
  month: number,
  year: number,
  impactByKpi: Map<string, number>
): Promise<KpiGapRow> {
  const [ledger, lastActual] = await Promise.all([
    LedgerService.getLedger({ kind: "kpi", id: kpi.id }, businessUnitId, year),
    getLastMonthActual(kpi.id, businessUnitId, month, year),
  ]);
  const target = ledger.months.find((m) => m.month === month)?.target ?? null;
  const absGrowth = target != null && lastActual != null ? Math.round((target - lastActual) * 100) / 100 : null;
  const pctGrowth = target != null && lastActual ? Math.round(((target - lastActual) / lastActual) * 10000) / 100 : null;
  const impact = Math.round((impactByKpi.get(kpi.id) ?? 0) * 100) / 100;
  const gap = absGrowth != null ? Math.round((absGrowth - impact) * 100) / 100 : null;
  return { kpiId: kpi.id, kpiName: kpi.name, kpiType: kpi.type, target, lastActual, absGrowth, pctGrowth, impact, gap };
}
