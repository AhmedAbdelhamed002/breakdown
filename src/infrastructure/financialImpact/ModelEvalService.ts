import { FinancialModel, ModelTerm, OperatorSymbol } from './ModelService';

/** Values keyed by KPI id. */
export type KpiValues = Record<string, number>;

export interface EvalContext {
  /**
   * KPIs whose aggregation is 'Percentage'. They're stored 0-100 but act as fractions inside an
   * equation (80% -> 0.80), so they're scaled down before being multiplied in.
   */
  percentageKpiIds: Set<string>;
  /** The month's working days; only applied when the model opts in via useWorkingDays. */
  workingDays?: number | null;
}

/** A term's raw value, before any percentage scaling. */
function rawTermValue(term: ModelTerm, values: KpiValues): number {
  if (term.kind === 'kpi' && term.kpiId) return Number(values[term.kpiId] ?? 0);
  return Number(term.constantValue ?? 0);
}

/** One run of operands joined by × / ÷, between the equation's + and − boundaries. */
interface ProductGroup {
  terms: ModelTerm[];
  /** Operator joining each term to the previous one within the group; [0] is unused. */
  operators: OperatorSymbol[];
}

/**
 * Evaluate an equation model with normal arithmetic precedence (× and ÷ bind tighter than
 * + and −). The first term's operator is ignored.
 *
 * Percentage KPIs are stored 0-100. They only behave as fractions when they scale something
 * else (`visits × utilization%` -> ×0.80), so they're divided by 100 only inside a product of
 * two or more operands. A percentage that stands alone as an added or subtracted operand stays
 * in percentage points, which is what an equation like `%A − %B + 23` means.
 */
export function evalEquation(terms: ModelTerm[], values: KpiValues, ctx: EvalContext): number {
  if (terms.length === 0) return 0;

  // Pass 1 — split into product groups at every + / − boundary.
  const groups: ProductGroup[] = [];
  const groupOps: OperatorSymbol[] = [];
  terms.forEach((term, i) => {
    if (i === 0) { groups.push({ terms: [term], operators: [term.operator] }); return; }
    if (term.operator === '×' || term.operator === '÷') {
      const group = groups[groups.length - 1];
      group.terms.push(term);
      group.operators.push(term.operator);
    } else {
      groupOps.push(term.operator);
      groups.push({ terms: [term], operators: [term.operator] });
    }
  });

  // Pass 2 — evaluate each group, scaling percentages only where they act as multipliers.
  const groupValues = groups.map(group => {
    const scalePercentages = group.terms.length > 1;
    return group.terms.reduce((acc, term, i) => {
      let value = rawTermValue(term, values);
      if (scalePercentages && term.kind === 'kpi' && term.kpiId && ctx.percentageKpiIds.has(term.kpiId)) {
        value = value / 100;
      }
      if (i === 0) return value;
      return group.operators[i] === '÷' ? (value === 0 ? NaN : acc / value) : acc * value;
    }, 0);
  });

  // Pass 3 — apply the remaining + and − in order.
  let result = groupValues[0];
  groupOps.forEach((op, i) => {
    result = op === '−' ? result - groupValues[i + 1] : result + groupValues[i + 1];
  });
  return result;
}

/**
 * Evaluate a relation model: start from the model's baseline and compound each factor's
 * sensitivity. A factor reads "when this KPI moves inputPct%, the result moves resultPct%",
 * so a component's actual % change is scaled by (resultPct / inputPct).
 */
export function evalRelation(model: FinancialModel, values: KpiValues, baseValues: KpiValues): number {
  let result = model.baseline;
  model.factors.forEach(factor => {
    if (!factor.kpiId || !factor.inputPct) return;
    const current = values[factor.kpiId];
    const base = baseValues[factor.kpiId] || current;
    if (!base || current == null) return;
    const changePct = ((current - base) / base) * 100;
    const effectPct = (changePct / factor.inputPct) * factor.resultPct;
    result = result * (1 + effectPct / 100);
  });
  return result;
}

/** Models that opt in scale their result by the month's working days. */
export function workingMultiplier(model: FinancialModel, ctx: EvalContext): number {
  if (!model.useWorkingDays) return 1;
  return ctx.workingDays == null ? 1 : ctx.workingDays;
}

/**
 * The model's result for a set of component values — the single entry point the UI should use,
 * so equation vs relation and the working-days multiplier are handled consistently.
 */
export function recomputeResult(
  model: FinancialModel,
  baseValues: KpiValues,
  overrides: KpiValues,
  ctx: EvalContext
): number {
  const values = { ...baseValues, ...overrides };
  const base = model.kind === 'Relation'
    ? evalRelation(model, values, baseValues)
    : evalEquation(model.terms, values, ctx);
  const result = base * workingMultiplier(model, ctx);
  return isFinite(result) ? result : 0;
}

