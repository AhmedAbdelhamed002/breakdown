import { Strategy_kpisesService } from '../../../generated/services/Strategy_kpisesService';
import { Pm_orgoutcomesService } from '../../../generated/services/Pm_orgoutcomesService';
import { Pm_orgoutputsService } from '../../../generated/services/Pm_orgoutputsService';
import {
  Strategy_kpisesstrategy_aggregatetype,
  Strategy_kpisesstrategy_kpitype
} from '../../../generated/models/Strategy_kpisesModel';

export interface BaseEntity {
  id: string;
  name: string;
  kind: 'outcome' | 'output' | 'kpi';
  type?: string;
  /** 'Percentage' KPIs average across months; everything else sums. Org Output/Outcome have no aggregation type of their own, so they default to 'Value' (sum). */
  aggType?: 'Percentage' | 'Value';
  /** Which department and function the KPI belongs to — the Bottom-up and Summary filters. */
  departmentId?: string;
  functionId?: string;
}

/**
 * Choice labels come from the generated enums rather than the `<column>name` annotation: the
 * platform doesn't populate those, which used to leave every KPI's type undefined (and so sorted
 * as an Input) and every KPI aggregating as a Value.
 */
const kpiTypeLabel = (value?: Strategy_kpisesstrategy_kpitype, fallback?: string): string | undefined =>
  (value != null ? Strategy_kpisesstrategy_kpitype[value] : undefined) || fallback;

const kpiAggType = (
  value?: Strategy_kpisesstrategy_aggregatetype, fallback?: string
): BaseEntity['aggType'] => {
  const label = (value != null ? Strategy_kpisesstrategy_aggregatetype[value] : undefined) || fallback;
  return label === 'Percentage' ? 'Percentage' : 'Value';
};

export class EntityService {
  public static async getOrgOutcomes(): Promise<BaseEntity[]> {
    const res = await Pm_orgoutcomesService.getAll({
      select: ['pm_orgoutcomeid', 'pm_name'],
      filter: 'statecode eq 0'
    });
    if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to fetch Org Outcomes');
    return res.data.map(r => ({
      id: r.pm_orgoutcomeid,
      name: r.pm_name || 'Unnamed Outcome',
      kind: 'outcome',
      aggType: 'Value'
    }));
  }

  public static async getOrgOutputs(): Promise<BaseEntity[]> {
    const res = await Pm_orgoutputsService.getAll({
      select: ['pm_orgoutputid', 'pm_name'],
      filter: 'statecode eq 0'
    });
    if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to fetch Org Outputs');
    return res.data.map(r => ({
      id: r.pm_orgoutputid,
      name: r.pm_name || 'Unnamed Output',
      kind: 'output',
      aggType: 'Value'
    }));
  }

  /** strategy_kpises is large (1,800+ rows in this org) — a single unpaged getAll() only returns
   * its first page, so an unfiltered call (no region/department/function narrowing it down) used
   * to silently drop most of the table. Confirmed live: Org Objectives' "mandatory departments"
   * check calls this with no filters at all to cross-reference every pm_outputcontribution source
   * KPI, and KPIs outside that first page came back as "not found", so their whole department
   * silently never appeared as mandatory even though the underlying contribution data was correct.
   * Paged with skipToken until exhausted, same fix this table already needed elsewhere (see
   * dataverseService.ts's fetchAllStrategyKpisUnfiltered / ModelService.ts's fetchAllKpiNames). */
  private static readonly KPI_PAGE_SIZE = 5000;
  private static readonly KPI_MAX_PAGES = 100;

  public static async getKpis(regionId?: string, departmentId?: string, functionId?: string): Promise<BaseEntity[]> {
    const clauses = ['statecode eq 0'];
    if (regionId) clauses.push(`_strategy_region_value eq ${regionId}`);
    if (departmentId) clauses.push(`_strategy_department_value eq ${departmentId}`);
    if (functionId) clauses.push(`_strategy_function_value eq ${functionId}`);
    const filter = clauses.join(' and ');

    const rows: BaseEntity[] = [];
    let skipToken: string | undefined;
    for (let page = 0; page < EntityService.KPI_MAX_PAGES; page++) {
      const res = await Strategy_kpisesService.getAll({
        select: [
          'strategy_kpisid', 'strategy_newcolumn', 'strategy_kpitype', 'strategy_aggregatetype',
          '_strategy_department_value', '_strategy_function_value'
        ],
        filter,
        maxPageSize: EntityService.KPI_PAGE_SIZE,
        ...(skipToken ? { skipToken } : {})
      });
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to fetch KPIs');
      rows.push(...res.data.map(r => ({
        id: r.strategy_kpisid,
        name: r.strategy_newcolumn || 'Unnamed KPI',
        kind: 'kpi' as const,
        type: kpiTypeLabel(r.strategy_kpitype, r.strategy_kpitypename),
        aggType: kpiAggType(r.strategy_aggregatetype, r.strategy_aggregatetypename),
        departmentId: r._strategy_department_value,
        functionId: r._strategy_function_value
      })));
      if (!res.skipToken) break;
      skipToken = res.skipToken;
    }
    return rows;
  }
}
