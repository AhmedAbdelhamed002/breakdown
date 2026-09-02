import { AggregationType, BreakdownRow, rollUpValues } from '../models/types';

/** A figure found for one value of a dimension, and where in the tree it was found. */
export interface OptionFigure {
  value: number;
  /** The breakdown level the answer came from — 1 is directly under the KPI. */
  level: number;
  /** How many rows at that level were rolled up into it. */
  rowCount: number;
}

/**
 * One figure for a value of a dimension under a KPI, wherever it sits in the tree.
 *
 * A physician can appear anywhere: directly under the KPI, or under Cash and again under Credit a
 * level down. Rows are gathered from every level, and the answer comes from the **lowest** level
 * the value appears at — the closer to the KPI, the more it speaks for the whole of it. So a value
 * found at level 1 answers with that row alone; a value found only at levels 2 and 3 answers from
 * its level 2 rows. Several rows at that winning level are rolled up the way the KPI itself rolls
 * up — added for a Value KPI, averaged for a Percentage one — since together they are what the
 * value accounts for.
 *
 * `eligible` decides which rows can answer at all, which is what separates the target from the
 * actual: every matching row carries a target, but only some carry a recorded figure.
 */
export function figureForOption(
  rows: BreakdownRow[],
  dimension: string,
  optionId: string,
  pick: (row: BreakdownRow) => number,
  aggType?: AggregationType,
  eligible: (row: BreakdownRow) => boolean = () => true
): OptionFigure | null {
  const matches = rows.filter(
    r => r.dimension === dimension && r.optionId === optionId && eligible(r)
  );
  if (!matches.length) return null;

  const level = Math.min(...matches.map(r => r.level));
  const atLevel = matches.filter(r => r.level === level);
  return { value: rollUpValues(atLevel.map(pick), aggType), level, rowCount: atLevel.length };
}

/** What a value of a dimension is already targeted at under a KPI. */
export function targetForOption(
  rows: BreakdownRow[], dimension: string, optionId: string, aggType?: AggregationType
): OptionFigure | null {
  return figureForOption(rows, dimension, optionId, r => r.target || 0, aggType);
}

/**
 * What a value of a dimension was last *recorded* at under a KPI — its actual, by the same
 * lowest-level-wins rule as the target.
 *
 * Only rows whose stf_value column actually holds a figure can answer: a row created to carry a
 * target has an empty actual, and reading that as 0 would make "recorded at 0" and "never
 * recorded" look the same. Returns null when the value has no recorded figure anywhere, which is
 * what lets the caller offer nothing rather than a misleading zero.
 */
export function actualForOption(
  rows: BreakdownRow[], dimension: string, optionId: string, aggType?: AggregationType
): OptionFigure | null {
  return figureForOption(
    rows, dimension, optionId, r => r.actual || 0, aggType, r => !!r.actualRecorded
  );
}
