import { Pm_kpiachievmentsService } from '@generated/services/Pm_kpiachievmentsService';
import { Pm_orgoutcomeachievmentsService } from '@generated/services/Pm_orgoutcomeachievmentsService';
import { Pm_orgoutputachievmentsService } from '@generated/services/Pm_orgoutputachievmentsService';
import { resultOrThrow } from '@infrastructure/dataverse/resultOrThrow';
import { MonthlyLedger, MonthlyLedgerEntry, EntityRef } from './types';

/**
 * LedgerService — Fetches the 12-month achievement ledger for any entity.
 * This is the single source of truth for actual/baseline/target/historical values.
 */
/**
 * Whether a freshly read row should replace the one already mapped to its month. A total beats a
 * row recorded under another, and among equals the one with a target beats one without.
 */
function preferRecord(candidate: any, current: MonthlyLedgerEntry): boolean {
  const candidateIsTotal = !candidate._pm_parent_value;
  if (candidateIsTotal !== !!current.isTotal) return candidateIsTotal;
  if ((candidate.pm_target != null) !== (current.target != null)) return candidate.pm_target != null;
  return false;
}

/** The achievement record's own primary-key field — differs per entity kind. */
const ID_FIELD: Record<EntityRef['kind'], string> = {
  kpi: 'pm_kpiachievmentid',
  output: 'pm_orgoutputachievmentid',
  outcome: 'pm_orgoutcomeachievmentid'
};

export class LedgerService {
  public static async getLedger(entityRef: EntityRef, buId: string, year: number): Promise<MonthlyLedger> {
    const emptyMonths: MonthlyLedgerEntry[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, actual: null, baseline: null, target: null, historical: null, hasRecord: false
    }));

    let records: any[] = [];

    if (entityRef.kind === 'kpi') {
      records = resultOrThrow(
        await Pm_kpiachievmentsService.getAll({
          select: ['pm_kpiachievmentid', 'pm_month', 'pm_year', 'pm_actual', 'pm_baseline', 'pm_target', 'pm_historical', 'pm_breakdown', '_pm_parent_value'],
          filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and _pm_kpi_value eq ${entityRef.id} and statecode eq 0`
        }),
        'List KPI achievements for ledger'
      );
    } else if (entityRef.kind === 'output') {
      records = resultOrThrow(
        await Pm_orgoutputachievmentsService.getAll({
          select: ['pm_orgoutputachievmentid', 'pm_month', 'pm_year', 'pm_actual', 'pm_baseline', 'pm_target', 'pm_historical'],
          filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and _pm_orgoutput_value eq ${entityRef.id} and statecode eq 0`
        }),
        'List Org Output achievements for ledger'
      );
    } else {
      records = resultOrThrow(
        await Pm_orgoutcomeachievmentsService.getAll({
          select: ['pm_orgoutcomeachievmentid', 'pm_month', 'pm_year', 'pm_actual', 'pm_baseline', 'pm_target', 'pm_historical'],
          filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and _pm_orgoutcome_value eq ${entityRef.id} and statecode eq 0`
        }),
        'List Org Outcome achievements for ledger'
      );
    }

    // Map records to months
    // A month can hold more than one achievement row — a total plus rows recorded under it, or
    // duplicates from an import. The month's figures come from the total: the row with no parent,
    // preferring one that actually carries a target, so a childless duplicate can't blank it out.
    records.forEach(r => {
      const m = Number(r.pm_month);
      if (!(m >= 1 && m <= 12)) return;

      const current = emptyMonths[m - 1];
      if (current.hasRecord && !preferRecord(r, current)) return;

      emptyMonths[m - 1] = {
        month: m,
        actual: r.pm_actual ?? null,
        baseline: r.pm_baseline ?? null,
        target: r.pm_target ?? null,
        historical: r.pm_historical ?? null,
        hasRecord: true,
        isTotal: !r._pm_parent_value,
        id: r[ID_FIELD[entityRef.kind]]
      };
    });

    return { entityRef, buId, year, months: emptyMonths };
  }

  /** Get a specific value from the ledger for a single month */
  public static async getMonthValue(
    entityRef: EntityRef, buId: string, year: number, month: number,
    field: 'actual' | 'baseline' | 'target' | 'historical'
  ): Promise<number | null> {
    const ledger = await this.getLedger(entityRef, buId, year);
    const entry = ledger.months.find(m => m.month === month);
    return entry ? entry[field] : null;
  }
}
