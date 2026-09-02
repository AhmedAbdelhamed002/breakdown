import { Pm_orgoutcomeachievmentsService } from '../../../generated/services/Pm_orgoutcomeachievmentsService';
import { Pm_orgoutputachievmentsService } from '../../../generated/services/Pm_orgoutputachievmentsService';
import { Pm_kpiachievmentsService } from '../../../generated/services/Pm_kpiachievmentsService';
import { BaseEntity } from './EntityService';

export interface AchievementRecord {
  id: string;
  month: number;
  year: number;
  actual: number | null;
  baseline: number | null;
  target: number | null;
}

export class AchievementService {
  /**
   * strategy_kpises has no direct business-unit field, so "which KPIs belong to this BU" is
   * derived from which KPIs actually have an achievement record for that BU.
   */
  public static async getKpiIdsForBusinessUnit(businessUnitId: string): Promise<Set<string>> {
    const res = await Pm_kpiachievmentsService.getAll({
      select: ['_pm_kpi_value'],
      filter: `_pm_businessunit_value eq ${businessUnitId}`
    });
    if (!res.success || !res.data) return new Set();
    return new Set(res.data.map(r => r._pm_kpi_value).filter((id): id is string => !!id));
  }

  public static async getAchievements(entity: BaseEntity, buId: string, year: number): Promise<AchievementRecord[]> {
    if (entity.kind === 'outcome') {
      const res = await Pm_orgoutcomeachievmentsService.getAll({
        select: ['pm_orgoutcomeachievmentid', 'pm_month', 'pm_year', 'pm_actual', 'pm_baseline', 'pm_target'],
        filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and _pm_orgoutcome_value eq ${entity.id}`
      });
      if (!res.success) throw new Error('Failed to fetch outcome achievements');
      return (res.data || []).map(r => ({
        id: r.pm_orgoutcomeachievmentid,
        month: r.pm_month as unknown as number,
        year: r.pm_year || 0,
        actual: r.pm_actual ?? null,
        baseline: r.pm_baseline ?? null,
        target: r.pm_target ?? null
      }));
    } else if (entity.kind === 'output') {
      const res = await Pm_orgoutputachievmentsService.getAll({
        select: ['pm_orgoutputachievmentid', 'pm_month', 'pm_year', 'pm_actual', 'pm_baseline', 'pm_target'],
        filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and _pm_orgoutput_value eq ${entity.id}`
      });
      if (!res.success) throw new Error('Failed to fetch output achievements');
      return (res.data || []).map(r => ({
        id: r.pm_orgoutputachievmentid,
        month: r.pm_month as unknown as number,
        year: r.pm_year || 0,
        actual: r.pm_actual ?? null,
        baseline: r.pm_baseline ?? null,
        target: r.pm_target ?? null
      }));
    } else {
      const res = await Pm_kpiachievmentsService.getAll({
        select: ['pm_kpiachievmentid', 'pm_month', 'pm_year', 'pm_actual', 'pm_baseline', 'pm_target'],
        filter: `_pm_businessunit_value eq ${buId} and pm_year eq ${year} and _pm_kpi_value eq ${entity.id}`
      });
      if (!res.success) throw new Error('Failed to fetch KPI achievements');
      return (res.data || []).map(r => ({
        id: r.pm_kpiachievmentid,
        month: r.pm_month as unknown as number,
        year: r.pm_year || 0,
        actual: r.pm_actual ?? null,
        baseline: r.pm_baseline ?? null,
        target: r.pm_target ?? null
      }));
    }
  }
}
