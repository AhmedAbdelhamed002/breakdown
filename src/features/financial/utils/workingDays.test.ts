import { describe, expect, it } from 'vitest';
import { findWorkingDaysCount } from './workingDays';
import type { WorkingDays } from '../models/types';

const rows: WorkingDays[] = [
  {
    pm_workingdaysid: 'wd1',
    pm_businessunit: 'AAAA1111-0000-0000-0000-000000000001',
    pm_month: 8,
    pm_year: 2026,
    pm_workingdays: 22,
  },
  {
    pm_workingdaysid: 'wd2',
    pm_businessunit: 'AAAA1111-0000-0000-0000-000000000001',
    pm_month: 1,
    pm_year: 2026,
    pm_workingdays: 26,
  },
];

describe('findWorkingDaysCount', () => {
  it('returns the count for the selected BU, month, and year', () => {
    expect(
      findWorkingDaysCount(rows, '{AAAA1111-0000-0000-0000-000000000001}', 8, 2026)
    ).toBe(22);
  });

  it('returns undefined when the period or BU does not match', () => {
    expect(
      findWorkingDaysCount(rows, 'AAAA1111-0000-0000-0000-000000000001', 7, 2026)
    ).toBeUndefined();
    expect(
      findWorkingDaysCount(rows, 'BBBB2222-0000-0000-0000-000000000002', 8, 2026)
    ).toBeUndefined();
  });
});
