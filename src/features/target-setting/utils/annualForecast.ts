import type { AchievementRecord } from '../services/AchievementService';
import type { BaseEntity } from '../services/EntityService';
import type { MonthlyLedger, MonthlyLedgerEntry } from '../models/types';

export interface ForecastProfileMonth {
  month: number;
  kind: 'actual' | 'forecast';
  baseValue: number;
  projectDelta: number;
  finalValue: number;
}

/** What the selected entity has on record for a whole year in one business unit. */
export interface YearFigures {
  /** Whether the business unit has any achievement row at all for the entity that year. */
  hasRecord: boolean;
  actual: number | null;
  baseline: number | null;
  historical: number | null;
  target: number | null;
}

/** The figure a month is recorded at — its actual, falling back to baseline. */
const recordedValue = (rec: AchievementRecord): number => rec.actual ?? rec.baseline ?? 0;

/**
 * Raw recorded value per month (actual, falling back to baseline) for a fixed Jan-Dec calendar
 * year — the "Last 12 months (actual)" strip. This is pinned to the prior year (year - 1)
 * regardless of the selected Month, as a fixed year-over-year reference next to "Projected close
 * of {year}". No trending/run-rate applied. Every month 1-12 is always present, even with no
 * record, so the strip never has gaps.
 */
export function getTrailingActuals(achievements: AchievementRecord[]): ForecastProfileMonth[] {
  const byMonth = new Map(achievements.map(rec => [rec.month, rec]));
  return Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
    const rec = byMonth.get(month);
    if (!rec) {
      return { month, kind: 'forecast', baseValue: 0, projectDelta: 0, finalValue: 0 };
    }
    const val = recordedValue(rec);
    return { month, kind: 'actual', baseValue: val, projectDelta: 0, finalValue: val };
  });
}

/**
 * A monthly rate beyond this magnitude is never a real trend — it's two endpoints far enough
 * apart in value and close enough together in time to make the ratio explode (e.g. a near-zero
 * early actual next to a much larger later one). Rejected as un-derivable, same as any other
 * case below, falling back to the flat run-rate instead.
 */
const MAX_MONTHLY_RATE_MAGNITUDE = 3; // ±300% a month

/**
 * A projected month beyond this magnitude can never be saved as a proposal anyway (Dataverse's
 * own pm_proposedvalue range is ±1e9) and isn't a plausible forecast regardless — so a single
 * month landing here falls back to the flat run-rate instead. Catches what capping the rate's own
 * magnitude above doesn't: a rate inside that cap still compounds, and a steep climb far enough
 * from its anchor can clear ±1e9 before December.
 *
 * This originally also caught backcasting a steep decline — dividing repeatedly by a near-zero base
 * explodes upward rather than shrinking, which put a ~-95%/month decline into the trillions in
 * January. Months before currentMonth are no longer projected at all, so that particular route is
 * closed; the guard stays for the forward one.
 */
const MAX_PROJECTED_VALUE = 1_000_000_000;

/**
 * The compound monthly growth rate behind the projected close, read off the whole history the
 * screen is looking at: every month of the prior year plus the selected year up to currentMonth.
 * The earliest and latest recorded months in that window are the CAGR's two endpoints, and the gap
 * between them — in months, so an unrecorded month still counts as a period elapsed — is the
 * number of compounding periods.
 *
 * Only months carrying a value above zero can be endpoints: a ratio against zero (or across a sign
 * change) has no real root, which is what an empty prior year would otherwise produce. Returns null
 * when no rate can be derived — fewer than two such months, or a non-finite result — and the caller
 * falls back to a flat run-rate.
 */
function monthlyGrowthRate(
  window: { index: number; value: number }[]
): { rate: number; anchorIndex: number; anchorValue: number } | null {
  const usable = window.filter(p => p.value > 0).sort((a, b) => a.index - b.index);
  if (usable.length < 2) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];
  const periods = last.index - first.index;
  if (periods <= 0) return null;

  const rate = Math.pow(last.value / first.value, 1 / periods) - 1;
  if (!Number.isFinite(rate) || rate <= -1 || Math.abs(rate) > MAX_MONTHLY_RATE_MAGNITUDE) return null;

  return { rate, anchorIndex: last.index, anchorValue: last.value };
}

