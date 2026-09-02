/** Central type definitions for the Target Setting module */

/** EntityRef/MonthlyLedger/MonthlyLedgerEntry now live in the shared financial-impact infrastructure (used by Strategy Formulation too) — re-exported here so every existing `from '../models/types'` import keeps working unchanged. */
export type { EntityRef, MonthlyLedger, MonthlyLedgerEntry } from '@infrastructure/financialImpact/types';

/** Aggregation type — determines sum vs average. 'Value' and 'Sum' both mean "add up"; both
 * spellings exist across the codebase (EntityService.BaseEntity uses 'Value', this module's own
 * fields use 'Sum') and rollUpValues treats them identically — only 'Percentage' branches. */
export type AggregationType = 'Sum' | 'Value' | 'Percentage';

/**
 * Rolls a set of child values into their parent, by the KPI's own aggregation type: a Value KPI's
 * parts add up, a Percentage KPI's parts average (e.g. Patient Satisfaction split Cash 60/Credit
 * 100 against an 80 target reads as 80, not 160). Used everywhere a breakdown rolls children into
 * a parent — the breakdown total and its status, the bulk sheet's running total, and the model
 * dialog's component/result figures — so every one of those reconciles the same way.
 */
export function rollUpValues(values: number[], aggType?: AggregationType): number {
  const total = values.reduce((sum, value) => sum + (value || 0), 0);
  const rolled = aggType === 'Percentage' ? (values.length ? total / values.length : 0) : total;
  return Math.round(rolled * 100) / 100;
}

/** A single month in the annual forecast strip */
export interface ForecastMonth {
  month: number;
  kind: 'actual' | 'forecast';
  value: number;
  delta: number;
}

/** A POC/Tactic project stacked into the forecast */
export interface ProjectEntry {
  pocId: string;
  name: string;
  kind: 'POC' | 'Tactic';
  model: string;
  comp: string;      // driver KPI id
  month: number;     // start month
  newVal: number;
  entkind: string;
  entid: string;
  bu: string;
}

/** Row in a breakdown table */
export interface BreakdownRow {
  id: string;
  kpi: string;
  /** Where the row sits, spelled out — 'OPD Volume > Cash'. Stored in stf_breakdownpath. */
  pathLabel: string;
  parentId: string | null;
  dimension: string;
  /** The picked value's label — the record's name, or the choice option. */
  name: string;
  /**
   * Which value of the dimension this row is: the linked record's id, or the choice's option
   * value. Null on a row whose lookup was never set.
   */
  optionId: string | null;
  level: number;
  historical: number;
  baseline: number;
  actual: number;
  /**
   * Whether stf_value holds a figure at all, so a row recorded at 0 reads differently from one
   * whose actual was never filled in — `actual` flattens both to 0.
   */
  actualRecorded?: boolean;
  target: number;
  comps?: Record<string, number>;
}

/** A breakdown path (e.g. "Payment Type", "Specialty") */
export interface BreakdownPath {
  /** A parent is broken down once per dimension, so the dimension identifies the path. */
  id: string;
  dimension: string;
  kpi: string;
  parentId: string | null;
}

/** A proposal record */
export interface ProposalRecord {
  id: string;
  entityKind: string;
  entityRef: string;
  entityName: string;
  bu: string;
  month: number;
  year: number;
  value: number;
  modelId?: string;
  hasConflict: boolean;
  status: 'Proposed' | 'Approved' | 'Rejected';
}

/** A contribution link (KPI → Org Output or KPI → Org Outcome) */
export interface ContributionLink {
  id: string;
  sourceKpiId: string;
  sourceKpiName: string;
  targetEntityId: string;
  targetEntityName: string;
  targetKind: 'output' | 'outcome';
  weightPct: number;
  buId?: string;
}

/** Result of a model computation preview */
export interface ModelResultPreview {
  comp: string;
  from: number;
  to: number;
  result: number;
  baseline: number;
  resultKpi: string;
}

/**
 * Where a KPI type sorts: Outcome → Output → Process → Input, each followed by its Sub variant.
 * Matched loosely because strategy_kpitype spells them 'OutCome' / 'OutPut' / 'Sub Outcome'.
 */
export function kpiTypeRank(type?: string): number {
  const t = (type || '').toLowerCase().replace(/[^a-z]/g, '');
  if (t === 'outcome') return 0;
  if (t === 'suboutcome') return 1;
  if (t === 'output') return 2;
  if (t === 'suboutput') return 3;
  if (t === 'process') return 4;
  if (t === 'subprocess') return 5;
  if (t === 'input') return 6;
  return 9;
}

/** Month labels */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
