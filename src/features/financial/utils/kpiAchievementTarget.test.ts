import { describe, expect, it } from 'vitest';
import type { KpiAchievement } from '../models/types';
import {
  hasLiveKpiTarget,
  pickKpiAchievementBaselineOrHistorical,
  pickKpiAchievementTarget,
} from './kpiAchievementTarget';

function row(partial: Partial<KpiAchievement> & Pick<KpiAchievement, 'pm_kpiachievmentid'>): KpiAchievement {
  return {
    pm_kpi: 'kpi-1',
    pm_businessunit: 'bu-1',
    pm_month: 4,
    pm_year: 2026,
    ...partial,
  };
}

describe('hasLiveKpiTarget', () => {
  it('treats missing and zero as no target', () => {
    expect(hasLiveKpiTarget(undefined)).toBe(false);
    expect(hasLiveKpiTarget(null)).toBe(false);
    expect(hasLiveKpiTarget(0)).toBe(false);
  });

  it('treats a non-zero number as a live target', () => {
    expect(hasLiveKpiTarget(12)).toBe(true);
  });
});

describe('pickKpiAchievementTarget', () => {
  it('returns the BU / month / year target for the KPI', () => {
    const rows = [
      row({ pm_kpiachievmentid: 'a', pm_month: 3, pm_target: 50 }),
      row({ pm_kpiachievmentid: 'b', pm_month: 4, pm_target: 80 }),
      row({ pm_kpiachievmentid: 'c', pm_kpi: 'other', pm_month: 4, pm_target: 99 }),
    ];
    expect(
      pickKpiAchievementTarget(rows, {
        kpiId: 'kpi-1',
        buId: 'bu-1',
        month: 4,
        year: 2026,
      })
    ).toBe(80);
  });

  it('ignores other business units', () => {
    const rows = [row({ pm_kpiachievmentid: 'a', pm_businessunit: 'bu-2', pm_target: 80 })];
    expect(
      pickKpiAchievementTarget(rows, {
        kpiId: 'kpi-1',
        buId: 'bu-1',
        month: 4,
        year: 2026,
      })
    ).toBeUndefined();
  });
});

describe('pickKpiAchievementBaselineOrHistorical', () => {
  it('prefers baseline over actual', () => {
    const rows = [
      row({
        pm_kpiachievmentid: 'a',
        pm_baseline: 70,
        pm_actual: 40,
      }),
    ];
    expect(
      pickKpiAchievementBaselineOrHistorical(rows, {
        kpiId: 'kpi-1',
        buId: 'bu-1',
        month: 4,
        year: 2026,
      })
    ).toEqual({ value: 70, field: 'baseline' });
  });

  it('falls back to actual when baseline is missing', () => {
    const rows = [
      row({
        pm_kpiachievmentid: 'a',
        pm_actual: 55,
        pm_historical: 40,
      }),
    ];
    expect(
      pickKpiAchievementBaselineOrHistorical(rows, {
        kpiId: 'kpi-1',
        buId: 'bu-1',
        month: 4,
        year: 2026,
      })
    ).toEqual({ value: 55, field: 'actual' });
  });

  it('treats zero baseline as a valid compare value', () => {
    const rows = [row({ pm_kpiachievmentid: 'a', pm_baseline: 0, pm_actual: 40 })];
    expect(
      pickKpiAchievementBaselineOrHistorical(rows, {
        kpiId: 'kpi-1',
        buId: 'bu-1',
        month: 4,
        year: 2026,
      })
    ).toEqual({ value: 0, field: 'baseline' });
  });

  it('returns undefined when neither baseline nor actual exists', () => {
    const rows = [row({ pm_kpiachievmentid: 'a', pm_target: 90, pm_historical: 12 })];
    expect(
      pickKpiAchievementBaselineOrHistorical(rows, {
        kpiId: 'kpi-1',
        buId: 'bu-1',
        month: 4,
        year: 2026,
      })
    ).toBeUndefined();
  });
});
