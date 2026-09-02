import { describe, expect, it } from 'vitest';
import { valuesConflict } from './conflicts';

describe('valuesConflict', () => {
  it('is false when there is no existing target', () => {
    expect(valuesConflict(120, undefined)).toBe(false);
    expect(valuesConflict(120, null)).toBe(false);
  });

  it('is false when values are within tolerance', () => {
    expect(valuesConflict(100, 100.4)).toBe(false);
  });

  it('is true when a proposed value disagrees with an existing target', () => {
    expect(valuesConflict(120, 100)).toBe(true);
  });
});
