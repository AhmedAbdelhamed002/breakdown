/**
 * Where a target proposal came from, and what kind of disagreement it caused.
 *
 * pm_proposals.pm_source, pm_conflicts.pm_conflicttype and pm_conflicts.pm_proposedsource are all
 * choice columns whose options name the screens of this module. Keeping the labels in one place
 * means a screen states which one it is once, and the write services resolve the option values.
 *
 * pm_conflicts.pm_existingsource is deliberately left unset: nothing recorded against an approved
 * target says which screen produced it, and guessing would put a wrong provenance on record.
 */

/** Labels of pm_proposals.pm_source / pm_conflicts.pm_proposedsource. */
export type TargetSource =
  | 'Top Down Monthly'
  | 'Breakdown'
  | 'Bottom Up'
  | 'Forecast'
  | 'Financial Modelar'
  | 'BottomUp Breakdown';

/** Labels of pm_conflicts.pm_conflicttype. */
export type ConflictType =
  | 'Forecast Vs Monthly'
  | 'Children Vs Parent'
  | 'Bottom Up Below Approved'
  | 'Model Builder Vs Org KPI';

/** The conflict each screen raises when its numbers disagree with an approved target. */
export const CONFLICT_TYPE_BY_SOURCE: Record<TargetSource, ConflictType> = {
  // A month built on a model came in under the org's approved target for the KPI.
  'Top Down Monthly': 'Model Builder Vs Org KPI',
  // The rows a target was split into don't add up to the parent they hang off.
  'Breakdown': 'Children Vs Parent',
  // A function manager's components produce less than the KPI is already approved for.
  'Bottom Up': 'Bottom Up Below Approved',
  // A year-end forecast disagrees with a month that's already approved.
  'Forecast': 'Forecast Vs Monthly',
  'Financial Modelar': 'Model Builder Vs Org KPI',
  // A breakdown built from the ground up: the rows are the claim, and the disagreement is
  // between what they add up to and whatever the KPI is already approved for.
  'BottomUp Breakdown': 'Children Vs Parent'
};
