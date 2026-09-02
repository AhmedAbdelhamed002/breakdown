import { Pm_kpiceilingsService } from '../../../generated/services/Pm_kpiceilingsService';
import {
  Pm_kpiceilingspm_isconstraint,
  Pm_kpiceilingspm_kpiceilingstatus
} from '../../../generated/models/Pm_kpiceilingsModel';

/**
 * KpiConstraintService — the min/max a KPI may be targeted at in a business unit, from
 * pm_kpiceilings.
 *
 * The prototype checks these on every KPI proposal: a value beyond the constraint is blocked
 * outright, and a model's result is clamped back to the range before it's shown. Only rows that
 * are enforced and still active count, and the most recently effective one wins.
 */

/** Enforced (1) vs Off (2) — a row that isn't enforced is a reference, not a limit. */
const ENFORCED: Pm_kpiceilingspm_isconstraint = 1;
/** Active (1) vs Superseded (2). */
const ACTIVE: Pm_kpiceilingspm_kpiceilingstatus = 1;

export interface KpiConstraint {
  min: number | null;
  max: number | null;
}

export interface ConstraintViolation {
  side: 'min' | 'max';
  limit: number;
  message: string;
}

export class KpiConstraintService {
  /**
   * Every enforced constraint in a business unit, keyed by KPI — one read, so a screen holding
   * many KPIs doesn't ask per KPI.
   */
  public static async getConstraints(buId: string): Promise<Map<string, KpiConstraint>> {
    const constraints = new Map<string, KpiConstraint>();
    if (!buId) return constraints;

    const res = await Pm_kpiceilingsService.getAll({
      select: [
        'pm_kpiceilingid', '_pm_kpi_value', 'pm_min', 'pm_max',
        'pm_effectivedate', 'pm_isconstraint', 'pm_kpiceilingstatus'
      ],
      filter: `_pm_businessunit_value eq ${buId} and statecode eq 0`
    });
    if (!res.success || !res.data) return constraints;

    // Most recently effective wins, so sort ascending and let later rows overwrite earlier ones.
    const rows = res.data
      .filter(r => r._pm_kpi_value && r.pm_isconstraint === ENFORCED && r.pm_kpiceilingstatus === ACTIVE)
      .sort((a, b) => new Date(a.pm_effectivedate || 0).getTime() - new Date(b.pm_effectivedate || 0).getTime());

    rows.forEach(row => {
      const min = row.pm_min ?? null;
      const max = row.pm_max ?? null;
      if (min == null && max == null) return;
      constraints.set(row._pm_kpi_value!, { min, max });
    });
    return constraints;
  }

  /** Pull a value back inside its constraint. Returns the value unchanged when there isn't one. */
  public static clamp(value: number, constraint?: KpiConstraint | null): number {
    if (!constraint) return value;
    if (constraint.max != null && value > constraint.max) return constraint.max;
    if (constraint.min != null && value < constraint.min) return constraint.min;
    return value;
  }

  /** How a value breaks its constraint, or null when it doesn't. */
  public static violation(
    value: number | null | undefined,
    constraint: KpiConstraint | null | undefined,
    kpiName: string
  ): ConstraintViolation | null {
    if (!constraint || value == null) return null;
    if (constraint.max != null && value > constraint.max + 1e-6) {
      return { side: 'max', limit: constraint.max, message: `${kpiName} ${value} exceeds its max of ${constraint.max}` };
    }
    if (constraint.min != null && value < constraint.min - 1e-6) {
      return { side: 'min', limit: constraint.min, message: `${kpiName} ${value} is below its min of ${constraint.min}` };
    }
    return null;
  }
}
