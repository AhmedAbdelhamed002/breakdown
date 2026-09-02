import { EntityRef } from '../models/types';
import { LedgerService } from '@infrastructure/financialImpact/LedgerService';
import { ConflictType, TargetSource, CONFLICT_TYPE_BY_SOURCE } from '@infrastructure/financialImpact/TargetSource';
import { PendingConflict } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';

/**
 * ConflictDetectionService — works out, before anything is written, which of the values a save is
 * about to propose disagree with a target that's already approved.
 *
 * The prototype's rule, from writeOrPropose: a value conflicts when the month already carries an
 * approved target and the proposal differs from it. Every screen that saves a proposal runs the
 * same check over every value it writes, so nothing slips through flagged as clean.
 */

/** One value a save is about to propose. */
export interface PlannedProposal {
  entityRef: EntityRef;
  entityName: string;
  value: number;
  month: number;
  /** Overrides the reason the detector writes, when a screen can say it better. */
  reason?: string;
}

export interface DetectedConflict extends PendingConflict {
  entityRef: EntityRef;
  value: number;
  month: number;
  /** The approved target it disagrees with. */
  existingTarget: number;
}

export interface DetectOptions {
  buId: string;
  year: number;
  source: TargetSource;
  conflictType?: ConflictType;
  /**
   * How a proposal has to differ to count. The prototype flags any difference on a model-driven
   * write, and only a shortfall where a lower number is the whole point of the review.
   */
  mode?: 'any-difference' | 'below-only';
  /** Month labels for a save that spans more than one. */
  monthLabel?: (month: number) => string;
}

export class ConflictDetectionService {
  /**
   * Which of these proposals disagree with an approved target. Reads each entity's ledger once
   * per year, so a save covering twelve months costs one read per entity rather than twelve.
   */
  public static async detect(
    proposals: PlannedProposal[],
    options: DetectOptions
  ): Promise<DetectedConflict[]> {
    const { buId, year, source, mode = 'any-difference', monthLabel } = options;
    if (!buId || !proposals.length) return [];

    const conflictType = options.conflictType ?? CONFLICT_TYPE_BY_SOURCE[source];
    const ledgers = new Map<string, Awaited<ReturnType<typeof LedgerService.getLedger>>>();
    const conflicts: DetectedConflict[] = [];

    for (const proposal of proposals) {
      const key = `${proposal.entityRef.kind}:${proposal.entityRef.id}`;
      let ledger = ledgers.get(key);
      if (!ledger) {
        ledger = await LedgerService.getLedger(proposal.entityRef, buId, year);
        ledgers.set(key, ledger);
      }

      const approved = ledger.months.find(m => m.month === proposal.month)?.target;
      if (approved == null || approved === 0) continue;

      const differs = mode === 'below-only'
        ? approved > proposal.value + 0.001
        : Math.abs(approved - proposal.value) > 0.001;
      if (!differs) continue;

      const month = monthLabel?.(proposal.month);
      conflicts.push({
        entityRef: proposal.entityRef,
        entityName: proposal.entityName,
        conflictType,
        existingValue: approved,
        existingTarget: approved,
        proposedValue: proposal.value,
        value: proposal.value,
        month: proposal.month,
        monthLabel: month,
        reason: proposal.reason
          ?? (approved > proposal.value
            ? `The approved target is ${approved}, higher than the proposed ${proposal.value}.`
            : `The approved target is ${approved}, and this proposes ${proposal.value} instead.`)
      });
    }

    return conflicts;
  }
}
