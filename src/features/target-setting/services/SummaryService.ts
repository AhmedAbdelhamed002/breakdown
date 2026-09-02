import { Pm_kpiachievmentsService } from '../../../generated/services/Pm_kpiachievmentsService';
import { Pm_orgoutcomeachievmentsService } from '../../../generated/services/Pm_orgoutcomeachievmentsService';
import { Pm_orgoutputachievmentsService } from '../../../generated/services/Pm_orgoutputachievmentsService';
import { FinancialModel, ModelService } from '@infrastructure/financialImpact/ModelService';

/**
 * SummaryService — the month's targets for a set of business units, and which KPIs a sealed model
 * depends on.
 *
 * Both summary screens ask the same two questions of every BU on screen: what is each entity
 * targeted at this month, and is anything that a sealed model relies on missing a target. Reading
 * that per BU would be a request each, so the ids are batched into `or` filters.
 */

/** How many business units go into one filter — keeps the request URL a sane length. */
const BU_FILTER_BATCH = 15;

/** Targets for one month, keyed by business unit and then by entity id. */
export type TargetsByBu = Map<string, Map<string, number | null>>;

async function readTargets<T extends Record<string, any>>(
  buIds: string[],
  read: (filter: string) => Promise<T[]>,
  entityColumn: string
): Promise<TargetsByBu> {
  const byBu: TargetsByBu = new Map(buIds.map(id => [id, new Map<string, number | null>()]));
  if (!buIds.length) return byBu;

  for (let i = 0; i < buIds.length; i += BU_FILTER_BATCH) {
    const batch = buIds.slice(i, i + BU_FILTER_BATCH);
    const rows = await read(`(${batch.map(id => `_pm_businessunit_value eq ${id}`).join(' or ')})`);
    rows.forEach(row => {
      const buId = row._pm_businessunit_value;
      const entityId = row[entityColumn];
      if (!buId || !entityId) return;
      byBu.get(buId)?.set(entityId, row.pm_target ?? null);
    });
  }
  return byBu;
}

export class SummaryService {
  /** KPI targets for the month, per business unit. */
  public static getKpiTargets(buIds: string[], year: number, month: number): Promise<TargetsByBu> {
    return readTargets(buIds, async buFilter => {
      const res = await Pm_kpiachievmentsService.getAll({
        select: ['_pm_kpi_value', '_pm_businessunit_value', 'pm_target'],
        filter: `${buFilter} and pm_year eq ${year} and pm_month eq ${month} and statecode eq 0`
      });
      return (res.data || []) as Record<string, any>[];
    }, '_pm_kpi_value');
  }

  /** Org Outcome targets for the month, per business unit. */
  public static getOutcomeTargets(buIds: string[], year: number, month: number): Promise<TargetsByBu> {
    return readTargets(buIds, async buFilter => {
      const res = await Pm_orgoutcomeachievmentsService.getAll({
        select: ['_pm_orgoutcome_value', '_pm_businessunit_value', 'pm_target'],
        filter: `${buFilter} and pm_year eq ${year} and pm_month eq ${month} and statecode eq 0`
      });
      return (res.data || []) as Record<string, any>[];
    }, '_pm_orgoutcome_value');
  }

  /** Org Output targets for the month, per business unit. */
  public static getOutputTargets(buIds: string[], year: number, month: number): Promise<TargetsByBu> {
    return readTargets(buIds, async buFilter => {
      const res = await Pm_orgoutputachievmentsService.getAll({
        select: ['_pm_orgoutput_value', '_pm_businessunit_value', 'pm_target'],
        filter: `${buFilter} and pm_year eq ${year} and pm_month eq ${month} and statecode eq 0`
      });
      return (res.data || []) as Record<string, any>[];
    }, '_pm_orgoutput_value');
  }

  /**
   * "PM KPIs" — the KPIs a **sealed** model depends on: its components, plus its result when the
   * result is a KPI rather than an Org Output/Outcome. These have to carry a target every month
   * for the models built on them to mean anything, so the summary lists them whether or not one
   * has been set.
   */
  public static pmKpiIds(models: FinancialModel[]): Set<string> {
    const ids = new Set<string>();
    models
      .filter(model => model.status === 'Sealed')
      .forEach(model => {
        ModelService.componentKpiIds(model).forEach(id => ids.add(id));
        if (model.resultKind === 'kpi' && model.resultKpiId) ids.add(model.resultKpiId);
      });
    return ids;
  }
}
