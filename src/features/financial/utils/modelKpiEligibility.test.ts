import { describe, expect, it } from 'vitest';
import type { FinancialModel, ModelTerm, RelationFactor, StrategyKpi } from '../models/types';
import {
  collectCalculatedKpiIds,
  filterInputKpis,
  filterRelationInputKpis,
  getModelResultKpiId,
  hasNumericActualOrBaseline,
  inputKpiViolationMessage,
  relationMissingSourceMessage,
  relationProposalBlockedMessage,
  relationFactorRowsMissingSourceMessage,
  stripResultKpiFactors,
  stripResultKpiTerms,
} from './modelKpiEligibility';

function model(partial: Partial<FinancialModel> & Pick<FinancialModel, 'pm_modelid'>): FinancialModel {
  return {
    pm_resultkind: 'KPI',
    pm_resultref: '',
    pm_scope: '',
    pm_modeltype: 'Relation',
    pm_useworkingdays: 'No',
    pm_version: '0.1',
    statuscode: 'Draft',
    ...partial,
  };
}

function kpi(id: string): StrategyKpi {
  return {
    strategy_kpisid: id,
    btm_kpibusinessname: id,
  } as StrategyKpi;
}

describe('modelKpiEligibility', () => {
  it('reads the result KPI from calculated lookup or result ref', () => {
    expect(
      getModelResultKpiId(
        model({ pm_modelid: 'm1', pm_calculatedkpi: '{AAA}', pm_resultref: 'bbb' })
      )
    ).toBe('aaa');
    expect(getModelResultKpiId(model({ pm_modelid: 'm1', pm_resultkind: 'OrgOutput', pm_resultref: 'x' }))).toBe(
      ''
    );
  });

  it('collects calculated KPIs from active models only', () => {
    const ids = collectCalculatedKpiIds([
      model({ pm_modelid: 'a', pm_resultref: 'kpi-a' }),
      model({ pm_modelid: 'b', pm_resultref: 'kpi-b', statuscode: 'Sealed' }),
      model({ pm_modelid: 'c', pm_resultref: 'kpi-c', statuscode: 'Retired' }),
      model({ pm_modelid: 'd', pm_resultref: 'kpi-d', statuscode: 'Superseded' }),
      model({ pm_modelid: 'e', pm_resultkind: 'OrgOutcome', pm_resultref: 'out-1' }),
    ]);
    expect([...ids].sort()).toEqual(['kpi-a', 'kpi-b']);
  });

  it('excludes the result KPI and other calculated KPIs from input lists', () => {
    const models = [
      model({ pm_modelid: 'current', pm_resultref: 'result-kpi' }),
      model({ pm_modelid: 'other', pm_resultref: 'calc-kpi', statuscode: 'Sealed' }),
    ];
    const filtered = filterInputKpis(
      [kpi('result-kpi'), kpi('calc-kpi'), kpi('input-kpi')],
      models,
      models[0]
    );
    expect(filtered.map((k) => k.strategy_kpisid)).toEqual(['input-kpi']);
  });

  it('makes the previous calculated KPI selectable after the result changes', () => {
    const stale = model({ pm_modelid: 'current', pm_resultref: 'old-kpi' });
    const current = model({
      pm_modelid: 'current',
      pm_resultkind: 'OrgOutcome',
      pm_resultref: 'out-1',
    });
    const other = model({ pm_modelid: 'other', pm_resultref: 'calc-kpi', statuscode: 'Sealed' });
    const filtered = filterInputKpis(
      [kpi('old-kpi'), kpi('calc-kpi'), kpi('input-kpi')],
      [stale, other],
      current
    );
    expect(filtered.map((k) => k.strategy_kpisid).sort()).toEqual(['input-kpi', 'old-kpi']);
  });

  it('strips the result KPI from terms and factors', () => {
    const terms: ModelTerm[] = [
      { pm_modeltermid: '1', pm_model: 'm', pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'keep' },
      { pm_modeltermid: '2', pm_model: 'm', pm_sequence: 2, pm_termtype: 'KPI', pm_kpi: 'result' },
    ];
    const factors: RelationFactor[] = [
      { pm_relationfactorid: 'f1', pm_model: 'm', pm_factorkpi: 'result', pm_direction: 'Increases', pm_inputpct: 1, pm_resultpct: 1 },
      { pm_relationfactorid: 'f2', pm_model: 'm', pm_factorkpi: 'keep', pm_direction: 'Increases', pm_inputpct: 1, pm_resultpct: 1 },
    ];
    expect(stripResultKpiTerms(terms, 'result').map((t) => t.pm_kpi)).toEqual(['keep']);
    expect(stripResultKpiFactors(factors, 'result').map((f) => f.pm_factorkpi)).toEqual(['keep']);
  });

  it('reports save violations for result and calculated KPIs', () => {
    const current = model({ pm_modelid: 'current', pm_modeltype: 'Equation', pm_resultref: 'r1' });
    const other = model({ pm_modelid: 'other', pm_resultref: 'c1', statuscode: 'Sealed' });
    const resultTerm: ModelTerm[] = [
      { pm_modeltermid: '1', pm_model: 'current', pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'r1' },
    ];
    const calcTerm: ModelTerm[] = [
      { pm_modeltermid: '1', pm_model: 'current', pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'c1' },
    ];
    expect(inputKpiViolationMessage(resultTerm, [], current, [current, other])).toMatch(/result KPI/);
    expect(inputKpiViolationMessage(calcTerm, [], current, [current, other])).toMatch(/calculated KPI/);
    expect(
      inputKpiViolationMessage(
        [{ pm_modeltermid: '1', pm_model: 'current', pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'ok' }],
        [],
        current,
        [current, other]
      )
    ).toBeNull();
  });

  it('treats zero as a valid actual or baseline', () => {
    expect(hasNumericActualOrBaseline(0, undefined)).toBe(true);
    expect(hasNumericActualOrBaseline(undefined, 0)).toBe(true);
    expect(hasNumericActualOrBaseline(undefined, undefined)).toBe(false);
    expect(hasNumericActualOrBaseline(null, null)).toBe(false);
  });

  it('keeps only relation KPIs that have actual or baseline', () => {
    const models = [model({ pm_modelid: 'current', pm_resultref: 'result-kpi' })];
    const filtered = filterRelationInputKpis(
      [kpi('result-kpi'), kpi('with-source'), kpi('no-source')],
      models,
      (id) => id === 'with-source',
      models[0]
    );
    expect(filtered.map((k) => k.strategy_kpisid)).toEqual(['with-source']);
  });

  it('reports relation factors that have no actual or baseline', () => {
    const factors: RelationFactor[] = [
      {
        pm_relationfactorid: 'f1',
        pm_model: 'm',
        pm_factorkpi: 'no-source',
        pm_direction: 'Increases',
        pm_inputpct: 1,
        pm_resultpct: 1,
      },
    ];
    expect(relationMissingSourceMessage(factors, () => true)).toBeNull();
    expect(relationMissingSourceMessage(factors, () => false, () => 'Occupancy')).toMatch(
      /Occupancy has no actual or baseline/
    );
  });

  it('blocks proposal save when relation factor KPIs lack Actual and Baseline', () => {
    const factors: RelationFactor[] = [
      {
        pm_relationfactorid: 'f1',
        pm_model: 'm',
        pm_factorkpi: 'kpi-a',
        pm_direction: 'Increases',
        pm_inputpct: 1,
        pm_resultpct: 1,
      },
    ];
    expect(
      relationProposalBlockedMessage(factors, () => ({ actual: 10, baseline: null }), () => 'Visits')
    ).toBeNull();
    expect(
      relationProposalBlockedMessage(factors, () => ({ actual: null, baseline: null }), () => 'Visits')
    ).toMatch(/Visits: no Actual and no Baseline/);
  });

  it('blocks using tester factor rows (excludes result KPI)', () => {
    expect(
      relationFactorRowsMissingSourceMessage([
        { kpiId: 'f1', kpiName: 'Occupancy', actualValue: null, baselineValue: null },
      ])
    ).toMatch(/Occupancy: no Actual and no Baseline/);
    expect(
      relationFactorRowsMissingSourceMessage([
        { kpiId: 'f1', kpiName: 'Occupancy', actualValue: 12, baselineValue: null },
      ])
    ).toBeNull();
  });
});
