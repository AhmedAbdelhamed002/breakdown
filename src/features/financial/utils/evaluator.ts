import type { ModelTerm, RelationFactor, EvalResult, AggregateType } from '../models/types';

/**
 * Pulse-aligned equation / relation / solver helpers.
 * Source: pulse_unified_v1 — evalEq, evalRelation, solveForResult, recomputeResult.
 */

export function isPureProduct(terms: ModelTerm[]): boolean {
  return (
    terms.length > 0 &&
    terms.every(
      (t) =>
        t.pm_termtype === 'KPI' ||
        t.pm_termtype === 'Constant' ||
        t.pm_termtype === 'Bracket' ||
        (t.pm_termtype === 'Operator' && (t.pm_operator === '×' || (t.pm_operator as string) === '*'))
    )
  );
}

// kpiAgg is threaded through from termsToTokens/evalEquation for a future percentage-KPI scaling
// step (mirrors ModelEvalService's EvalContext.percentageKpiIds) — not implemented here yet.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- this repo's config doesn't ignore leading-underscore args, unlike tsc's own noUnusedParameters
function kpiValue(kpiId: string, vals: Map<string, number>, _kpiAgg?: Map<string, AggregateType | string>): number {
  return mapNumber(vals, kpiId);
}

function normalizeId(id: string): string {
  return String(id ?? '').replace(/[{}]/g, '').toLowerCase().trim();
}

function mapNumber(map: Map<string, number>, id: string): number {
  if (!id) return 0;
  if (map.has(id)) {
    const n = Number(map.get(id));
    return Number.isFinite(n) ? n : 0;
  }
  const key = normalizeId(id);
  for (const [k, v] of map) {
    if (normalizeId(k) === key) {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

type ExprTok =
  | { kind: 'num'; value: number; label: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lp' }
  | { kind: 'rp' };

function mapOperatorSymbol(raw: string | undefined): '+' | '-' | '*' | '/' | null {
  const op = String(raw ?? '').trim();
  if (op === '×' || op === '*' || op.toLowerCase() === 'x') return '*';
  if (op === '÷' || op === '/') return '/';
  if (op === '+') return '+';
  if (op === '−' || op === '–' || op === '-') return '-';
  return null;
}

function isOperandTok(tok: ExprTok | undefined): boolean {
  return tok?.kind === 'num' || tok?.kind === 'rp';
}

function termsToTokens(
  terms: ModelTerm[],
  values: Map<string, number>,
  kpiAgg?: Map<string, AggregateType | string>
): ExprTok[] {
  const ordered = [...terms].sort((a, b) => (a.pm_sequence || 0) - (b.pm_sequence || 0));
  const tokens: ExprTok[] = [];

  const pushNum = (value: number, label: string) => {
    if (isOperandTok(tokens[tokens.length - 1])) {
      tokens.push({ kind: 'op', value: '*' });
    }
    tokens.push({ kind: 'num', value, label });
  };

  for (const t of ordered) {
    if (t.pm_termtype === 'KPI') {
      const n = kpiValue(t.pm_kpi || '', values, kpiAgg);
      pushNum(n, String(n));
      continue;
    }
    if (t.pm_termtype === 'Constant') {
      const n = Number(t.pm_constant);
      const v = Number.isFinite(n) ? n : 0;
      pushNum(v, String(v));
      continue;
    }
    if (t.pm_termtype === 'Bracket') {
      const closing = t.pm_operator === ')';
      if (closing) {
        tokens.push({ kind: 'rp' });
      } else {
        if (isOperandTok(tokens[tokens.length - 1])) {
          tokens.push({ kind: 'op', value: '*' });
        }
        tokens.push({ kind: 'lp' });
      }
      continue;
    }
    if (t.pm_termtype === 'Operator') {
      const op = mapOperatorSymbol(t.pm_operator as string);
      if (op) tokens.push({ kind: 'op', value: op });
    }
  }

  while (tokens.length && tokens[tokens.length - 1].kind === 'op') {
    tokens.pop();
  }
  return tokens;
}

function evalTokens(tokens: ExprTok[]): number {
  if (tokens.length === 0) return 0;

  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const output: ExprTok[] = [];
  const ops: Array<'+' | '-' | '*' | '/' | '('> = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === 'num') {
      output.push(tok);
      continue;
    }
    if (tok.kind === 'lp') {
      ops.push('(');
      continue;
    }
    if (tok.kind === 'rp') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        output.push({ kind: 'op', value: ops.pop() as '+' | '-' | '*' | '/' });
      }
      if (ops[ops.length - 1] === '(') ops.pop();
      continue;
    }

    const unary =
      tok.value === '-' &&
      (i === 0 || tokens[i - 1].kind === 'op' || tokens[i - 1].kind === 'lp');
    if (unary) {
      output.push({ kind: 'num', value: 0, label: '0' });
    }

    while (
      ops.length &&
      ops[ops.length - 1] !== '(' &&
      prec[ops[ops.length - 1]] >= prec[tok.value]
    ) {
      output.push({ kind: 'op', value: ops.pop() as '+' | '-' | '*' | '/' });
    }
    ops.push(tok.value);
  }

  while (ops.length) {
    const op = ops.pop();
    if (op && op !== '(') output.push({ kind: 'op', value: op });
  }

  const stack: number[] = [];
  for (const tok of output) {
    if (tok.kind === 'num') {
      stack.push(tok.value);
      continue;
    }
    if (tok.kind !== 'op') continue;
    const b = stack.pop() ?? 0;
    const a = stack.pop() ?? 0;
    if (tok.value === '+') stack.push(a + b);
    else if (tok.value === '-') stack.push(a - b);
    else if (tok.value === '*') stack.push(a * b);
    else stack.push(b === 0 ? 0 : a / b);
  }

  const result = stack.pop();
  return Number.isFinite(result) ? (result as number) : 0;
}

