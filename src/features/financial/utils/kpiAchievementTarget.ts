import type { KpiAchievement } from '../models/types';

function norm(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

export function hasLiveKpiTarget(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(Number(value)) && Number(value) !== 0;
}

export function hasNumericAchievementValue(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(Number(value));
}

function score(row: KpiAchievement, opts: { month: number; year: number }): number {
  let s = 0;
  if (row.pm_year === opts.year) s += 8;
  if (row.pm_month === opts.month) s += 8;
  return s;
}

function matchingAchievementRows(
  rows: KpiAchievement[],
  opts: {
    kpiId: string;
    kpiName?: string;
    buId: string;
    month: number;
    year: number;
  }
): KpiAchievement[] {
  const kpiNorm = norm(opts.kpiId);
  const buNorm = norm(opts.buId);
  const kpiName = String(opts.kpiName ?? '')
    .trim()
    .toLowerCase();
  if (!kpiNorm && !kpiName) return [];

  return rows
    .filter((row) => {
      const idHit = Boolean(kpiNorm) && norm(row.pm_kpi) === kpiNorm;
      const nameHit =
        Boolean(kpiName) &&
        String(row.pm_kpiname ?? '')
          .trim()
          .toLowerCase() === kpiName;
      if (!idHit && !nameHit) return false;
      if (buNorm && row.pm_businessunit && norm(row.pm_businessunit) !== buNorm) return false;
      return true;
    })
    .sort((a, b) => score(b, opts) - score(a, opts));
}

/**
 * Live target on pm_kpiachievment for a KPI in a business unit.
 * Prefers the tester month/year, then any row for that year, then any BU row with a target.
 */
export function pickKpiAchievementTarget(
  rows: KpiAchievement[],
  opts: {
    kpiId: string;
    kpiName?: string;
    buId: string;
    month: number;
    year: number;
  }
): number | undefined {
  const pool = matchingAchievementRows(rows, opts).filter((row) => hasLiveKpiTarget(row.pm_target));
  return pool[0]?.pm_target;
}

/**
 * Compare value for tester conflicts: Baseline first, then Actual if baseline is missing.
 */
export function pickKpiAchievementBaselineOrHistorical(
  rows: KpiAchievement[],
  opts: {
    kpiId: string;
    kpiName?: string;
    buId: string;
    month: number;
    year: number;
  }
): { value: number; field: 'baseline' | 'actual' } | undefined {
  const pool = matchingAchievementRows(rows, opts);
  for (const row of pool) {
    if (hasNumericAchievementValue(row.pm_baseline)) {
      return { value: Number(row.pm_baseline), field: 'baseline' };
    }
  }
  for (const row of pool) {
    if (hasNumericAchievementValue(row.pm_actual)) {
      return { value: Number(row.pm_actual), field: 'actual' };
    }
  }
  return undefined;
}
