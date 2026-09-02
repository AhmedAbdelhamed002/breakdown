import { BaseEntity } from './EntityService';
import { AchievementRecord } from './AchievementService';
import { ProposalOutcome, TargetWriteService } from '@infrastructure/financialImpact/TargetWriteService';
import { Pm_kpiachievmentsService } from '../../../generated/services/Pm_kpiachievmentsService';
import { Pm_orgoutcomeachievmentsService } from '../../../generated/services/Pm_orgoutcomeachievmentsService';
import { Pm_orgoutputachievmentsService } from '../../../generated/services/Pm_orgoutputachievmentsService';
import { DeptFunctionService } from './DeptFunctionService';
import {
  calculateBaselineForecast,
  getTrailingActuals,
  getYearFigures
} from '../utils/annualForecast';

export type { ForecastProfileMonth, YearFigures } from '../utils/annualForecast';

/**
 * The trend/roll-up maths lives in `../utils/annualForecast` as plain functions — this service
 * only forwards to it. Keeping it out of here is what makes it testable: everything below the
 * forwarding methods reaches Dataverse through the generated services, and importing this module
 * pulls the Power Apps SDK in with it.
 */
export class AnnualForecastService {
  public static getTrailingActuals = getTrailingActuals;

  public static calculateBaselineForecast = calculateBaselineForecast;

  public static getYearFigures = getYearFigures;

  /**
   * Save a forecast month as a proposal. Written through TargetWriteService so every proposal —
   * whichever screen it comes from — records what it's for and is flagged, and raised in
   * pm_conflicts, when it undercuts an approved target.
   */
  public static async saveProposal(
    entity: BaseEntity,
    buId: string,
    year: number,
    month: number,
    proposedValue: number
  ): Promise<ProposalOutcome> {
    return TargetWriteService.writeProposalWithConflict(
      { kind: entity.kind, id: entity.id },
      entity.name,
      buId,
      year,
      month,
      proposedValue,
      'Forecast',
      undefined,
      entity.kind === 'kpi' ? await DeptFunctionService.labelFor(entity.id) : undefined
    );
  }

  public static async finalizeTarget(
    entity: BaseEntity,
    buId: string,
    achievementRec: AchievementRecord,
    targetValue: number
  ) {
    // If target already exists, we must create a proposal instead of overriding
    if (achievementRec.target != null) {
      return this.saveProposal(entity, buId, achievementRec.year, achievementRec.month, targetValue);
    }

    // Otherwise, update the achievement record
    const payload = { pm_target: targetValue };
    
    if (entity.kind === 'outcome') {
      return Pm_orgoutcomeachievmentsService.update(achievementRec.id, payload);
    } else if (entity.kind === 'output') {
      return Pm_orgoutputachievmentsService.update(achievementRec.id, payload);
    } else {
      return Pm_kpiachievmentsService.update(achievementRec.id, payload);
    }
  }
}
