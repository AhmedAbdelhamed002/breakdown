import { Pm_proposalsService } from '@generated/services/Pm_proposalsService';
import { Pm_kpiachievmentsService } from '@generated/services/Pm_kpiachievmentsService';
import { Pm_orgoutcomeachievmentsService } from '@generated/services/Pm_orgoutcomeachievmentsService';
import { Pm_orgoutputachievmentsService } from '@generated/services/Pm_orgoutputachievmentsService';
import { EntityRef } from './types';
import { LedgerService } from './LedgerService';
import { ConflictService } from './ConflictService';
import { ChoiceService, PROPOSAL_CHOICES } from './ChoiceService';
import { TargetSource } from './TargetSource';

/** How an entity kind reads in a proposal's name when no entity name was passed. */
const KIND_LABEL: Record<EntityRef['kind'], string> = {
  outcome: 'Org Outcome',
  output: 'Org Output',
  kpi: 'KPI'
};

/** pm_proposals.pm_proposedvalue's own Dataverse-enforced range. Checked before the write so a
 * runaway upstream calculation (e.g. an unbounded forecast trend) surfaces as a clear message
 * here instead of a raw platform validation error. */
const PM_PROPOSEDVALUE_MAX = 1_000_000_000;

export interface WriteProposalInput {
  entityRef: EntityRef;
  /** Display name of the entity, used in the proposal's name. Falls back to its kind. */
  entityName?: string;
  buId: string;
  year: number;
  month: number;
  value: number;
  modelId?: string;
  /** Whether this proposal undercuts an approved target — stamped onto pm_hasconflict. */
  hasConflict?: boolean;
  /** Which screen the proposal came from — stamped onto pm_source. */
  source: TargetSource;
  /**
   * `department-function` this number belongs to, stamped onto pm_deptfunction — supplied by the
   * caller (e.g. target-setting's own DeptFunctionService, KPI-only) rather than looked up here,
   * so this shared engine never imports a single feature's own catalogue service.
   */
  deptFunction?: string;
}

/** What a save produced: the proposal, and whether it had to be flagged for review. */
export interface ProposalOutcome {
  proposalId?: string;
  conflictRaised: boolean;
  /** The approved target the proposal was compared against, if there was one. */
  existingTarget: number | null;
}

/**
 * TargetWriteService — Handles saving targets vs proposals
 * Rule: If a target already exists for that month, it must be saved as a proposal instead.
 */
