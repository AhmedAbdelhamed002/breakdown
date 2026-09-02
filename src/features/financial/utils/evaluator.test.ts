import { describe, expect, it } from 'vitest';
import { constraintRefusalMessage, evalEquation, violatesConstraint } from './evaluator';
import type { ModelTerm } from '../models/types';

function term(partial: Partial<ModelTerm> & Pick<ModelTerm, 'pm_termtype'>): ModelTerm {
  return {
    pm_modeltermid: partial.pm_modeltermid || 't',
    pm_model: 'm',
    pm_sequence: partial.pm_sequence || 1,
    pm_termtype: partial.pm_termtype,
    pm_kpi: partial.pm_kpi,
    pm_operator: partial.pm_operator,
    pm_constant: partial.pm_constant,
  };
}

describe('evalEquation', () => {
  it('adds and subtracts KPI test values with a constant', () => {
    const terms: ModelTerm[] = [
      term({ pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'a' }),
      term({ pm_sequence: 2, pm_termtype: 'Operator', pm_operator: '−' }),
      term({ pm_sequence: 3, pm_termtype: 'KPI', pm_kpi: 'b' }),
      term({ pm_sequence: 4, pm_termtype: 'Operator', pm_operator: '+' }),
      term({ pm_sequence: 5, pm_termtype: 'Constant', pm_constant: 23 }),
    ];
    const values = new Map([
      ['a', 123],
      ['b', 235],
    ]);
    expect(evalEquation(terms, values).value).toBe(123 - 235 + 23);
  });

  it('multiplies adjacent KPIs when an operator is missing', () => {
    const terms: ModelTerm[] = [
      term({ pm_sequence: 1, pm_termtype: 'KPI', pm_kpi: 'a' }),
      term({ pm_sequence: 2, pm_termtype: 'KPI', pm_kpi: 'b' }),
      term({ pm_sequence: 3, pm_termtype: 'Operator', pm_operator: '+' }),
      term({ pm_sequence: 4, pm_termtype: 'Constant', pm_constant: 23 }),
    ];
    const values = new Map([
      ['a', 123],
      ['b', 235],
    ]);
    expect(evalEquation(terms, values).value).toBe(123 * 235 + 23);
  });

  it('respects brackets and division', () => {
    const terms: ModelTerm[] = [
      term({ pm_sequence: 1, pm_termtype: 'Bracket', pm_operator: '(' }),
      term({ pm_sequence: 2, pm_termtype: 'KPI', pm_kpi: 'a' }),
      term({ pm_sequence: 3, pm_termtype: 'Operator', pm_operator: '+' }),
      term({ pm_sequence: 4, pm_termtype: 'KPI', pm_kpi: 'b' }),
      term({ pm_sequence: 5, pm_termtype: 'Bracket', pm_operator: ')' }),
      term({ pm_sequence: 6, pm_termtype: 'Operator', pm_operator: '÷' }),
      term({ pm_sequence: 7, pm_termtype: 'Constant', pm_constant: 2 }),
    ];
    const values = new Map([
      ['a', 10],
      ['b', 6],
    ]);
    expect(evalEquation(terms, values).value).toBe(8);
  });
});

describe('KPI ceiling constraints', () => {
  const hours = { min: 6, max: 10 };

  it('rejects test values outside min and max', () => {
    expect(violatesConstraint(20, hours)).toBe(true);
    expect(violatesConstraint(5, hours)).toBe(true);
    expect(violatesConstraint(6, hours)).toBe(false);
    expect(violatesConstraint(10, hours)).toBe(false);
    expect(violatesConstraint(8, hours)).toBe(false);
  });

  it('builds a refusal message with the enforced limits', () => {
    expect(constraintRefusalMessage('Hours per day', hours)).toBe(
      'Hours per day has a constraint with limits 6 and 10 only. Enter a valid proposed value.'
    );
  });
});
