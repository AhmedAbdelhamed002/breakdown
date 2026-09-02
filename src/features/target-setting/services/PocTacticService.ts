import { Stf_strategypocsService } from '../../../generated/services/Stf_strategypocsService';
import { Stf_strategytacticsService } from '../../../generated/services/Stf_strategytacticsService';

/**
 * PocTacticService — the POCs and Tactics a target can be driven by, from stf_strategypocs and
 * stf_strategytactics.
 *
 * The two tables hold the same idea with different columns, so this flattens them into one shape:
 *
 * |                  | POC (stf_strategypocs)      | Tactic (stf_strategytactics) |
 * | ---------------- | --------------------------- | ---------------------------- |
 * | name             | stf_pocname                 | stf_tacticname               |
 * | driver KPI       | stf_KPI                     | stf_KPI                      |
 * | current baseline | stf_currentbaseline         | stf_currentbaseline          |
 * | value driven to  | stf_kpitargetvalue          | stf_target                   |
 * | budget           | stf_neededbudget            | stf_neededbudget             |
 * | window           | stf_from / stf_to           | stf_deadline                 |
 * | category         | stf_POCCategory             | stf_TacticCategory           |
 * | region           | stf_Region                  | —                            |
 * | financial model  | pm_Model                    | —                            |
 *
 * The KPI is linked through stf_KPI directly rather than the stf_StrategyKPI junction: the annual
 * screen works from a business unit and a model, not from a strategy, so there's no strategy to
 * resolve a junction row against.
 */

export interface PocTactic {
  id: string;
  name: string;
  kind: 'POC' | 'Tactic';
  /** The KPI this POC/Tactic moves — stf_KPI. */
  driverKpiId?: string;
  regionId?: string;
  /** Where the driver KPI stood when the impact was recorded. */
  currentBaseline: number | null;
  /** What this POC/Tactic drives the KPI to. */
  targetValue: number | null;
  /** pm_Model on a POC — which financial model the impact was computed through. */
  modelId?: string;
}

export interface SavePocTacticInput {
  /** Set when updating an existing record; omitted to create one. */
  id?: string;
  kind: 'POC' | 'Tactic';
  name: string;
  driverKpiId: string;
  /** The driver KPI's value before this POC/Tactic. */
  currentBaseline: number;
  /** The value it is driven to. */
  targetValue: number;
  /** First day of the start month, written to stf_from on a POC. */
  startDate?: string;
  regionId?: string;
  modelId?: string;
  budget?: number;
  description?: string;
  /** POC only. */
  experimentScope?: string;
  successCriteria?: string;
  killCondition?: string;
  /** Tactic only. */
  deadline?: string;
}

/** How many KPI ids go into one `or` filter — keeps the request URL a sane length. */
const KPI_FILTER_BATCH = 15;

const orFilter = (column: string, ids: string[]) =>
  `(${ids.map(id => `${column} eq ${id}`).join(' or ')})`;

