import { Pm_outputcontributionsService } from '../../../generated/services/Pm_outputcontributionsService';
import { Pm_outcomecontributionsService } from '../../../generated/services/Pm_outcomecontributionsService';
import { Pm_orgoutputachievmentsService } from '../../../generated/services/Pm_orgoutputachievmentsService';
import { Pm_orgoutcomeachievmentsService } from '../../../generated/services/Pm_orgoutcomeachievmentsService';
import { Pm_kpiachievmentsService } from '../../../generated/services/Pm_kpiachievmentsService';
import { Pm_orgoutputoutcomesService } from '../../../generated/services/Pm_orgoutputoutcomesService';
import { EntityNameService } from './EntityNameService';

export interface RollUpRow {
  level: 'Org Output' | 'Org Outcome';
  entityId: string;
  entityName: string;
  link: string;
  weightPct: number;
  current: number;
  projected: number;
  existingTarget: number | null;
  hasConflict: boolean;
}

export class RollUpService {
  /** Lists the Org Outcomes affected by an Org Output. */
  public static async getRollUpForOutput(
    outputId: string,
    outputName: string,
    businessUnitId: string,
    year: number
  ): Promise<RollUpRow[]> {
    const [relations, names] = await Promise.all([
      Pm_orgoutputoutcomesService.getAll({
        select: ['pm_orgoutputoutcomeid', '_pm_orgoutput_value', '_pm_orgoutcome_value'],
        filter: `_pm_orgoutput_value eq ${outputId} and statecode eq 0`
      }),
      EntityNameService.maps()
    ]);
    if (!relations.success || !relations.data) return [];

    return Promise.all(relations.data
      .filter(relation => !!relation._pm_orgoutcome_value)
      .map(async relation => {
        const outcomeId = relation._pm_orgoutcome_value!;
        const outcomeName = EntityNameService.resolve(
          names, 'outcome', outcomeId, relation, '_pm_orgoutcome_value', 'Unknown Outcome'
        );
        const { current, target } = await RollUpService.getOutcomeAchievement(outcomeId, businessUnitId, year);
        return {
          level: 'Org Outcome' as const,
          entityId: outcomeId,
          entityName: outcomeName,
          link: `${outputName} affects ${outcomeName}`,
          weightPct: 0,
          current,
          projected: current,
          existingTarget: target,
          hasConflict: false
        };
      }));
  }

  /**
   * Given a selected KPI id, find which Org Outputs and Org Outcomes it contributes to,
   * then fetch their current achievement and existing target values.
   */
  public static async getRollUpForKpi(
    kpiId: string,
    kpiName: string,
    businessUnitId: string,
    year: number,
    projectedKpiValue: number
  ): Promise<RollUpRow[]> {
    const rows: RollUpRow[] = [];

    // The KPI already contributes its current value to the org entity, so projecting means
    // swapping that contribution out for the new one — not adding the new one on top.
    const [baseKpiValue, names] = await Promise.all([
      RollUpService.getKpiBaseValue(kpiId, businessUnitId, year),
      EntityNameService.maps()
    ]);

    // 1. Find Org Outputs this KPI contributes to (weight is per-BU; effective-dated, most recent wins)
    const outputContribs = await Pm_outputcontributionsService.getAll({
      select: ['pm_outputcontributionid', 'pm_weightpct', 'pm_name', '_pm_targetoutput_value', '_pm_sourcekpi_value', '_pm_businessunit_value', 'pm_effectivedate'],
      filter: `_pm_sourcekpi_value eq ${kpiId} and _pm_businessunit_value eq ${businessUnitId} and statecode eq 0`
    });

    if (outputContribs.success && outputContribs.data) {
      const latestByOutput = RollUpService.mostRecentByTarget(outputContribs.data, '_pm_targetoutput_value');
      for (const contrib of latestByOutput) {
        const outputId = contrib._pm_targetoutput_value;
        const outputName = EntityNameService.resolve(
          names, 'output', outputId, contrib, '_pm_targetoutput_value', 'Unknown Output'
        );
        const weight = contrib.pm_weightpct || 0;

        // Fetch current achievement for this org output
        const { current, target } = await RollUpService.getOutputAchievement(
          outputId!, businessUnitId, year
        );

        const projected = current - (baseKpiValue * weight / 100) + (projectedKpiValue * weight / 100);

        rows.push({
          level: 'Org Output',
          entityId: outputId || '',
          entityName: outputName,
          link: `${kpiName} is ${weight}% of ${outputName}`,
          weightPct: weight,
          current,
          projected,
          existingTarget: target,
          hasConflict: RollUpService.isConflict(projected, target)
        });
      }
    }

    // 2. Find Org Outcomes this KPI contributes to (weight is per-BU; effective-dated, most recent wins)
    const outcomeContribs = await Pm_outcomecontributionsService.getAll({
      select: ['pm_outcomecontributionid', 'pm_weightpct', 'pm_name', '_pm_targetoutcome_value', '_pm_sourcekpi_value', '_pm_businessunit_value', 'pm_effectivedate'],
      filter: `_pm_sourcekpi_value eq ${kpiId} and _pm_businessunit_value eq ${businessUnitId} and statecode eq 0`
    });

    if (outcomeContribs.success && outcomeContribs.data) {
      const latestByOutcome = RollUpService.mostRecentByTarget(outcomeContribs.data, '_pm_targetoutcome_value');
      for (const contrib of latestByOutcome) {
        const outcomeId = contrib._pm_targetoutcome_value;
        const outcomeName = EntityNameService.resolve(
          names, 'outcome', outcomeId, contrib, '_pm_targetoutcome_value', 'Unknown Outcome'
        );
        const weight = contrib.pm_weightpct || 0;

        // Fetch current achievement for this org outcome
        const { current, target } = await RollUpService.getOutcomeAchievement(
          outcomeId!, businessUnitId, year
        );

        const projected = current - (baseKpiValue * weight / 100) + (projectedKpiValue * weight / 100);

        rows.push({
          level: 'Org Outcome',
          entityId: outcomeId || '',
          entityName: outcomeName,
          link: `${kpiName} feeds ${outcomeName}`,
          weightPct: weight,
          current,
          projected,
          existingTarget: target,
          hasConflict: RollUpService.isConflict(projected, target)
        });
      }
    }

    return rows;
  }

