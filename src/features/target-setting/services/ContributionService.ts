import { Pm_outputcontributionsService } from '../../../generated/services/Pm_outputcontributionsService';
import { Pm_outcomecontributionsService } from '../../../generated/services/Pm_outcomecontributionsService';
import { EntityNameService } from './EntityNameService';
import { ContributionLink } from '../models/types';

/**
 * ContributionService — finds which Org Outputs / Org Outcomes a KPI contributes to
 * (via pm_outputcontributions and pm_outcomecontributions tables).
 * Also resolves contributing KPIs for a given Org Output/Outcome (reverse lookup).
 */
export class ContributionService {
  /** Get Org Outputs that a KPI contributes to */
  public static async getOutputContributions(kpiId: string): Promise<ContributionLink[]> {
    const [res, names] = await Promise.all([
      Pm_outputcontributionsService.getAll({
        select: ['pm_outputcontributionid', 'pm_weightpct', 'pm_name',
                 '_pm_targetoutput_value', '_pm_sourcekpi_value'],
        filter: `_pm_sourcekpi_value eq ${kpiId} and statecode eq 0`
      }),
      EntityNameService.maps()
    ]);
    if (!res.success || !res.data) return [];
    return res.data.map(r => ({
      id: r.pm_outputcontributionid,
      sourceKpiId: kpiId,
      sourceKpiName: EntityNameService.resolve(names, 'kpi', kpiId, r, '_pm_sourcekpi_value', ''),
      targetEntityId: r._pm_targetoutput_value || '',
      targetEntityName: EntityNameService.resolve(
        names, 'output', r._pm_targetoutput_value, r, '_pm_targetoutput_value', 'Unknown Output'
      ),
      targetKind: 'output' as const,
      weightPct: r.pm_weightpct || 0
    }));
  }

  /** Get Org Outcomes that a KPI contributes to */
  public static async getOutcomeContributions(kpiId: string): Promise<ContributionLink[]> {
    const [res, names] = await Promise.all([
      Pm_outcomecontributionsService.getAll({
        select: ['pm_outcomecontributionid', 'pm_weightpct', 'pm_name',
                 '_pm_targetoutcome_value', '_pm_sourcekpi_value'],
        filter: `_pm_sourcekpi_value eq ${kpiId} and statecode eq 0`
      }),
      EntityNameService.maps()
    ]);
    if (!res.success || !res.data) return [];
    return res.data.map(r => ({
      id: r.pm_outcomecontributionid,
      sourceKpiId: kpiId,
      sourceKpiName: EntityNameService.resolve(names, 'kpi', kpiId, r, '_pm_sourcekpi_value', ''),
      targetEntityId: r._pm_targetoutcome_value || '',
      targetEntityName: EntityNameService.resolve(
        names, 'outcome', r._pm_targetoutcome_value, r, '_pm_targetoutcome_value', 'Unknown Outcome'
      ),
      targetKind: 'outcome' as const,
      weightPct: r.pm_weightpct || 0
    }));
  }

  /** Get all contributions (both output + outcome) for a KPI */
  public static async getAllContributions(kpiId: string): Promise<ContributionLink[]> {
    const [outputs, outcomes] = await Promise.all([
      this.getOutputContributions(kpiId),
      this.getOutcomeContributions(kpiId)
    ]);
    return [...outputs, ...outcomes];
  }

  /** Reverse lookup: find KPIs that contribute to a given Org Output */
  public static async getContributingKpisForOutput(outputId: string, businessUnitId?: string): Promise<ContributionLink[]> {
    const businessUnitFilter = businessUnitId ? ` and _pm_businessunit_value eq ${businessUnitId}` : '';
    const [res, names] = await Promise.all([
      Pm_outputcontributionsService.getAll({
        select: ['pm_outputcontributionid', 'pm_weightpct', 'pm_name',
                 '_pm_targetoutput_value', '_pm_sourcekpi_value'],
        filter: `_pm_targetoutput_value eq ${outputId}${businessUnitFilter} and statecode eq 0`
      }),
      EntityNameService.maps()
    ]);
    if (!res.success || !res.data) return [];
    return res.data.map(r => ({
      id: r.pm_outputcontributionid,
      sourceKpiId: r._pm_sourcekpi_value || '',
      sourceKpiName: EntityNameService.resolve(names, 'kpi', r._pm_sourcekpi_value, r, '_pm_sourcekpi_value', ''),
      targetEntityId: outputId,
      targetEntityName: EntityNameService.resolve(names, 'output', outputId, r, '_pm_targetoutput_value', ''),
      targetKind: 'output' as const,
      weightPct: r.pm_weightpct || 0
    }));
  }

  /** Reverse lookup: find KPIs that contribute to a given Org Outcome */
  public static async getContributingKpisForOutcome(outcomeId: string, businessUnitId?: string): Promise<ContributionLink[]> {
    const businessUnitFilter = businessUnitId ? ` and _pm_businessunit_value eq ${businessUnitId}` : '';
    const [res, names] = await Promise.all([
      Pm_outcomecontributionsService.getAll({
        select: ['pm_outcomecontributionid', 'pm_weightpct', 'pm_name',
                 '_pm_targetoutcome_value', '_pm_sourcekpi_value'],
        filter: `_pm_targetoutcome_value eq ${outcomeId}${businessUnitFilter} and statecode eq 0`
      }),
      EntityNameService.maps()
    ]);
    if (!res.success || !res.data) return [];
    return res.data.map(r => ({
      id: r.pm_outcomecontributionid,
      sourceKpiId: r._pm_sourcekpi_value || '',
      sourceKpiName: EntityNameService.resolve(names, 'kpi', r._pm_sourcekpi_value, r, '_pm_sourcekpi_value', ''),
      targetEntityId: outcomeId,
      targetEntityName: EntityNameService.resolve(names, 'outcome', outcomeId, r, '_pm_targetoutcome_value', ''),
      targetKind: 'outcome' as const,
      weightPct: r.pm_weightpct || 0
    }));
  }
}
