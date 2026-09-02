import type { FinancialModel, ModelTerm, RelationFactor } from '@features/financial';

function isSealed(model: FinancialModel): boolean {
  return model.pm_modeltypevalue === 3 || model.statuscode === 'Sealed';
}

function norm(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

/** KPIs referenced by sealed models: result KPI (when kind is KPI) plus equation/relation components. */
export function collectPmKpiIds(
  models: FinancialModel[],
  terms: ModelTerm[],
  factors: RelationFactor[]
): Set<string> {
  const ids = new Set<string>();
  for (const model of models) {
    if (!isSealed(model)) continue;
    if (model.pm_resultkind === 'KPI') {
      const resultId = norm(model.pm_calculatedkpi || model.pm_resultref);
      if (resultId) ids.add(resultId);
    }
    for (const term of terms) {
      if (term.pm_model !== model.pm_modelid) continue;
      if (term.pm_termtype === 'KPI' && term.pm_kpi) ids.add(norm(term.pm_kpi));
    }
    for (const factor of factors) {
      if (factor.pm_model !== model.pm_modelid) continue;
      if (factor.pm_factorkpi) ids.add(norm(factor.pm_factorkpi));
    }
  }
  ids.delete('');
  return ids;
}

export function isMissingTarget(target: number | null | undefined): boolean {
  return target == null || Number(target) === 0;
}
