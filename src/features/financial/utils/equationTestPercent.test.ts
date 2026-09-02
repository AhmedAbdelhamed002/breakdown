import { describe, expect, it } from 'vitest';
import type { FinancialModel, ModelTerm, TesterComponentRow } from '../models/types';
import {
  findRepeatedResultKpiId,
  percentFromTestValue,
  percentReferenceBase,
  testValueFromPercent,
} from './equationTestPercent';

function model(partial: Partial<FinancialModel>): FinancialModel {
  return {
    pm_modelid: 'm1',
    pm_name: 'm',
    pm_resultkind: 'KPI',
    pm_resultref: 'charge',
    pm_calculatedkpi: 'charge',
    pm_scope: '',
    pm_modeltype: 'Equation',
    pm_useworkingdays: 'No',
    pm_version: '0.1',
    statuscode: 'Draft',
    ...partial,
  };
}

function term(kpiId: string, seq: number): ModelTerm {
  return {
    pm_modeltermid: `t${seq}`,
    pm_model: 'm1',
    pm_sequence: seq,
    pm_termtype: 'KPI',
    pm_kpi: kpiId,
  };
}

describe('equationTestPercent', () => {
  it('detects repeated result KPI only when other factors exist', () => {
    const terms: ModelTerm[] = [
      term('charge', 1),
      { ...term('charge', 2), pm_termtype: 'Operator', pm_operator: '×', pm_kpi: undefined },
      term('capex', 3),
      { ...term('capex', 4), pm_termtype: 'Operator', pm_operator: '×', pm_kpi: undefined },
      term('facility', 5),
    ];
    expect(findRepeatedResultKpiId(model({}), terms)).toBe('charge');
    expect(findRepeatedResultKpiId(model({}), [term('charge', 1)])).toBe('');
    expect(
      findRepeatedResultKpiId(
        model({ pm_resultref: 'other', pm_calculatedkpi: 'other' }),
        terms
      )
    ).toBe('');
  });

  it('prefers baseline then actual for the percent base', () => {
    const row = {
      baselineValue: 1200,
      actualValue: 1000,
    } as Pick<TesterComponentRow, 'baselineValue' | 'actualValue'>;
    expect(percentReferenceBase(row)).toBe(1200);
    expect(percentReferenceBase({ baselineValue: null, actualValue: 1000 })).toBe(1000);
    expect(percentReferenceBase({ baselineValue: null, actualValue: null })).toBeNull();
  });

  it('converts bidirectionally between test and test %', () => {
    expect(testValueFromPercent(20, 1000)).toBe(200);
    expect(percentFromTestValue(200, 1000)).toBe(20);
    expect(percentFromTestValue(100, 0)).toBeNull();
  });
});