/** Human-readable form of the model, shown above the component table. */
export function equationString(model: FinancialModel): string {
  if (model.kind === 'Relation') {
    const resultLabel = model.resultKpiName || model.name;
    return model.factors
      .map(f => {
        const arrow = f.resultPct >= 0 ? '↑' : '↓';
        return `${f.kpiName || f.name} ↑${f.inputPct}% → ${resultLabel} ${arrow}${Math.abs(f.resultPct)}%`;
      })
      .join('  ·  ');
  }
  const equation = model.terms
    .map((t, i) => {
      const label = t.kind === 'kpi' ? (t.kpiName || 'Unnamed KPI') : String(t.constantValue ?? 0);
      return i === 0 ? label : `${t.operator} ${label}`;
    })
    .join(' ');
  return model.resultKpiName ? `${equation} = ${model.resultKpiName}` : equation;
}

/**
 * True when a model's own result KPI is also one of its own equation terms, alongside at least
 * one other term — the self-referential "current KPI adjusted by a %" pattern (e.g.
 * NewValue = OldValue × (1 + factor%)). Mirrors the Financial Modeler's own
 * findRepeatedResultKpiId (features/financial/utils/equationTestPercent.ts), adapted to this
 * module's own FinancialModel/ModelTerm shape so consumers outside the financial feature (POC/
 * Tactic Impact) can use the identical rule without a cross-feature import. Only meaningful for
 * Equation-kind models — a Relation's own factors work differently, same scope the Financial
 * Modeler's own version applies this to.
 */
export function isRepeatedResultKpi(model: FinancialModel, kpiId: string): boolean {
  if (model.kind !== 'Equation' || model.resultKind !== 'kpi' || !kpiId || model.resultKpiId !== kpiId) return false;
  const termKpiIds = model.terms.filter(t => t.kind === 'kpi').map(t => t.kpiId);
  return termKpiIds.includes(kpiId) && termKpiIds.some(id => id && id !== kpiId);
}

/** Prefer Baseline over Actual as the % reference base — same preference as the Financial
 * Modeler's own percentReferenceBase. */
export function percentReferenceBase(baseline: number | null | undefined, actual: number | null | undefined): number | null {
  if (baseline != null && Number.isFinite(baseline)) return baseline;
  if (actual != null && Number.isFinite(actual)) return actual;
  return null;
}

/** Same conversions as the Financial Modeler's own testValueFromPercent/percentFromTestValue. */
export function valueFromPercent(percent: number, base: number): number {
  return (percent / 100) * base;
}

export function percentFromValue(value: number, base: number): number | null {
  if (!Number.isFinite(base) || base === 0) return null;
  if (!Number.isFinite(value)) return null;
  return (value / base) * 100;
}

/**
 * The same equation, broken into typed pieces instead of one flat string — a KPI name can run to
 * a full sentence (e.g. a name someone wrote as its own description), and gluing that straight
 * into "... → resultName ↑5%" makes it unreadable: there's no visual boundary telling you where
 * one name ends and the next operator/percentage begins. Rendered as chips (see EquationDisplay),
 * each operand gets its own bounded box regardless of how long its name is.
 */
export type EquationPart =
  | { kind: 'operand'; text: string }
  | { kind: 'operator'; text: string }
  | { kind: 'arrow' }
  | { kind: 'percent'; text: string; up: boolean }
  | { kind: 'separator' };

export function equationParts(model: FinancialModel): EquationPart[] {
  if (model.kind === 'Relation') {
    const resultLabel = model.resultKpiName || model.name;
    const parts: EquationPart[] = [];
    model.factors.forEach((f, i) => {
      if (i > 0) parts.push({ kind: 'separator' });
      parts.push({ kind: 'operand', text: f.kpiName || f.name });
      parts.push({ kind: 'percent', text: `${f.inputPct}%`, up: true });
      parts.push({ kind: 'arrow' });
      parts.push({ kind: 'operand', text: resultLabel });
      parts.push({ kind: 'percent', text: `${Math.abs(f.resultPct)}%`, up: f.resultPct >= 0 });
    });
    return parts;
  }
  const parts: EquationPart[] = [];
  model.terms.forEach((t, i) => {
    if (i > 0) parts.push({ kind: 'operator', text: t.operator });
    const label = t.kind === 'kpi' ? (t.kpiName || 'Unnamed KPI') : String(t.constantValue ?? 0);
    parts.push({ kind: 'operand', text: label });
  });
  // The model's own Result (from pm_CalculatedKPI / pm_LinkedOutcome / pm_linkedoutput, whichever
  // is populated — see ModelService's resolveResult) — shown as what the equation computes.
  if (model.resultKpiName) {
    parts.push({ kind: 'operator', text: '=' });
    parts.push({ kind: 'operand', text: model.resultKpiName });
  }
  return parts;
}
