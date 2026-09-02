import type { FinancialModel, ModelTerm, RelationFactor, StrategyKpi } from '../models/types';

function normalizeKpiId(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

const SKIP_STATUSES = new Set(['Retired', 'Superseded']);

/** Result KPI of a model, if the result kind is KPI. */
export function getModelResultKpiId(
  model: Pick<FinancialModel, 'pm_resultkind' | 'pm_calculatedkpi' | 'pm_resultref'>
): string {
  if (model.pm_resultkind !== 'KPI') return '';
  return normalizeKpiId(model.pm_calculatedkpi || model.pm_resultref);
}

/** KPIs that are the calculated result of an active financial model. */
export function collectCalculatedKpiIds(
  models: FinancialModel[],
  options?: { currentModelId?: string; currentResultKpiId?: string }
): Set<string> {
  const ids = new Set<string>();
  const currentId = String(options?.currentModelId ?? '');
  for (const model of models) {
    if (SKIP_STATUSES.has(model.statuscode)) continue;
    if (currentId && model.pm_modelid === currentId) continue;
    const id = getModelResultKpiId(model);
    if (id) ids.add(id);
  }
  const currentResult = normalizeKpiId(options?.currentResultKpiId);
  if (currentResult) ids.add(currentResult);
  return ids;
}

export function isEligibleInputKpi(kpiId: string, calculatedIds: Set<string>): boolean {
  const id = normalizeKpiId(kpiId);
  return Boolean(id) && !calculatedIds.has(id);
}

function isFiniteNumber(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(Number(value));
}

/** Relation factors need a BI actual or baseline for the selected filter context. */
export function hasNumericActualOrBaseline(
  actual?: number | null,
  baseline?: number | null
): boolean {
  return isFiniteNumber(actual) || isFiniteNumber(baseline);
}

export function filterRelationInputKpis(
  kpis: StrategyKpi[],
  models: FinancialModel[],
  hasSource: (kpiId: string) => boolean,
  current?: FinancialModel
): StrategyKpi[] {
  return filterInputKpis(kpis, models, current).filter((k) => hasSource(k.strategy_kpisid));
}

export function relationMissingSourceMessage(
  factors: RelationFactor[],
  hasSource: (kpiId: string) => boolean,
  kpiName?: (kpiId: string) => string | undefined
): string | null {
  const missing = factors.filter((f) => f.pm_factorkpi && !hasSource(f.pm_factorkpi));
  if (missing.length === 0) return null;
  const names = missing
    .map((f) => kpiName?.(f.pm_factorkpi)?.trim() || 'A relation factor KPI')
    .join(', ');
  return `${names} has no actual or baseline for the selected Region, BU, Department and Function, so it cannot be used in a relation.`;
}

/** Message when Save as proposal is blocked because a relation factor KPI lacks Actual and Baseline. */
export function relationProposalBlockedMessage(
  factors: RelationFactor[],
  getFields: (kpiId: string) => { actual?: number | null; baseline?: number | null },
  kpiName?: (kpiId: string) => string | undefined
): string | null {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const factor of factors) {
    // Only the relation factor KPI (pm_factorkpi) — never the model's result KPI.
    const id = normalizeKpiId(factor.pm_factorkpi);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fields = getFields(factor.pm_factorkpi);
    const hasActual = isFiniteNumber(fields.actual);
    const hasBaseline = isFiniteNumber(fields.baseline);
    if (hasActual || hasBaseline) continue;
    const name = kpiName?.(factor.pm_factorkpi)?.trim() || 'A relation factor KPI';
    lines.push(`• ${name}: no Actual and no Baseline`);
  }
  if (lines.length === 0) return null;
  return [
    "We can't save as proposal because one or more relation factor KPIs have no Actual and no Baseline for the selected Region, BU, Department and Function:",
    '',
    ...lines,
    '',
    'Each factor KPI must have Actual or Baseline data. Add that data, then try again.',
  ].join('\n');
}

/** Same rule using tester rows (factor rows only — excludes the calculated result KPI). */
export function relationFactorRowsMissingSourceMessage(
  factorRows: Array<{
    kpiId: string;
    kpiName: string;
    actualValue?: number | null;
    baselineValue?: number | null;
  }>
): string | null {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const row of factorRows) {
    const id = normalizeKpiId(row.kpiId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const hasActual = isFiniteNumber(row.actualValue);
    const hasBaseline = isFiniteNumber(row.baselineValue);
    if (hasActual || hasBaseline) continue;
    lines.push(`• ${row.kpiName.trim() || 'A relation factor KPI'}: no Actual and no Baseline`);
  }
  if (lines.length === 0) return null;
  return [
    "We can't save as proposal because one or more relation factor KPIs have no Actual and no Baseline for the selected Region, BU, Department and Function:",
    '',
    ...lines,
    '',
    'Each factor KPI must have Actual or Baseline data. Add that data, then try again.',
  ].join('\n');
}

export function filterInputKpis(
  kpis: StrategyKpi[],
  models: FinancialModel[],
  current?: FinancialModel
): StrategyKpi[] {
  const calculated = collectCalculatedKpiIds(models, {
    currentModelId: current?.pm_modelid,
    currentResultKpiId: current ? getModelResultKpiId(current) : undefined,
  });
  return kpis.filter((k) => isEligibleInputKpi(k.strategy_kpisid, calculated));
}

export function stripResultKpiTerms(terms: ModelTerm[], resultKpiId: string): ModelTerm[] {
  const blocked = normalizeKpiId(resultKpiId);
  if (!blocked) return terms;
  return terms
    .filter((t) => t.pm_termtype !== 'KPI' || normalizeKpiId(t.pm_kpi) !== blocked)
    .map((t, i) => ({ ...t, pm_sequence: i + 1 }));
}

export function stripResultKpiFactors(factors: RelationFactor[], resultKpiId: string): RelationFactor[] {
  const blocked = normalizeKpiId(resultKpiId);
  if (!blocked) return factors;
  return factors.filter((f) => normalizeKpiId(f.pm_factorkpi) !== blocked);
}

export function inputKpiViolationMessage(
  terms: ModelTerm[],
  factors: RelationFactor[],
  model: FinancialModel,
  models: FinancialModel[]
): string | null {
  const resultId = getModelResultKpiId(model);
  const calculated = collectCalculatedKpiIds(models, {
    currentModelId: model.pm_modelid,
    currentResultKpiId: resultId,
  });
  const usedIds =
    model.pm_modeltype === 'Equation'
      ? terms.filter((t) => t.pm_termtype === 'KPI').map((t) => t.pm_kpi)
      : factors.map((f) => f.pm_factorkpi);

  for (const raw of usedIds) {
    const id = normalizeKpiId(raw);
    if (!id) continue;
    if (resultId && id === resultId) {
      return 'The result KPI cannot be used in the equation or as a relation factor.';
    }
    if (calculated.has(id)) {
      return 'A calculated KPI cannot be used as a factor or equation term.';
    }
  }
  return null;
}
