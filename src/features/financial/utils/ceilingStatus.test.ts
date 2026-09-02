import { describe, expect, it } from 'vitest';
import type { KpiCeiling } from '../models/types';
import { reconcileCeilingStatuses, isSupersededCeiling } from './ceilingStatus';

function ceiling(partial: Partial<KpiCeiling> & Pick<KpiCeiling, 'pm_kpiceilingid' | 'pm_effectivedate'>): KpiCeiling {
  return {
    pm_kpi: 'kpi-1',
    pm_businessunit: 'bu-1',
    pm_isconstraint: 'Enforced',
    ...partial,
  };
}

describe('reconcileCeilingStatuses', () => {
  const now = new Date(2026, 7, 19);

  it('keeps the current constraint Active when a later one is dated in the future', () => {
    const current = ceiling({
      pm_kpiceilingid: 'current',
      pm_effectivedate: '2026-01-01',
      pm_min: 6,
      pm_max: 10,
    });
    const future = ceiling({
      pm_kpiceilingid: 'future',
      pm_effectivedate: '2026-09-01',
      pm_min: 4,
      pm_max: 8,
    });

    const result = reconcileCeilingStatuses([current, future], now);
    const byId = Object.fromEntries(result.map((c) => [c.pm_kpiceilingid, c]));

    expect(byId.current.status).toBe('Active');
    expect(byId.current.statuscode).toBe(1);
    expect(byId.current.pm_isconstraint).toBe('Enforced');
    expect(byId.future.status).toBe('Superseded');
    expect(byId.future.statuscode).toBe(2);
    expect(byId.future.pm_isconstraint).toBe('Enforced');
  });

  it('activates the future constraint once its effective date arrives', () => {
    const current = ceiling({
      pm_kpiceilingid: 'current',
      pm_effectivedate: '2026-01-01',
    });
    const next = ceiling({
      pm_kpiceilingid: 'next',
      pm_effectivedate: '2026-09-01',
      pm_isconstraint: 'Enforced',
    });

    const result = reconcileCeilingStatuses([current, next], new Date(2026, 8, 1));
    const byId = Object.fromEntries(result.map((c) => [c.pm_kpiceilingid, c]));

    expect(byId.next.status).toBe('Active');
    expect(byId.next.pm_isconstraint).toBe('Enforced');
    expect(byId.current.status).toBe('Superseded');
    expect(byId.current.pm_isconstraint).toBe('Off');
  });

  it('leaves a future-only constraint Superseded until its date', () => {
    const future = ceiling({
      pm_kpiceilingid: 'future-only',
      pm_effectivedate: '2026-12-01',
    });
    const [row] = reconcileCeilingStatuses([future], now);
    expect(row.status).toBe('Superseded');
    expect(row.pm_isconstraint).toBe('Enforced');
  });

  it('treats numeric and string superseded status codes as superseded', () => {
    expect(isSupersededCeiling({ status: 'Superseded' })).toBe(true);
    expect(isSupersededCeiling({ statuscode: 2 })).toBe(true);
    expect(isSupersededCeiling({ statuscode: '2' as unknown as number })).toBe(true);
    expect(isSupersededCeiling({ status: 'Active', statuscode: 1 })).toBe(false);
  });
});