export class PocTacticService {
  /**
   * The POCs and Tactics that drive any of these KPIs, narrowed by the screen's context.
   *
   * `kpiIds` is what "linked to" means in practice: for a KPI it is that KPI, and for an Org
   * Output/Outcome it is the KPIs that contribute to it — neither table has a lookup to an org
   * entity, so the KPIs feeding it are the link. A region only narrows POCs; Tactics carry no
   * region of their own and would otherwise all disappear.
   */
  public static async findForKpis(kpiIds: string[], regionId?: string): Promise<PocTactic[]> {
    const ids = Array.from(new Set(kpiIds.filter(Boolean)));
    if (!ids.length) return [];

    const results: PocTactic[] = [];

    for (let i = 0; i < ids.length; i += KPI_FILTER_BATCH) {
      const batch = ids.slice(i, i + KPI_FILTER_BATCH);
      const kpiClause = orFilter('_stf_kpi_value', batch);

      const pocFilters = [kpiClause, 'statecode eq 0'];
      if (regionId) pocFilters.push(`_stf_region_value eq ${regionId}`);

      const [pocsRes, tacticsRes] = await Promise.all([
        Stf_strategypocsService.getAll({
          select: [
            'stf_strategypocid', 'stf_pocname', '_stf_kpi_value', '_stf_region_value',
            'stf_currentbaseline', 'stf_kpitargetvalue', '_pm_model_value'
          ],
          filter: pocFilters.join(' and ')
        }),
        Stf_strategytacticsService.getAll({
          select: [
            'stf_strategytacticid', 'stf_tacticname', '_stf_kpi_value',
            'stf_currentbaseline', 'stf_target'
          ],
          filter: `${kpiClause} and statecode eq 0`
        })
      ]);

      (pocsRes.data || []).forEach(p => {
        results.push({
          id: p.stf_strategypocid,
          name: p.stf_pocname || 'Unnamed POC',
          kind: 'POC',
          driverKpiId: p._stf_kpi_value,
          regionId: p._stf_region_value,
          currentBaseline: p.stf_currentbaseline ?? null,
          targetValue: p.stf_kpitargetvalue ?? null,
          modelId: (p as Record<string, any>)._pm_model_value
        });
      });

      (tacticsRes.data || []).forEach(t => {
        results.push({
          id: t.stf_strategytacticid,
          name: t.stf_tacticname || 'Unnamed Tactic',
          kind: 'Tactic',
          driverKpiId: t._stf_kpi_value,
          currentBaseline: t.stf_currentbaseline ?? null,
          targetValue: t.stf_target ?? null
        });
      });
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every active POC and Tactic — the annual page's project list when nothing is selected yet. */
  public static async getAllPocsAndTactics(regionId?: string): Promise<PocTactic[]> {
    const pocFilters = ['statecode eq 0'];
    if (regionId) pocFilters.push(`_stf_region_value eq ${regionId}`);

    const [pocsRes, tacticsRes] = await Promise.all([
      Stf_strategypocsService.getAll({
        select: [
          'stf_strategypocid', 'stf_pocname', '_stf_kpi_value', '_stf_region_value',
          'stf_currentbaseline', 'stf_kpitargetvalue', '_pm_model_value'
        ],
        filter: pocFilters.join(' and ')
      }),
      Stf_strategytacticsService.getAll({
        select: [
          'stf_strategytacticid', 'stf_tacticname', '_stf_kpi_value',
          'stf_currentbaseline', 'stf_target'
        ],
        filter: 'statecode eq 0'
      })
    ]);

    const results: PocTactic[] = [];

    (pocsRes.data || []).forEach(p => {
      results.push({
        id: p.stf_strategypocid,
        name: p.stf_pocname || 'Unnamed POC',
        kind: 'POC',
        driverKpiId: p._stf_kpi_value,
        regionId: p._stf_region_value,
        currentBaseline: p.stf_currentbaseline ?? null,
        targetValue: p.stf_kpitargetvalue ?? null,
        modelId: (p as Record<string, any>)._pm_model_value
      });
    });

    (tacticsRes.data || []).forEach(t => {
      results.push({
        id: t.stf_strategytacticid,
        name: t.stf_tacticname || 'Unnamed Tactic',
        kind: 'Tactic',
        driverKpiId: t._stf_kpi_value,
        currentBaseline: t.stf_currentbaseline ?? null,
        targetValue: t.stf_target ?? null
      });
    });

    return results;
  }

  /** Create or update the POC/Tactic itself. Returns its id. */
  public static async save(input: SavePocTacticInput): Promise<string> {
    return input.kind === 'POC' ? this.savePoc(input) : this.saveTactic(input);
  }

  private static async savePoc(input: SavePocTacticInput): Promise<string> {
    const payload: any = {
      stf_pocname: input.name,
      stf_currentbaseline: input.currentBaseline,
      stf_kpitargetvalue: input.targetValue,
      'stf_KPI@odata.bind': `/strategy_kpises(${input.driverKpiId})`
    };
    if (input.startDate) payload.stf_from = input.startDate;
    if (input.budget != null) payload.stf_neededbudget = input.budget;
    if (input.description) payload.stf_pocdescription = input.description;
    if (input.experimentScope) payload.stf_experimentscope = input.experimentScope;
    if (input.successCriteria) payload.stf_successcriteria = input.successCriteria;
    if (input.killCondition) payload.stf_killcondition = input.killCondition;
    if (input.regionId) payload['stf_Region@odata.bind'] = `/crd04_regionses(${input.regionId})`;
    if (input.modelId) payload['pm_Model@odata.bind'] = `/pm_models(${input.modelId})`;

    if (input.id) {
      const res = await Stf_strategypocsService.update(input.id, payload);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update the POC');
      return input.id;
    }

    // A new POC starts Active, matching what the strategy screens create.
    payload.stf_pocstatus = 1;
    const res = await Stf_strategypocsService.create(payload);
    if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to create the POC');
    return res.data.stf_strategypocid;
  }

  private static async saveTactic(input: SavePocTacticInput): Promise<string> {
    const payload: any = {
      stf_tacticname: input.name,
      stf_currentbaseline: input.currentBaseline,
      stf_target: input.targetValue,
      'stf_KPI@odata.bind': `/strategy_kpises(${input.driverKpiId})`
    };
    if (input.budget != null) payload.stf_neededbudget = input.budget;
    if (input.description) payload.stf_tacticdescription = input.description;
    if (input.deadline) payload.stf_deadline = input.deadline;

    if (input.id) {
      const res = await Stf_strategytacticsService.update(input.id, payload);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update the tactic');
      return input.id;
    }

    payload.stf_tacticstatus = 1;
    const res = await Stf_strategytacticsService.create(payload);
    if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to create the tactic');
    return res.data.stf_strategytacticid;
  }
}