export class TargetWriteService {
  /**
   * Write a target for an entity.
   * If a target already exists for any of the given months, creates a proposal instead — with a
   * conflict raised for review when that proposal would lower the approved target.
   * Otherwise, updates/creates the achievement record.
   *
   * Returns the proposals it had to fall back to, so the caller can tell the user which months
   * went for review instead of being written.
   */
  public static async writeTarget(
    entityRef: EntityRef,
    buId: string,
    year: number,
    months: number[],
    value: number,
    source: TargetSource,
    entityName?: string
  ): Promise<{ month: number; outcome: ProposalOutcome }[]> {
    const ledger = await LedgerService.getLedger(entityRef, buId, year);
    const proposed: { month: number; outcome: ProposalOutcome }[] = [];

    for (const month of months) {
      const existing = ledger.months.find(m => m.month === month);

      if (existing && existing.target != null) {
        // Target exists, must create a proposal
        const outcome = await this.saveProposalAgainst({
          entityRef, entityName, buId, year, month, value, source, existingTarget: existing.target
        });
        proposed.push({ month, outcome });
        continue;
      }

      // We don't have the explicit Record ID from just the Ledger fetch (which maps to months),
      // so in a real scenario we'd get the actual Dataverse GUID for the month's record,
      // or create one if it doesn't exist.
      // For this implementation, we will simulate the write or rely on a backend upsert.
      // E.g., fetch the record GUID first, then update it.

      let records: any[] = [];
      let service: any;
      const updatePayload = { pm_target: value };

      if (entityRef.kind === 'kpi') {
        service = Pm_kpiachievmentsService;
        const res = await service.getAll({
          select: ['pm_kpiachievmentid'],
          filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and pm_month eq ${month} and _pm_kpi_value eq ${entityRef.id}`
        });
        records = res.data || [];
      } else if (entityRef.kind === 'output') {
        service = Pm_orgoutputachievmentsService;
        const res = await service.getAll({
          select: ['pm_orgoutputachievmentid'],
          filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and pm_month eq ${month} and _pm_orgoutput_value eq ${entityRef.id}`
        });
        records = res.data || [];
      } else {
        service = Pm_orgoutcomeachievmentsService;
        const res = await service.getAll({
          select: ['pm_orgoutcomeachievmentid'],
          filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and pm_month eq ${month} and _pm_orgoutcome_value eq ${entityRef.id}`
        });
        records = res.data || [];
      }

      if (records.length > 0) {
        // Update existing record
        const idField = entityRef.kind === 'kpi' ? 'pm_kpiachievmentid'
                      : entityRef.kind === 'output' ? 'pm_orgoutputachievmentid'
                      : 'pm_orgoutcomeachievmentid';
        await service.update(records[0][idField], updatePayload);
      } else {
        // Create new record
        const createPayload: any = {
          'pm_businessunit@odata.bind': `/businessunits(${buId})`,
          pm_year: year,
          pm_month: month,
          pm_target: value
        };
        if (entityRef.kind === 'kpi') createPayload['pm_kpi@odata.bind'] = `/strategy_kpises(${entityRef.id})`;
        else if (entityRef.kind === 'output') createPayload['pm_orgoutput@odata.bind'] = `/pm_orgoutputs(${entityRef.id})`;
        else createPayload['pm_orgoutcome@odata.bind'] = `/pm_orgoutcomes(${entityRef.id})`;

        await service.create(createPayload);
      }
    }

    return proposed;
  }

  /**
   * Save a proposal directly. Returns the created proposal's id so a conflict can be linked
   * back to it.
   */
  public static async writeProposal(input: WriteProposalInput): Promise<string | undefined> {
    const { entityRef, buId, year, month, value, modelId, source, hasConflict = false, deptFunction } = input;
    const entityName = input.entityName || KIND_LABEL[entityRef.kind];

    if (!Number.isFinite(value) || Math.abs(value) > PM_PROPOSEDVALUE_MAX) {
      throw new Error(
        `Proposed value ${value.toLocaleString()} for ${entityName} · M${month} ${year} is outside the allowed range ` +
        `(±${PM_PROPOSEDVALUE_MAX.toLocaleString()}) — check the forecast/impact calculation that produced it before saving.`
      );
    }

    const payload: any = {
      pm_name: `Proposal — ${entityName} · M${month} ${year}`,
      'pm_businessunit@odata.bind': `/businessunits(${buId})`,
      pm_year: year,
      pm_month: month,
      pm_proposedvalue: value
    };
    if (deptFunction) payload.pm_deptfunction = deptFunction;

    // pm_entitykind records what the proposal is for — a KPI, an Org Output or an Org Outcome —
    // and pm_hasconflict whether it undercuts an approved target. pm_proposalstatus always opens
    // Active — approving or retiring a proposal is the reviewer's call, not this write's. All are
    // choice columns whose option values are resolved by label; an unresolved option is left
    // empty rather than stamped with a guess, since the entity lookup below and pm_conflicts
    // still tell the story.
    const [entityKind, conflictFlag, sourceValue, statusValue] = await Promise.all([
      ChoiceService.entityKind(PROPOSAL_CHOICES, entityRef),
      ChoiceService.yesNo(PROPOSAL_CHOICES, 'pm_hasconflict', hasConflict),
      ChoiceService.resolve(PROPOSAL_CHOICES, 'pm_source', source),
      ChoiceService.resolve(PROPOSAL_CHOICES, 'pm_proposalstatus', 'Active')
    ]);
    if (entityKind != null) payload.pm_entitykind = entityKind;
    if (conflictFlag != null) payload.pm_hasconflict = conflictFlag;
    if (sourceValue != null) payload.pm_source = sourceValue;
    if (statusValue != null) payload.pm_proposalstatus = statusValue;

    if (entityRef.kind === 'outcome') {
      payload['pm_orgoutcome@odata.bind'] = `/pm_orgoutcomes(${entityRef.id})`;
    } else if (entityRef.kind === 'output') {
      payload['pm_orgoutput@odata.bind'] = `/pm_orgoutputs(${entityRef.id})`;
    } else {
      payload['pm_kpi@odata.bind'] = `/strategy_kpises(${entityRef.id})`;
    }

    if (modelId) {
      payload['pm_sourcemodel@odata.bind'] = `/pm_models(${modelId})`;
    }

    const res = await Pm_proposalsService.create(payload);
    if (!res.success) throw new Error(res.error?.message || 'Failed to save proposal');

    // The created row echoes back each choice's label, which is the only feedback available when
    // the table had no rows to learn the option values from — so a wrong seed self-corrects.
    ChoiceService.observe(PROPOSAL_CHOICES, res.data as Record<string, any> | undefined);

    return res.data?.pm_proposalid;
  }

  /**
   * Save a proposal and, when it would lower an existing target, raise a conflict for review.
   *
   * A conflict is raised only when a target already exists and is **higher** than the proposed
   * value — proposing the same or more isn't a regression and needs no review.
   */
  public static async writeProposalWithConflict(
    entityRef: EntityRef,
    entityName: string,
    buId: string,
    year: number,
    month: number,
    value: number,
    source: TargetSource,
    modelId?: string,
    deptFunction?: string
  ): Promise<ProposalOutcome> {
    const existingTarget = await LedgerService.getMonthValue(entityRef, buId, year, month, 'target');
    return this.saveProposalAgainst({ entityRef, entityName, buId, year, month, value, source, modelId, deptFunction, existingTarget });
  }

  /**
   * Save a proposal against a target that has already been read, raising a conflict when the
   * proposal undercuts it. Shared by writeTarget (which has the ledger in hand) and
   * writeProposalWithConflict (which fetches it).
   */
  private static async saveProposalAgainst(input: WriteProposalInput & {
    existingTarget: number | null;
  }): Promise<ProposalOutcome> {
    const { entityRef, entityName, buId, year, month, value, modelId, source, deptFunction, existingTarget } = input;
    const conflictRaised = existingTarget != null && existingTarget > value;

    const proposalId = await this.writeProposal({
      entityRef, entityName, buId, year, month, value, modelId, source, deptFunction, hasConflict: conflictRaised
    });

    if (conflictRaised) {
      await ConflictService.raiseConflict({
        entityRef,
        entityName: entityName || KIND_LABEL[entityRef.kind],
        buId,
        year,
        month,
        existingValue: existingTarget!,
        proposedValue: value,
        proposalId,
        source
      });
    }

    return { proposalId, conflictRaised, existingTarget };
  }
}
