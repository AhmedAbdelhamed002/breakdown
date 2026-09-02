import { describe, expect, it } from 'vitest';
import type { FinancialModel, ModelTerm, RelationFactor } from '../../financial/models/types';
import { collectPmKpiIds, isMissingTarget } from './pmKpis';

function model(partial: Partial<FinancialModel> & Pick<FinancialModel, 'pm_modelid'>): FinancialModel {
  return {
    pm_resultkind: 'KPI',
    pm_resultref: '',
    pm_scope: '',
    pm_modeltype: 'Equation',
    pm_useworkingdays: 'No',
    pm_version: '1.0',
    statuscode: 'Sealed',
    ...partial,
  };
}

describe('collectPmKpiIds', () => {
  it('unions sealed result KPI with equation and relation components', () => {
    const models = [
      model({ pm_modelid: 'm1', pm_resultref: 'result-a', pm_modeltypevalue: 3 }),
      model({ pm_modelid: 'm2', pm_resultkind: 'OrgOutput', pm_resultref: 'out-1', statuscode: 'Draft' }),
    ];
    const terms: ModelTerm[] = [
      { pm_modeltermid: 't1', pm_model: 'm1', pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'comp-1' },
    ];
    const factors: RelationFactor[] = [
      {
        pm_relationfactorid: 'f1',
        pm_model: 'm1',
        pm_factorkpi: 'comp-2',
        pm_direction: 'Increases',
        pm_inputpct: 1,
        pm_resultpct: 1,
      },
    ];
    expect([...collectPmKpiIds(models, terms, factors)].sort()).toEqual(['comp-1', 'comp-2', 'result-a']);
  });

  it('treats null and zero targets as missing', () => {
    expect(isMissingTarget(null)).toBe(true);
    expect(isMissingTarget(0)).toBe(true);
    expect(isMissingTarget(12)).toBe(false);
  });
});