  /**
   * A KPI's existing contribution basis — its baseline, falling back to actual. This is what the
   * projected value replaces when a new target is modelled.
   */
  private static async getKpiBaseValue(kpiId: string, businessUnitId: string, year: number): Promise<number> {
    const res = await Pm_kpiachievmentsService.getAll({
      select: ['pm_actual', 'pm_baseline'],
      filter: `_pm_kpi_value eq ${kpiId} and _pm_businessunit_value eq ${businessUnitId} and pm_year eq ${year} and statecode eq 0`
    });
    if (!res.success || !res.data) return 0;
    return res.data.reduce((sum: number, rec) => sum + (rec.pm_baseline ?? rec.pm_actual ?? 0), 0);
  }

  /** An existing org target conflicts when the projection differs from it by more than 1%. */
  private static isConflict(projected: number, target: number | null): boolean {
    if (target == null || target <= 0) return false;
    return Math.abs(projected - target) / Math.max(1, target) > 0.01;
  }

  /** Sum actual values for an Org Output in a given BU+Year */
  private static async getOutputAchievement(
    outputId: string, businessUnitId: string, year: number
  ): Promise<{ current: number; target: number | null }> {
    const res = await Pm_orgoutputachievmentsService.getAll({
      select: ['pm_actual', 'pm_target', 'pm_month'],
      filter: `_pm_orgoutput_value eq ${outputId} and _pm_businessunit_value eq ${businessUnitId} and pm_year eq ${year} and statecode eq 0`
    });

    let current = 0;
    let target: number | null = null;

    if (res.success && res.data) {
      for (const rec of res.data) {
        current += rec.pm_actual || 0;
        if (rec.pm_target != null && target === null) {
          target = 0;
        }
        if (rec.pm_target != null) {
          target = (target || 0) + rec.pm_target;
        }
      }
    }

    return { current, target };
  }

  /** Sum actual values for an Org Outcome in a given BU+Year */
  private static async getOutcomeAchievement(
    outcomeId: string, businessUnitId: string, year: number
  ): Promise<{ current: number; target: number | null }> {
    const res = await Pm_orgoutcomeachievmentsService.getAll({
      select: ['pm_actual', 'pm_target', 'pm_month'],
      filter: `_pm_orgoutcome_value eq ${outcomeId} and _pm_businessunit_value eq ${businessUnitId} and pm_year eq ${year} and statecode eq 0`
    });

    let current = 0;
    let target: number | null = null;

    if (res.success && res.data) {
      for (const rec of res.data) {
        current += rec.pm_actual || 0;
        if (rec.pm_target != null && target === null) {
          target = 0;
        }
        if (rec.pm_target != null) {
          target = (target || 0) + rec.pm_target;
        }
      }
    }

    return { current, target };
  }

  /** Collapse contribution rows to one per target entity — the most recently effective wins. */
  private static mostRecentByTarget<T extends Record<string, any>>(rows: T[], targetKey: string): T[] {
    const byTarget = new Map<string, T>();
    for (const row of rows) {
      const key = row[targetKey];
      if (!key) continue;
      const existing = byTarget.get(key);
      if (!existing || new Date(row.pm_effectivedate || 0) >= new Date(existing.pm_effectivedate || 0)) {
        byTarget.set(key, row);
      }
    }
    return Array.from(byTarget.values());
  }
}
