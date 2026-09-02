/** The figures a percentage can be taken from — a KPI achievement's baseline and actual. */
export interface PercentBasisFigures {
  baseline: number | null;
  actual: number | null;
}

/**
 * The figure the KPI being broken down contributes as a *factor* of its own model, and so the
 * figure the other factors' percentages are taken from. One function serves both because they are
 * the same number: the factor row is filled with it, and a percentage on any other row is a share
 * of it.
 *
 * Read from that KPI's own achievement record — its baseline first, falling back to its actual.
 * The record is keyed by KPI, business unit, year and month, and the KPI itself carries the
 * department and function, so those are settled by which KPI is being broken down.
 *
 * The achievement's target is deliberately not used: on a bottom-up breakdown the target is the
 * very figure the model is computing, so taking a share of it would feed the result back into its
 * own inputs.
 *
 * Returns 0 when the record has neither figure, which the caller has to treat as "no percentage
 * possible" rather than dividing by it.
 */
export function percentBasis(figures: PercentBasisFigures | undefined | null): number {
  if (!figures) return 0;
  return figures.baseline || figures.actual || 0;
}

/** Value a percentage of the basis comes to. Zero basis yields zero — nothing to take a share of. */
export function valueFromPercent(basis: number, percent: number): number {
  if (!basis) return 0;
  return (basis * percent) / 100;
}

/**
 * The percentage of the basis a value represents — the inverse of valueFromPercent, so typing
 * either one in the dialog shows the other. Null when there is no basis, which is what tells the
 * caller to disable the percentage input instead of showing a meaningless figure.
 */
export function percentFromValue(basis: number, value: number): number | null {
  if (!basis) return null;
  return (value / basis) * 100;
}

/** Which figure the basis came from, for saying so on screen. */
export function percentBasisLabel(
  figures: PercentBasisFigures | undefined | null
): 'baseline' | 'actual' | null {
  if (!figures) return null;
  if (figures.baseline) return 'baseline';
  if (figures.actual) return 'actual';
  return null;
}
