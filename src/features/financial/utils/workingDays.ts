import type { WorkingDays } from '../models/types';

function normalizeId(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

/** Working-day count for a business unit + month + year, or undefined if none. */
export function findWorkingDaysCount(
  rows: WorkingDays[],
  businessUnitId: string,
  month: number,
  year: number
): number | undefined {
  const bu = normalizeId(businessUnitId);
  if (!bu || month < 1 || month > 12 || year < 1) return undefined;

  const match = rows.find(
    (row) =>
      normalizeId(row.pm_businessunit) === bu &&
      row.pm_month === month &&
      row.pm_year === year
  );
  const days = match?.pm_workingdays;
  return days != null && Number.isFinite(days) ? days : undefined;
}
