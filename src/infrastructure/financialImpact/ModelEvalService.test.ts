import { describe, expect, it } from 'vitest';
import type { FinancialModel, ModelTerm } from './ModelService';
import { isRepeatedResultKpi, percentReferenceBase, valueFromPercent, percentFromValue } from './ModelEvalService';

function kpiTerm(kpiId: string, sequence: number): ModelTerm {
  return { id: `t${sequence}`, name: `Term ${sequence}`, sequence, kind: 'kpi', operator: '×', kpiId };
}

function model(partial: Partial<FinancialModel> & Pick<FinancialModel, 'terms'>): FinancialModel {
  return {
    id: 'm1',
    name: 'Model',
    kind: 'Equation',
    resultKind: 'kpi',
    resultKpiId: 'charge',
    baseline: 0,
    useWorkingDays: false,
    factors: [],
    ...partial,
  };
}

describe('isRepeatedResultKpi', () => {
  it('is true when the result KPI is also a term alongside at least one other term', () => {
    const m = model({ terms: [kpiTerm('charge', 1), kpiTerm('factor', 2)] });
    expect(isRepeatedResultKpi(m, 'charge')).toBe(true);
  });

  it('is false when the result KPI is the only term (nothing else to be "relative to")', () => {
    const m = model({ terms: [kpiTerm('charge', 1)] });
    expect(isRepeatedResultKpi(m, 'charge')).toBe(false);
  });

  it('is false when the queried KPI is not the model\'s own result', () => {
    const m = model({ terms: [kpiTerm('charge', 1), kpiTerm('factor', 2)] });
    expect(isRepeatedResultKpi(m, 'factor')).toBe(false);
  });

  it('is false for a Relation-kind model, same scope as the Financial Modeler\'s own version', () => {
    const m = model({ kind: 'Relation', terms: [kpiTerm('charge', 1), kpiTerm('factor', 2)] });
    expect(isRepeatedResultKpi(m, 'charge')).toBe(false);
  });

  it('is false when the result kind is not KPI (an Org Output/Outcome result)', () => {
    const m = model({ resultKind: 'output', terms: [kpiTerm('charge', 1), kpiTerm('factor', 2)] });
    expect(isRepeatedResultKpi(m, 'charge')).toBe(false);
  });
});

describe('percentReferenceBase', () => {
  it('prefers Baseline over Actual', () => {
    expect(percentReferenceBase(1200, 1000)).toBe(1200);
  });
  it('falls back to Actual when Baseline is missing', () => {
    expect(percentReferenceBase(null, 1000)).toBe(1000);
  });
  it('is null when neither is available', () => {
    expect(percentReferenceBase(null, null)).toBeNull();
  });
});

describe('valueFromPercent / percentFromValue', () => {
  it('converts bidirectionally', () => {
    expect(valueFromPercent(20, 1000)).toBe(200);
    expect(percentFromValue(200, 1000)).toBe(20);
  });
  it('guards a zero or non-finite base', () => {
    expect(percentFromValue(100, 0)).toBeNull();
    expect(percentFromValue(100, NaN)).toBeNull();
  });
});
