import React from 'react';
import { ConflictRecord } from '@infrastructure/financialImpact/ConflictService';

interface ConflictBadgeProps {
  /** Conflicts already recorded in pm_conflicts for this entity/month. */
  conflicts?: ConflictRecord[];
  /** True when saving the current value would raise a conflict, but none is on record yet. */
  willConflict?: boolean;
}

const formatValue = (value: number | null) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Flags an entity that a proposal has put in disagreement with its approved target: red once a
 * conflict is on record, amber while it is only what the current value would cause. Renders
 * nothing when there's neither, so it can sit inline next to any entity name or value.
 */
export const ConflictBadge: React.FC<ConflictBadgeProps> = ({ conflicts = [], willConflict }) => {
  if (conflicts.length > 0) {
    const detail = conflicts
      .map(c => `existing ${formatValue(c.existingValue)} vs proposed ${formatValue(c.proposedValue)}`)
      .join('\n');
    return (
      <span className="chip-flag chip-over" title={`Raised for review:\n${detail}`}>
        {conflicts.length > 1 ? `${conflicts.length} conflicts` : 'conflict'}
      </span>
    );
  }

  if (willConflict) {
    return (
      <span className="chip-flag chip-warn" title="Saving this value would raise a conflict — it is lower than the approved target.">
        will conflict
      </span>
    );
  }

  return null;
};
