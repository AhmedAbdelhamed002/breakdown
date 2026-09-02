import { describe, expect, it } from 'vitest';
import { calculateBaselineForecast, getYearFigures } from './annualForecast';
import type { AchievementRecord } from '../services/AchievementService';

const rec = (month: number, year: number, actual: number | null): AchievementRecord => ({
  id: `${year}-${month}`,
  month,
  year,
  actual,
  baseline: null,
  target: null
});

/** The month figures off the projected-close strip, rounded the way the strip renders them. */
const profileOf = (
  achievements: AchievementRecord[], currentMonth: number, prior: AchievementRecord[] = []
) =>
  calculateBaselineForecast(achievements, currentMonth, prior)
    .map(m => Math.round(m.finalValue));

describe('calculateBaselineForecast', () => {
  it('compounds forward off the monthly CAGR, only past the month being planned from', () => {
    // Jun 100 → Aug 250 is two periods, so the rate is √2.5 - 1 = 58.11% a month, anchored on Aug.
    // Planning from October, only November and December are still ahead. Jan-May, Jul, Sep and Oct
    // have nothing recorded and are already behind, so they read 0 rather than a projected figure.
    const profile = profileOf([rec(6, 2026, 100), rec(8, 2026, 250)], 10);

    expect(profile).toEqual([0, 0, 0, 0, 0, 100, 0, 250, 0, 0, 988, 1563]);
  });

  it('reads the prior year as part of the same window', () => {
    // Dec 2025 100 → Jun 2026 200 spans six months: 2^(1/6) - 1 = 12.25% a month.
    const profile = profileOf([rec(6, 2026, 200)], 10, [rec(12, 2025, 100)]);

    expect(profile).toEqual([0, 0, 0, 0, 0, 200, 0, 0, 0, 0, 356, 400]);
  });

  it('holds recorded months at their own figure, whether before or after the selected month', () => {
    const profile = calculateBaselineForecast(
      [rec(6, 2026, 100), rec(8, 2026, 250), rec(11, 2026, 900)], 10
    );

    expect(profile[5]).toMatchObject({ month: 6, kind: 'actual', finalValue: 100 });
    expect(profile[7]).toMatchObject({ month: 8, kind: 'actual', finalValue: 250 });
    // November is recorded but sits past the selected month — still its own value, not a forecast.
    expect(profile[10]).toMatchObject({ month: 11, kind: 'actual', finalValue: 900 });
    // September has no record and isn't ahead of October, so it reports nothing at all.
    expect(profile[8]).toMatchObject({ month: 9, kind: 'forecast', finalValue: 0 });
  });

  it('falls back to the flat run-rate when the window has only one recorded month', () => {
    const profile = profileOf([rec(8, 2026, 250)], 10);

    // Aug keeps its own 250 and the months still ahead sit on the mean of the actuals to date.
    // The empty months behind October stay 0 — the fallback fills the future, not the past.
    expect(profile).toEqual([0, 0, 0, 0, 0, 0, 0, 250, 0, 0, 250, 250]);
  });

  it('falls back to the flat run-rate when the prior year is empty and only two months are recorded at the same value', () => {
    // Equal endpoints give a 0% rate, which is a real rate — the strip holds flat at 175 either
    // way, but through the CAGR path rather than the fallback.
    const profile = profileOf([rec(6, 2026, 175), rec(8, 2026, 175)], 10);

    expect(profile).toEqual([0, 0, 0, 0, 0, 175, 0, 175, 0, 0, 175, 175]);
  });

  it('ignores zero and null months as endpoints rather than dividing by them', () => {
    // An empty 2025 and a zeroed Jan can't anchor a ratio; the rate comes from Jun → Aug instead.
    const zeroedPriorYear = Array.from({ length: 12 }, (_, i) => rec(i + 1, 2025, 0));
    const profile = profileOf(
      [rec(1, 2026, 0), rec(6, 2026, 100), rec(8, 2026, 250)], 10, zeroedPriorYear
    );

    expect(profile[0]).toBe(0);      // January is recorded at 0, so it stays 0
    expect(profile[10]).toBe(988);   // November still compounds off Aug at 58.11%
    expect(profile.every(v => Number.isFinite(v))).toBe(true);
  });

  it('holds every month at zero when nothing at all is recorded', () => {
    expect(profileOf([], 10)).toEqual(Array(12).fill(0));
  });

  it('projects a decline when the window trends down', () => {
    // 400 → 100 over two months halves each month.
    const profile = profileOf([rec(6, 2026, 400), rec(8, 2026, 100)], 10);

    expect(profile[10]).toBe(13);  // Nov — 100 halved three times from the Aug anchor
    expect(profile[11]).toBe(6);
  });

  it('falls back to the flat run-rate instead of compounding an implausible rate off two far-apart endpoints', () => {
    // 1 → 500 over two months is a 2136%-a-month rate — compounded across the rest of the year
    // that would reach the trillions and blow through pm_proposedvalue's Dataverse range. The
    // pair is rejected as un-derivable, same as any other case with no usable rate.
    const profile = profileOf([rec(6, 2026, 1), rec(8, 2026, 500)], 10);

    const runRate = (1 + 500) / 2;
    expect(profile[10]).toBe(Math.round(runRate));
    expect(profile.every(v => Number.isFinite(v) && Math.abs(v) < 1_000_000_000)).toBe(true);
  });

  it('leaves the months behind the planning month alone even on a steep decline', () => {
    // 1119 → 2 over two months is a ~-95.8%-a-month rate: plausible forward, where Nov and Dec
    // correctly shrink toward zero. Backcasting it was what once put January north of 4 trillion —
    // dividing repeatedly by a near-zero base explodes upward. Months before the planning month are
    // no longer projected at all, so January is simply 0 and that route is closed by construction
    // rather than by the value guard.
    const profile = profileOf([rec(8, 2026, 1119), rec(10, 2026, 2)], 10);

    expect(profile[0]).toBe(0);   // January — behind October, nothing recorded, nothing reported
    expect(profile[10]).toBe(0);  // November still shrinks forward off the real trend
    expect(profile.every(v => Number.isFinite(v) && Math.abs(v) <= 1_000_000_000)).toBe(true);
  });

  it('still guards a forward projection that would clear the saveable range', () => {
    // 250 → 1000 in one month is a 300% rate — right at the cap, so the rate itself is accepted.
    // Compounded from August it is fine until December, which reaches 1.048e9 and is past what
    // pm_proposedvalue can hold, so that month alone drops to the flat run-rate.
    const profile = profileOf([rec(1, 2026, 250), rec(2, 2026, 1000)], 2);
    const runRate = Math.round((250 + 1000) / 2);

    expect(profile[10]).toBe(262_144_000);  // November compounds normally
    expect(profile[11]).toBe(runRate);      // December would have cleared ±1e9
    expect(profile.every(v => Number.isFinite(v) && Math.abs(v) <= 1_000_000_000)).toBe(true);
  });
});