function formatExpression(tokens: ExprTok[]): string {
  const pretty: Record<string, string> = { '*': '×', '/': '÷', '+': '+', '-': '−' };
  return tokens
    .map((tok) => {
      if (tok.kind === 'num') return tok.label;
      if (tok.kind === 'lp') return '(';
      if (tok.kind === 'rp') return ')';
      return pretty[tok.value] ?? tok.value;
    })
    .join(' ');
}

/**
 * Evaluates an equation stored as ordered tokens.
 * Adjacent KPI/constant values multiply (so KPI KPI + 23 still computes).
 * Does not use eval / Function — those are blocked in Power Apps.
 */
export function evalEquation(
  terms: ModelTerm[],
  values: Map<string, number>,
  workingDays?: number,
  kpiAgg?: Map<string, AggregateType | string>
): EvalResult {
  const tokens = termsToTokens(terms, values, kpiAgg);
  let result = evalTokens(tokens);
  if (workingDays != null && workingDays > 0) result *= workingDays;
  return {
    value: result,
    wasClamped: false,
    expression: tokens.length ? formatExpression(tokens) : undefined,
  };
}

/**
 * Pulse evalRelation: result baseline adjusted by each factor's % sensitivity.
 * result = baseline * Π (1 + effect/100) where effect = (changePct / inPct) * outPct
 */
export function evalRelation(
  baseValue: number,
  factors: RelationFactor[],
  currentValues: Map<string, number>,
  baseValues: Map<string, number>
): EvalResult {
  let result = baseValue;

  for (const factor of factors) {
    const cur = mapNumber(currentValues, factor.pm_factorkpi);
    const base = mapNumber(baseValues, factor.pm_factorkpi) || cur;
    if (!base) continue;

    const changePct = ((cur - base) / base) * 100;
    const inPct = factor.pm_inputpct || 1;
    const outPct = factor.pm_resultpct || 0;
    // Direction on the factor KPI: Decreases flips the sensitivity sign of outPct
    // when outPct is stored as magnitude+direction separately. Pulse stores signed outPct.
    if (factor.pm_direction === 'Decreases' && outPct > 0 && !Object.prototype.hasOwnProperty.call(factor, '_signed')) {
      // Keep Pulse behaviour: outPct is already signed in seed data; direction is narrative.
    }
    const effect = (changePct / inPct) * outPct;
    result = result * (1 + effect / 100);
  }

  return { value: result, wasClamped: false };
}

export type SolveResult = {
  vals: Map<string, number>;
  capped: string[];
  ok: boolean;
  reason: string;
};

/**
 * Pulse solveForResult: for pure products, hold ceilinged comps at cap and scale free ones.
 * Working-days are applied outside (caller passes target already / WD).
 */