/**
 * Trend to year-close. Any month with a recorded achievement (falling back to baseline) shows that
 * real value, whether it's before, at, or after currentMonth — a month that's already been reported
 * shouldn't be masked by a projection just because it's the current month.
 *
 * Only the months after currentMonth are forecast, by compounding the monthly CAGR off the latest
 * recorded month, `anchorValue * (1 + rate) ^ monthsFromAnchor`. An unrecorded month at or before
 * currentMonth is history with nothing in it, and reads 0: projecting backwards would invent a past
 * that never happened. Planning from August forecasts September through December and leaves an
 * empty January at 0.
 *
 * When no rate can be derived — an empty prior year and a single recorded month, say — this falls
 * back to a flat run-rate: the average of the selected year's actuals reported through currentMonth,
 * held level across the months still to come.
 *
 * Every month 1-12 is always present, even with no record, so the strip never has gaps.
 */
export function calculateBaselineForecast(
  achievements: AchievementRecord[],
  currentMonth: number,
  priorYearAchievements: AchievementRecord[] = []
): ForecastProfileMonth[] {
  const byMonth = new Map(achievements.map(rec => [rec.month, rec]));

  // One continuous month index across both years so the gap between two endpoints is a plain
  // subtraction: the prior year occupies 0-11, the selected year 12-23.
  const window = [
    ...priorYearAchievements.map(rec => ({ index: rec.month - 1, value: recordedValue(rec) })),
    ...achievements
      .filter(rec => rec.month <= currentMonth)
      .map(rec => ({ index: 11 + rec.month, value: recordedValue(rec) }))
  ];
  const growth = monthlyGrowthRate(window);

  const actualsToDate = achievements.filter(a => a.month <= currentMonth).map(recordedValue);
  const runRate = actualsToDate.length
    ? actualsToDate.reduce((a, b) => a + b, 0) / actualsToDate.length
    : 0;

  return Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
    const rec = byMonth.get(month);
    if (rec) {
      const val = recordedValue(rec);
      return { month, kind: 'actual', baseValue: val, projectDelta: 0, finalValue: val };
    }
    // Only the months still ahead are forecast. A month at or before the one being planned from is
    // history: with nothing recorded for it there is nothing to report, and projecting backwards
    // would invent a past that never happened. Planning from August therefore forecasts September
    // through December and leaves any earlier month with no actual at 0.
    if (month <= currentMonth) {
      return { month, kind: 'forecast', baseValue: 0, projectDelta: 0, finalValue: 0 };
    }
    // See MAX_PROJECTED_VALUE for why this specific month's own result is what's guarded here,
    // not just the rate that produced it.
    const compounded = growth ? growth.anchorValue * Math.pow(1 + growth.rate, (11 + month) - growth.anchorIndex) : null;
    const projected = compounded != null && Number.isFinite(compounded) && Math.abs(compounded) <= MAX_PROJECTED_VALUE
      ? compounded
      : runRate;
    return { month, kind: 'forecast', baseValue: projected, projectDelta: 0, finalValue: projected };
  });
}


/**
 * The year's figures for an entity in one business unit, rolled up from its 12-month ledger — what
 * the annual card head reports once an entity is picked. Percentage entities average over the
 * months that carry a figure and everything else sums, the same way the projected close is
 * totalled. A field with no figure in any month stays null rather than reading as 0, so the head
 * shows an em dash instead of claiming a target of zero.
 */
export function getYearFigures(ledger: MonthlyLedger, aggType?: BaseEntity['aggType']): YearFigures {
  const rollUp = (pick: (entry: MonthlyLedgerEntry) => number | null): number | null => {
    const values = ledger.months.map(pick).filter((v): v is number => v != null);
    if (!values.length) return null;
    const total = values.reduce((a, b) => a + b, 0);
    return aggType === 'Percentage' ? total / values.length : total;
  };
  return {
    hasRecord: ledger.months.some(m => m.hasRecord),
    actual: rollUp(m => m.actual),
    baseline: rollUp(m => m.baseline),
    historical: rollUp(m => m.historical),
    target: rollUp(m => m.target)
  };
}
