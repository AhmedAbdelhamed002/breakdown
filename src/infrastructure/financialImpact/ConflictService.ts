import { Pm_conflictsService } from '@generated/services/Pm_conflictsService';
import { EntityRef } from './types';
import { ChoiceService, CONFLICT_CHOICES } from './ChoiceService';
import { ConflictType, TargetSource, CONFLICT_TYPE_BY_SOURCE } from './TargetSource';
import { CurrentUserService } from './CurrentUserService';

export interface RaiseConflictInput {
  entityRef: EntityRef;
  entityName: string;
  buId: string;
  year: number;
  month: number;
  /** The target already recorded for this entity/BU/month. */
  existingValue: number;
  /** The value being proposed, which is lower than the existing target. */
  proposedValue: number;
  /** The proposal this conflict was raised against, so reviewers can open it. */
  proposalId?: string;
  /** Which screen produced the proposed value — stamped on pm_proposedsource. */
  source: TargetSource;
  /** Overrides the conflict type the source implies, for a screen that raises more than one. */
  conflictType?: ConflictType;
}

/** An open conflict on an entity/BU/month, as shown next to the value in the UI. */
export interface ConflictRecord {
  id: string;
  name: string;
  year: number;
  month: number;
  existingValue: number | null;
  proposedValue: number | null;
  raisedOn: string | null;
  proposalId?: string;
  /** pm_conflicttype's label, so the UI can say what kind of disagreement it is. */
  conflictType?: string;
  /** Who raised it — pm_raisedby's formatted name. */
  raisedBy?: string;
}

/** The lookup column on pm_conflicts that carries each entity kind. */
const ENTITY_LOOKUP: Record<EntityRef['kind'], string> = {
  outcome: '_pm_orgoutcome_value',
  output: '_pm_orgoutput_value',
  kpi: '_pm_kpi_value'
};

const FORMATTED_VALUE = '@OData.Community.Display.V1.FormattedValue';

/**
 * ConflictService — records disagreements between a proposed value and an already-approved
 * target into pm_conflicts, so they can be reviewed on the Conflicts screen instead of one
 * silently overwriting the other.
 *
 * Each row carries the metadata a reviewer needs to act without opening the screen it came from:
 * what kind of disagreement it is (pm_conflicttype), which screen proposed the value
 * (pm_proposedsource), both numbers, the month, the entity and the proposal itself.
 * pm_existingsource is left empty — nothing on an approved target records where it came from.
 */
export class ConflictService {
  public static async raiseConflict(input: RaiseConflictInput) {
    const {
      entityRef, entityName, buId, year, month,
      existingValue, proposedValue, proposalId, source
    } = input;
    const conflictType = input.conflictType ?? CONFLICT_TYPE_BY_SOURCE[source];

    const payload: any = {
      pm_name: `Conflict — ${entityName} M${month} ${year}`,
      'pm_businessunit@odata.bind': `/businessunits(${buId})`,
      pm_year: year,
      pm_month: month,
      pm_existingvalue: existingValue,
      pm_proposedvalue: proposedValue,
      pm_raisedon: new Date().toISOString()
    };

    // Mirror the proposal's entity kind so the conflict list reads on its own, and record what
    // kind of disagreement it is and which screen proposed it. Each is left empty when its option
    // can't be resolved — the entity lookup below still identifies what conflicted.
    const [entityKind, typeValue, sourceValue, raisedBy] = await Promise.all([
      ChoiceService.entityKind(CONFLICT_CHOICES, entityRef),
      ChoiceService.resolve(CONFLICT_CHOICES, 'pm_conflicttype', conflictType),
      ChoiceService.resolve(CONFLICT_CHOICES, 'pm_proposedsource', source),
      CurrentUserService.get()
    ]);
    if (entityKind != null) payload.pm_entitykind = entityKind;
    if (typeValue != null) payload.pm_conflicttype = typeValue;
    if (sourceValue != null) payload.pm_proposedsource = sourceValue;
    if (raisedBy) payload['pm_raisedby@odata.bind'] = `/systemusers(${raisedBy.id})`;

    if (entityRef.kind === 'outcome') {
      payload['pm_orgoutcome@odata.bind'] = `/pm_orgoutcomes(${entityRef.id})`;
    } else if (entityRef.kind === 'output') {
      payload['pm_orgoutput@odata.bind'] = `/pm_orgoutputs(${entityRef.id})`;
    } else {
      payload['pm_kpi@odata.bind'] = `/strategy_kpises(${entityRef.id})`;
    }

    if (proposalId) {
      payload['pm_proposal@odata.bind'] = `/pm_proposals(${proposalId})`;
    }

    const res = await Pm_conflictsService.create(payload);
    if (!res.success) throw new Error(res.error?.message || 'Failed to raise conflict');

    ChoiceService.observe(CONFLICT_CHOICES, res.data as Record<string, any> | undefined);

    return res.data?.pm_conflictid;
  }

  /**
   * Conflicts already recorded against an entity for a BU/year, optionally narrowed to one
   * month. Used to flag the entity in the UI, so a conflict raised in an earlier session is
   * still visible.
   */
  public static async getConflicts(
    entityRef: EntityRef,
    buId: string,
    year: number,
    month?: number
  ): Promise<ConflictRecord[]> {
    if (!entityRef.id || !buId) return [];

    const filters = [
      `${ENTITY_LOOKUP[entityRef.kind]} eq ${entityRef.id}`,
      `_pm_businessunit_value eq ${buId}`,
      `pm_year eq ${year}`,
      'statecode eq 0'
    ];
    if (month != null) filters.push(`pm_month eq ${month}`);

    const res = await Pm_conflictsService.getAll({
      select: [
        'pm_conflictid', 'pm_name', 'pm_year', 'pm_month', 'pm_conflicttype',
        'pm_existingvalue', 'pm_proposedvalue', 'pm_raisedon', '_pm_proposal_value', '_pm_raisedby_value'
      ],
      filter: filters.join(' and '),
      orderBy: ['pm_raisedon desc']
    });
    if (!res.success || !res.data) return [];

    return res.data.map(row => {
      const record = row as Record<string, any>;
      return {
        id: row.pm_conflictid,
        name: row.pm_name,
        year: row.pm_year ?? year,
        month: (row.pm_month as unknown as number) ?? 0,
        existingValue: row.pm_existingvalue ?? null,
        proposedValue: row.pm_proposedvalue ?? null,
        raisedOn: row.pm_raisedon ?? null,
        proposalId: row._pm_proposal_value,
        conflictType: record[`pm_conflicttype${FORMATTED_VALUE}`],
        raisedBy: record[`_pm_raisedby_value${FORMATTED_VALUE}`]
      };
    });
  }
}