export function solveForResult(
  terms: ModelTerm[],
  componentKpiIds: string[],
  currentValues: Map<string, number>,
  ceilings: Map<string, { min?: number; max?: number }>,
  targetResult: number,
  workingDays?: number,
  kpiAgg?: Map<string, AggregateType | string>
): SolveResult {
  const out = new Map<string, number>(currentValues);
  // Solver works on pre-WD equation; strip WD from target if applied outside.
  const wd = workingDays != null && workingDays > 0 ? workingDays : 1;
  const target = targetResult / wd;

  const maxOf = (kpi: string) => {
    const c = ceilings.get(kpi);
    return c?.max != null ? c.max : null;
  };

  if (!isPureProduct(terms)) {
    const free = componentKpiIds.filter((c) => maxOf(c) == null);
    if (free.length !== 1) {
      return {
        vals: out,
        capped: [],
        ok: false,
        reason: 'Non-product equation — edit components directly.',
      };
    }
    const f = free[0];
    let lo = 0;
    let hi = Math.max(1, maxOf(f) ?? 1e12);
    for (let it = 0; it < 80; it++) {
      const mid = (lo + hi) / 2;
      out.set(f, mid);
      const v = evalEquation(terms, out, undefined, kpiAgg).value;
      if (v < target) lo = mid;
      else hi = mid;
    }
    out.set(f, (lo + hi) / 2);
    return { vals: out, capped: [], ok: true, reason: '' };
  }

  const capped = componentKpiIds.filter((c) => maxOf(c) != null);
  const free = componentKpiIds.filter((c) => maxOf(c) == null);
  capped.forEach((c) => out.set(c, maxOf(c)!));

  const cappedProduct = capped.reduce((p, c) => p * (out.get(c) || 1), 1);
  const constFactor = terms
    .filter((t) => t.pm_termtype === 'Constant')
    .reduce((p, t) => p * (Number(t.pm_constant) || 1), 1);
  // Percentage KPIs already scaled inside evalEq; for product solve use raw product of free comps.
  const base = cappedProduct * constFactor;

  if (free.length === 0) {
    const a = base;
    return {
      vals: out,
      capped,
      ok: Math.abs(a - target) < 0.5,
      reason:
        a < target
          ? `All components ceilinged; max ${Math.round(a)} < target ${Math.round(target)}`
          : a > target
            ? `All ceilinged; min ${Math.round(a)} > target ${Math.round(target)}`
            : '',
    };
  }

  const freeNow = free.reduce((p, c) => p * (currentValues.get(c) || 1), 1);
  const needed = target / (base || 1);
  if (needed <= 0 || !Number.isFinite(needed)) {
    return { vals: out, capped, ok: false, reason: 'Target not reachable.' };
  }
  const factor = Math.pow(needed / (freeNow || 1), 1 / free.length);
  free.forEach((c) => out.set(c, (currentValues.get(c) || 1) * factor));

  const got = evalEquation(terms, out, undefined, kpiAgg).value;
  return {
    vals: out,
    capped,
    ok: Math.abs(got - target) < Math.max(1, target * 0.001),
    reason: '',
  };
}

export function clampToConstraint(
  value: number,
  constraint: { min?: number; max?: number } | undefined
): { value: number; wasClamped: boolean; preClampValue?: number } {
  if (!constraint) return { value, wasClamped: false };

  let clampedValue = value;
  let wasClamped = false;

  if (constraint.max !== undefined && value > constraint.max) {
    clampedValue = constraint.max;
    wasClamped = true;
  } else if (constraint.min !== undefined && value < constraint.min) {
    clampedValue = constraint.min;
    wasClamped = true;
  }

  return {
    value: clampedValue,
    wasClamped,
    preClampValue: wasClamped ? value : undefined,
  };
}

export function violatesConstraint(
  value: number,
  constraint: { min?: number; max?: number } | undefined
): boolean {
  if (!constraint) return false;
  if (constraint.min !== undefined && value < constraint.min) return true;
  if (constraint.max !== undefined && value > constraint.max) return true;
  return false;
}

export function constraintLimitsPhrase(
  constraint: { min?: number; max?: number } | undefined
): string {
  if (!constraint) return '';
  const hasMin = constraint.min !== undefined;
  const hasMax = constraint.max !== undefined;
  if (hasMin && hasMax) return `${constraint.min} and ${constraint.max}`;
  if (hasMin) return `minimum ${constraint.min}`;
  if (hasMax) return `maximum ${constraint.max}`;
  return '';
}

export function constraintRefusalMessage(
  kpiName: string,
  constraint: { min?: number; max?: number } | undefined
): string {
  const limits = constraintLimitsPhrase(constraint);
  if (!limits) return `${kpiName} has a constraint. Enter a valid proposed value.`;
  return `${kpiName} has a constraint with limits ${limits} only. Enter a valid proposed value.`;
}

/** Pulse recomputeResult: eval × working days, then clamp result KPI. */
export function recomputeResult(opts: {
  type: 'Equation' | 'Relation';
  terms: ModelTerm[];
  factors: RelationFactor[];
  baseline: number;
  values: Map<string, number>;
  baseValues: Map<string, number>;
  workingDays?: number;
  resultConstraint?: { min?: number; max?: number };
  kpiAgg?: Map<string, AggregateType | string>;
}): EvalResult {
  const rawEval =
    opts.type === 'Relation'
      ? evalRelation(opts.baseline, opts.factors, opts.values, opts.baseValues)
      : evalEquation(opts.terms, opts.values, undefined, opts.kpiAgg);
  const raw = rawEval.value;

  const wd = opts.workingDays != null && opts.workingDays > 0 ? opts.workingDays : 1;
  const withWd = raw * wd;
  const clamped = clampToConstraint(withWd, opts.resultConstraint);
  return {
    value: clamped.value,
    wasClamped: clamped.wasClamped,
    preClampValue: clamped.preClampValue,
    expression: rawEval.expression,
  };
}