describe('getYearFigures', () => {
  const ledgerOf = (months: { month: number; actual: number | null; target: number | null }[]) => ({
    entityRef: { kind: 'kpi' as const, id: 'k1' },
    buId: 'bu1',
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => {
      const found = months.find(m => m.month === i + 1);
      return {
        month: i + 1,
        actual: found?.actual ?? null,
        baseline: null,
        target: found?.target ?? null,
        historical: null,
        hasRecord: !!found
      };
    })
  });

  it('sums a Value entity and averages a Percentage one over the months that carry a figure', () => {
    const ledger = ledgerOf([
      { month: 6, actual: 100, target: 120 },
      { month: 8, actual: 250, target: 300 }
    ]);

    expect(getYearFigures(ledger, 'Value')).toMatchObject({
      hasRecord: true, actual: 350, target: 420
    });
    expect(getYearFigures(ledger, 'Percentage')).toMatchObject({
      hasRecord: true, actual: 175, target: 210
    });
  });

  it('leaves a field null when no month carries a figure, rather than reading it as zero', () => {
    const figures = getYearFigures(
      ledgerOf([{ month: 6, actual: 100, target: null }]), 'Value'
    );

    expect(figures).toMatchObject({ hasRecord: true, actual: 100, target: null, baseline: null });
  });

  it('reports hasRecord false for a business unit with nothing on record that year', () => {
    expect(getYearFigures(ledgerOf([]), 'Value')).toMatchObject({
      hasRecord: false, actual: null, target: null
    });
  });
});
