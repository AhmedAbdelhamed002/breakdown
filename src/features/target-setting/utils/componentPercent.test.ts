import { describe, expect, it } from 'vitest';
import {
  percentBasis, percentBasisLabel, percentFromValue, valueFromPercent
} from './componentPercent';

/** A KPI achievement's figures, as LedgerService reads them for a BU/year/month. */
const figures = (baseline: number | null, actual: number | null) => ({ baseline, actual });

describe('percentBasis', () => {
  it('prefers the achievement baseline, falling back to the actual', () => {
    expect(percentBasis(figures(8000, 6000))).toBe(8000);
    expect(percentBasis(figures(null, 6000))).toBe(6000);
    expect(percentBasis(figures(0, 6000))).toBe(6000);
  });

  it('returns 0 when the achievement carries neither figure', () => {
    expect(percentBasis(figures(null, null))).toBe(0);
    expect(percentBasis(figures(0, 0))).toBe(0);
    expect(percentBasis(undefined)).toBe(0);
    expect(percentBasis(null)).toBe(0);
  });
});

describe('valueFromPercent / percentFromValue', () => {
  it('converts a percentage into a value against the basis', () => {
    expect(valueFromPercent(8000, 10)).toBe(800);
    expect(valueFromPercent(12000, 2.5)).toBe(300);
  });

  it('converts a value back into the percentage it represents', () => {
    expect(percentFromValue(8000, 800)).toBe(10);
    expect(percentFromValue(12000, 300)).toBe(2.5);
  });

  it('round-trips, so typing either one leaves the other agreeing', () => {
    const basis = 7900;
    expect(percentFromValue(basis, valueFromPercent(basis, 12.5))).toBeCloseTo(12.5, 10);
    expect(valueFromPercent(basis, percentFromValue(basis, 1975)!)).toBeCloseTo(1975, 10);
  });

  it('handles percentages over 100 and negatives without special-casing', () => {
    expect(valueFromPercent(1000, 150)).toBe(1500);
    expect(valueFromPercent(1000, -20)).toBe(-200);
  });

  it('never divides by a zero basis', () => {
    expect(percentFromValue(0, 500)).toBeNull();
    expect(valueFromPercent(0, 10)).toBe(0);
  });
});

describe('percentBasisLabel', () => {
  it('names which figure the basis came from', () => {
    expect(percentBasisLabel(figures(8000, 6000))).toBe('baseline');
    expect(percentBasisLabel(figures(null, 6000))).toBe('actual');
    expect(percentBasisLabel(figures(null, null))).toBeNull();
  });
});
