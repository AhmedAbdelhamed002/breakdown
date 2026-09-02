import type { ModelTerm } from '../models/types';

function isOperand(term: ModelTerm): boolean {
  return term.pm_termtype === 'KPI' || term.pm_termtype === 'Constant';
}

function orderedTerms(terms: ModelTerm[]): ModelTerm[] {
  return [...terms].sort((a, b) => (a.pm_sequence || 0) - (b.pm_sequence || 0));
}

/** True when two operands sit next to each other with no operator between them. */
export function equationMissingOperators(terms: ModelTerm[]): boolean {
  const ordered = orderedTerms(terms);
  let prevOperand = false;
  for (const term of ordered) {
    if (term.pm_termtype === 'Bracket') {
      if (term.pm_operator === ')') prevOperand = true;
      continue;
    }
    if (isOperand(term)) {
      if (prevOperand) return true;
      prevOperand = true;
      continue;
    }
    if (term.pm_termtype === 'Operator') prevOperand = false;
  }
  return false;
}

function multiplyTerm(modelId: string): ModelTerm {
  return {
    pm_modeltermid: '',
    pm_model: modelId,
    pm_sequence: 0,
    pm_termtype: 'Operator',
    pm_operator: '×',
  };
}

/** Inserts × between adjacent operands (and between `KPI (` / `) KPI`). */
export function insertDefaultMultiplyOperators(terms: ModelTerm[]): ModelTerm[] {
  const ordered = orderedTerms(terms);
  const out: ModelTerm[] = [];
  let prevOperand = false;
  const modelId = terms[0]?.pm_model || '';

  for (const term of ordered) {
    const needsMultiply =
      (isOperand(term) && prevOperand) ||
      (term.pm_termtype === 'Bracket' && term.pm_operator === '(' && prevOperand);

    if (needsMultiply) {
      out.push(multiplyTerm(modelId));
      prevOperand = false;
    }

    out.push(term);

    if (isOperand(term) || (term.pm_termtype === 'Bracket' && term.pm_operator === ')')) {
      prevOperand = true;
    } else if (term.pm_termtype === 'Operator') {
      prevOperand = false;
    }
  }

  return out.map((term, index) => ({ ...term, pm_sequence: index + 1 }));
}
