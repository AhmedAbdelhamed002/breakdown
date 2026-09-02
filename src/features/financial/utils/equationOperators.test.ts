import { describe, expect, it } from 'vitest';
import type { ModelTerm } from '../models/types';
import { equationMissingOperators, insertDefaultMultiplyOperators } from './equationOperators';

function term(partial: Partial<ModelTerm> & Pick<ModelTerm, 'pm_termtype' | 'pm_sequence'>): ModelTerm {
  return {
    pm_modeltermid: `t${partial.pm_sequence}`,
    pm_model: 'm',
    pm_kpi: partial.pm_kpi,
    pm_operator: partial.pm_operator,
    pm_constant: partial.pm_constant,
    ...partial,
  };
}

describe('equationMissingOperators', () => {
  it('is false for a single KPI', () => {
    expect(
      equationMissingOperators([term({ pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'a' })])
    ).toBe(false);
  });

  it('is true when KPIs have no operator between them', () => {
    expect(
      equationMissingOperators([
        term({ pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'a' }),
        term({ pm_sequence: 2, pm_termtype: 'KPI', pm_kpi: 'b' }),
        term({ pm_sequence: 3, pm_termtype: 'KPI', pm_kpi: 'c' }),
      ])
    ).toBe(true);
  });

  it('is false when operators are present', () => {
    expect(
      equationMissingOperators([
        term({ pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'a' }),
        term({ pm_sequence: 2, pm_termtype: 'Operator', pm_operator: '+' }),
        term({ pm_sequence: 3, pm_termtype: 'KPI', pm_kpi: 'b' }),
      ])
    ).toBe(false);
  });
});

describe('insertDefaultMultiplyOperators', () => {
  it('inserts × between adjacent KPIs', () => {
    const next = insertDefaultMultiplyOperators([
      term({ pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'a' }),
      term({ pm_sequence: 2, pm_termtype: 'KPI', pm_kpi: 'b' }),
      term({ pm_sequence: 3, pm_termtype: 'KPI', pm_kpi: 'c' }),
    ]);
    expect(next.map((t) => t.pm_termtype)).toEqual(['KPI', 'Operator', 'KPI', 'Operator', 'KPI']);
    expect(next.filter((t) => t.pm_termtype === 'Operator').every((t) => t.pm_operator === '×')).toBe(true);
    expect(equationMissingOperators(next)).toBe(false);
  });
});
