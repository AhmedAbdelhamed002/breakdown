import type { FinancialModel, ModelTerm, TesterComponentRow } from '../models/types';

function normalizeId(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(Number(value));
}

/**
 * When the equation result KPI also appears as a factor, and at least one other
 * factor KPI exists, Test % is enabled relative to that repeated KPI.
 */
export function findRepeatedResultKpiId(
  model: Pick<FinancialModel, 'pm_resultkind' | 'pm_calculatedkpi' | 'pm_resultref'>,
  terms: ModelTerm[]
): string {
  if (model.pm_resultkind !== 'KPI') return '';
  const resultId = normalizeId(model.pm_calculatedkpi || model.pm_resultref);
  if (!resultId) return '';

  const factorIds = terms
    .filter((t) => t.pm_termtype === 'KPI' && t.pm_kpi)
    .map((t) => normalizeId(t.pm_kpi));

  if (!factorIds.includes(resultId)) return '';
  if (!factorIds.some((id) => id && id !== resultId)) return '';
  return resultId;
}

/** Prefer Baseline of the repeated KPI; fall back to Actual. */
export function percentReferenceBase(
  row: Pick<TesterComponentRow, 'baselineValue' | 'actualValue'> | undefined
): number | null {
  if (!row) return null;
  if (isFiniteNumber(row.baselineValue)) return Number(row.baselineValue);
  if (isFiniteNumber(row.actualValue)) return Number(row.actualValue);
  return null;
}

export function testValueFromPercent(percent: number, base: number): number {
  return (percent / 100) * base;
}

export function percentFromTestValue(testValue: number, base: number): number | null {
  if (!Number.isFinite(base) || base === 0) return null;
  if (!Number.isFinite(testValue)) return null;
  return (testValue / base) * 100;
}
