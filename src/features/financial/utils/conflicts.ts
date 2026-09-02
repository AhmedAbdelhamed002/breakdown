export const CONFLICT_VALUE_TOLERANCE = 0.5;

/** True when a proposed value disagrees with an existing target. */
export function valuesConflict(
  proposed: number,
  existing: number | null | undefined
): boolean {
  if (existing == null || Number.isNaN(Number(existing))) return false;
  if (Number.isNaN(Number(proposed))) return false;
  return Math.abs(Number(proposed) - Number(existing)) > CONFLICT_VALUE_TOLERANCE;
}
