import { describe, expect, it } from 'vitest';
import { actualForOption, targetForOption } from './breakdownFigures';
import type { BreakdownRow } from '../models/types';

/** A breakdown row carrying a target, and an actual only when one is passed. */
const row = (
  overrides: Partial<BreakdownRow> & { level: number; optionId: string }
): BreakdownRow => ({
  id: `row-${overrides.level}-${overrides.optionId}-${overrides.target ?? 0}`,
  kpi: 'kpi-charge-per-case',
  pathLabel: '',
  parentId: null,
  dimension: 'Service Category',
  name: 'test',
  historical: 0,
  baseline: 0,
  actual: 0,
  target: 0,
  ...overrides
});

const TEST = 'opt-test';
const OTHER = 'opt-other';

describe('targetForOption', () => {
  it('answers from level 1 when the value appears there', () => {
    const rows = [
      row({ level: 1, optionId: TEST, target: 500 }),
      row({ level: 2, optionId: TEST, target: 900 }),
      row({ level: 3, optionId: TEST, target: 40 })
    ];

    expect(targetForOption(rows, 'Service Category', TEST, 'Value'))
      .toEqual({ value: 500, level: 1, rowCount: 1 });
  });

  it('sums the level 2 rows when the value appears only at levels 2 and 3', () => {
    const rows = [
      row({ level: 2, optionId: TEST, target: 400 }),
      row({ level: 2, optionId: TEST, target: 300 }),
      row({ level: 3, optionId: TEST, target: 90 })
    ];

    expect(targetForOption(rows, 'Service Category', TEST, 'Value'))
      .toEqual({ value: 700, level: 2, rowCount: 2 });
  });

  it('averages the winning level for a Percentage KPI rather than summing', () => {
    const rows = [
      row({ level: 2, optionId: TEST, target: 60 }),
      row({ level: 2, optionId: TEST, target: 80 })
    ];

    expect(targetForOption(rows, 'Service Category', TEST, 'Percentage'))
      .toEqual({ value: 70, level: 2, rowCount: 2 });
  });

  it('ignores other values of the dimension, and other dimensions', () => {
    const rows = [
      row({ level: 1, optionId: OTHER, target: 999 }),
      row({ level: 1, optionId: TEST, dimension: 'Physician', target: 111 }),
      row({ level: 2, optionId: TEST, target: 250 })
    ];

    expect(targetForOption(rows, 'Service Category', TEST, 'Value'))
      .toEqual({ value: 250, level: 2, rowCount: 1 });
  });

  it('returns null when the value is nowhere in the breakdown', () => {
    expect(targetForOption([row({ level: 1, optionId: OTHER, target: 10 })], 'Service Category', TEST))
      .toBeNull();
  });
});

describe('actualForOption', () => {
  it('follows the same lowest-level-wins rule as the target', () => {
    const rows = [
      row({ level: 2, optionId: TEST, actual: 700, actualRecorded: true }),
      row({ level: 2, optionId: TEST, actual: 419.12, actualRecorded: true }),
      row({ level: 3, optionId: TEST, actual: 50, actualRecorded: true })
    ];

    expect(actualForOption(rows, 'Service Category', TEST, 'Value'))
      .toEqual({ value: 1119.12, level: 2, rowCount: 2 });
  });

  it('only counts rows whose actual was actually recorded', () => {
    // The level 1 row carries a target but has never been recorded, so the answer comes from the
    // level 2 rows that have — not from a level 1 zero standing in for "no figure".
    const rows = [
      row({ level: 1, optionId: TEST, target: 800 }),
      row({ level: 2, optionId: TEST, actual: 300, actualRecorded: true })
    ];

    expect(actualForOption(rows, 'Service Category', TEST, 'Value'))
      .toEqual({ value: 300, level: 2, rowCount: 1 });
  });

  it('keeps a genuinely recorded zero, distinct from nothing recorded', () => {
    const recordedZero = [row({ level: 1, optionId: TEST, actual: 0, actualRecorded: true })];
    expect(actualForOption(recordedZero, 'Service Category', TEST, 'Value'))
      .toEqual({ value: 0, level: 1, rowCount: 1 });

    const neverRecorded = [row({ level: 1, optionId: TEST, target: 500 })];
    expect(actualForOption(neverRecorded, 'Service Category', TEST, 'Value')).toBeNull();
  });

  it('returns null when the value has no recorded figure anywhere', () => {
    const rows = [
      row({ level: 1, optionId: TEST, target: 500 }),
      row({ level: 2, optionId: TEST, target: 200 })
    ];

    expect(actualForOption(rows, 'Service Category', TEST, 'Value')).toBeNull();
  });
});
