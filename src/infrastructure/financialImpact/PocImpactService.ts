import { Strategy_kpisesService } from '@generated/services/Strategy_kpisesService';
import { FinancialModel, ModelService } from './ModelService';
import { EvalContext, KpiValues, recomputeResult } from './ModelEvalService';
import { LedgerService } from './LedgerService';
import { ConflictService } from './ConflictService';
import { TargetWriteService } from './TargetWriteService';
import { TargetSource } from './TargetSource';

/**
 * PocImpactService — the shared Financial Model impact engine, usable by anything that drives a
 * KPI through a model: Top-down Annual's own "Add POC/Tactic" flow and Strategy Formulation's
 * Create POC both preview and apply through this one place, so the same model always produces the
 * same result regardless of where the POC was created.
 *
 * A POC moves one component of a financial model to a new value. From there the effect follows
 * the model: the driver KPI itself, then the model's result, and — when that result is an Output
 * and a caller picks a second model — on through to the Outcome it feeds.
 *
 * Each of those values goes through the same write-or-propose rule, which never bypasses the
 * conflict logic:
 *
 *   sealed model + no target yet   → the target is written
 *   sealed model + existing target → a proposal, flagged as a conflict when it differs
 *   draft model                    → a proposal only
 *
 * What this service does NOT do: save the POC/Tactic record itself. That's owned by whichever
 * feature is calling it (Top-down Annual's PocTacticService, Strategy Formulation's own
 * createPoc/updatePoc + findOrCreateStrategyKpi) — each keeps its own linkage architecture. This
 * service only ever touches pm_kpiachievment/pm_proposals/pm_conflicts (via LedgerService,
 * TargetWriteService, ConflictService).
 */

/** Everything needed to preview and apply a POC's impact through a Financial Model. */
export interface ApplyPocImpactInput {
  model: FinancialModel;
  driverKpiId: string;
  driverKpiName: string;
  /** Where the driver KPI stands today — its baseline for the month. */
  currentValue: number;
  /** What this POC/Tactic drives it to. */
  newValue: number;
  month: number;
  year: number;
  buId: string;
  /** Chosen when the model's result is an Output, to carry the effect on to an Outcome. */
  outcomeModel?: FinancialModel | null;
  evalContext: EvalContext;
  /** Resolves a KPI's display name, for proposal and conflict records. */
  kpiName: (kpiId: string) => string;
}

/** One value the impact would write, and what that write turns into. */
export interface PlannedWrite {
  kpiId: string;
  kpiName: string;
  /** What the KPI would be set to. */
  value: number;
  /** Its approved target for the month, when it already has one. */
  existingTarget: number | null;
  /** 'target' writes it; 'proposal' sends it for review; 'conflict' is a proposal that disagrees. */
  outcome: 'target' | 'proposal' | 'conflict';
  /** Which step of the chain produced it. */
  role: 'driver' | 'result' | 'outcome';
}

/**
 * Before/after for one KPI involved in the calculation — every component of the model plus its
 * result, not only the ones a write gets planned for. Outcome-typed KPIs are never excluded here
 * even though they can't be picked as a driver: if a model's own component or the second hop's
 * result happens to be Outcome-typed, it still shows the impact.
 */
export interface KpiImpactRow {
  kpiId: string;
  kpiName: string;
  /** The KPI table's own type label (e.g. 'OutPut', 'Process', 'OutCome') — undefined for a result that's an Org Output/Outcome directly, not a KPI. */
  kpiType?: string;
  role: 'driver' | 'component' | 'result' | 'outcome-component' | 'outcome-result';
  before: number;
  after: number;
  change: number;
  /** null when `before` is 0 — a percentage change from zero isn't meaningful. */
  changePercent: number | null;
}

/** Everything the POC comes to, before anything is written. */
export interface PocImpactPreview {
  writes: PlannedWrite[];
  /** Before/after for every KPI touched by the calculation — the driver, every other component of
   * the model (even unchanged ones), the result, and — when an outcome model is picked — that
   * model's own components and result too. */
  kpiImpacts: KpiImpactRow[];
  driverDelta: number;
  /** The model's result before and after the driver moves. */
  resultBefore: number;
  resultAfter: number;
  resultKpiId?: string;
  resultKpiName?: string;
  /** The onward Outcome effect, when a second model was picked. */
  outcomeBefore?: number;
  outcomeAfter?: number;
  outcomeKpiId?: string;
  outcomeKpiName?: string;
}

/** Anything driven through a financial model is recorded as coming from the modeler. */
const POC_SOURCE: TargetSource = 'Financial Modelar';

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function changePercent(before: number, after: number): number | null {
  if (!before) return null;
  return round(((after - before) / Math.abs(before)) * 100);
}

export class PocImpactService {
  /**
   * Each component's current standing, which is what the model is evaluated against: the month's
   * actual, else its baseline, else 1 so a product isn't zeroed out.
   */
  public static async baseValues(
    model: FinancialModel, buId: string, year: number, month: number
  ): Promise<KpiValues> {
    const values: KpiValues = {};
    await Promise.all(ModelService.componentKpiIds(model).map(async kpiId => {
      const ledger = await LedgerService.getLedger({ kind: 'kpi', id: kpiId }, buId, year);
      const entry = ledger.months.find(m => m.month === month);
      values[kpiId] = entry?.actual ?? entry?.baseline ?? 1;
    }));
    return values;
  }

  /** KPI Type labels for a set of ids, read from the KPI table itself — the only source of truth for type. */
  private static async fetchKpiTypes(kpiIds: string[]): Promise<Map<string, string>> {
    const ids = Array.from(new Set(kpiIds.filter(Boolean)));
    if (ids.length === 0) return new Map();
    const res = await Strategy_kpisesService.getAll({
      filter: ids.map(id => `strategy_kpisid eq '${id}'`).join(' or '),
      select: ['strategy_kpisid', 'strategy_kpitypename']
    });
    return new Map((res.data || []).map(r => [r.strategy_kpisid, r.strategy_kpitypename || '']));
  }

  /** A component KPI's name as the model itself already carries it (term/factor), before falling back to the caller's resolver — the model's own resolved name is already correct for every one of its components, so there's no need to ask the caller to duplicate that lookup. */
  private static modelKpiName(model: FinancialModel, kpiId: string, fallback: (id: string) => string): string {
    const term = model.terms.find(t => t.kind === 'kpi' && t.kpiId === kpiId);
    if (term?.kpiName) return term.kpiName;
    const factor = model.factors.find(f => f.kpiId === kpiId);
    if (factor?.kpiName) return factor.kpiName;
    return fallback(kpiId);
  }

  /** Every component of a model, expanded into impact rows — the driver/overridden ones reflect `overrides`, every other component is unchanged (before === after). */
  private static componentRows(
    model: FinancialModel,
    base: KpiValues,
    overrides: KpiValues,
    driverKpiId: string | undefined,
    componentRole: 'component' | 'outcome-component',
    driverRole: 'driver',
    kpiTypeById: Map<string, string>,
    kpiName: (id: string) => string
  ): KpiImpactRow[] {
    return ModelService.componentKpiIds(model).map(kpiId => {
      const before = base[kpiId] ?? 0;
      const after = overrides[kpiId] ?? before;
      return {
        kpiId,
        kpiName: this.modelKpiName(model, kpiId, kpiName),
        kpiType: kpiTypeById.get(kpiId),
        role: kpiId === driverKpiId ? driverRole : componentRole,
        before,
        after,
        change: round(after - before),
        changePercent: changePercent(before, after)
      };
    });
  }

  /**
   * What applying the POC would come to — every value it would write, whether each lands as a
   * target/proposal/conflict, and the before/after for every KPI the calculation touches. Nothing
   * is written here, so the caller can show it and the user can still walk away.
   */
  public static async preview(input: ApplyPocImpactInput): Promise<PocImpactPreview> {
    const {
      model, driverKpiId, currentValue, newValue, buId, year, month,
      outcomeModel, evalContext, kpiName
    } = input;

    const base = await this.baseValues(model, buId, year, month);
    const overrides: KpiValues = { [driverKpiId]: newValue };
    const resultBefore = recomputeResult(model, base, {}, evalContext);
    const resultAfter = recomputeResult(model, base, overrides, evalContext);

    const writes: PlannedWrite[] = [];
    const sealed = model.status === 'Sealed';

    writes.push(await this.plan(driverKpiId, kpiName(driverKpiId), newValue, buId, year, month, sealed, 'driver'));

    const resultKpiId = model.resultKind === 'kpi' ? model.resultKpiId : undefined;
    if (resultKpiId && resultKpiId !== driverKpiId) {
      writes.push(await this.plan(
        resultKpiId, model.resultKpiName || kpiName(resultKpiId), resultAfter,
        buId, year, month, sealed, 'result'
      ));
    }

    // Every KPI id the preview needs a type for — collected across both hops, resolved in one read.
    const allIds = new Set<string>(ModelService.componentKpiIds(model));
    if (resultKpiId) allIds.add(resultKpiId);

    let outcomeBefore: number | undefined;
    let outcomeAfter: number | undefined;
    let outcomeKpiId: string | undefined;
    let outcomeBase: KpiValues = {};
    let outcomeOverrides: KpiValues = {};

    // The result is an Output: a second model carries it on to the Outcome it feeds.
    if (outcomeModel && resultKpiId) {
      outcomeBase = await this.baseValues(outcomeModel, buId, year, month);
      outcomeOverrides = { [resultKpiId]: resultAfter };
      outcomeBefore = recomputeResult(outcomeModel, outcomeBase, {}, evalContext);
      outcomeAfter = recomputeResult(outcomeModel, outcomeBase, outcomeOverrides, evalContext);
      outcomeKpiId = outcomeModel.resultKind === 'kpi' ? outcomeModel.resultKpiId : undefined;

      ModelService.componentKpiIds(outcomeModel).forEach(id => allIds.add(id));
      if (outcomeKpiId) {
        allIds.add(outcomeKpiId);
        writes.push(await this.plan(
          outcomeKpiId,
          outcomeModel.resultKpiName || kpiName(outcomeKpiId),
          outcomeAfter,
          buId, year, month,
          outcomeModel.status === 'Sealed',
          'outcome'
        ));
      }
    }

    const kpiTypeById = await this.fetchKpiTypes(Array.from(allIds));

    const kpiImpacts: KpiImpactRow[] = [
      ...this.componentRows(model, base, overrides, driverKpiId, 'component', 'driver', kpiTypeById, kpiName)
    ];
    if (resultKpiId) {
      kpiImpacts.push({
        kpiId: resultKpiId,
        kpiName: model.resultKpiName || kpiName(resultKpiId),
        kpiType: model.resultKind === 'kpi' ? kpiTypeById.get(resultKpiId) : `Org ${model.resultKind === 'output' ? 'Output' : 'Outcome'}`,
        role: 'result',
        before: resultBefore,
        after: resultAfter,
        change: round(resultAfter - resultBefore),
        changePercent: changePercent(resultBefore, resultAfter)
      });
    }
    if (outcomeModel && resultKpiId) {
      kpiImpacts.push(
        ...this.componentRows(outcomeModel, outcomeBase, outcomeOverrides, undefined, 'outcome-component', 'driver', kpiTypeById, kpiName)
      );
      if (outcomeKpiId) {
        kpiImpacts.push({
          kpiId: outcomeKpiId,
          kpiName: outcomeModel.resultKpiName || kpiName(outcomeKpiId),
          kpiType: outcomeModel.resultKind === 'kpi' ? kpiTypeById.get(outcomeKpiId) : `Org ${outcomeModel.resultKind === 'output' ? 'Output' : 'Outcome'}`,
          role: 'outcome-result',
          before: outcomeBefore!,
          after: outcomeAfter!,
          change: round(outcomeAfter! - outcomeBefore!),
          changePercent: changePercent(outcomeBefore!, outcomeAfter!)
        });
      }
    }

    return {
      writes,
      kpiImpacts,
      driverDelta: round(newValue - currentValue),
      resultBefore,
      resultAfter,
      resultKpiId,
      resultKpiName: model.resultKpiName,
      outcomeBefore,
      outcomeAfter,
      outcomeKpiId,
      outcomeKpiName: outcomeModel?.resultKpiName
    };
  }

  /** What one value would turn into, given whether its model is sealed. */
  private static async plan(
    kpiId: string, name: string, value: number,
    buId: string, year: number, month: number,
    sealed: boolean, role: PlannedWrite['role']
  ): Promise<PlannedWrite> {
    const existingTarget = await LedgerService.getMonthValue({ kind: 'kpi', id: kpiId }, buId, year, month, 'target');
    const hasTarget = existingTarget != null && existingTarget !== 0;

    if (sealed && !hasTarget) {
      return { kpiId, kpiName: name, value, existingTarget, outcome: 'target', role };
    }
    if (sealed && hasTarget) {
      // Any difference counts here, not only a lower value: a sealed model disagreeing with an
      // approved target is what the review is for.
      const differs = Math.abs(existingTarget! - value) > 0.001;
      return { kpiId, kpiName: name, value, existingTarget, outcome: differs ? 'conflict' : 'proposal', role };
    }
    return { kpiId, kpiName: name, value, existingTarget, outcome: 'proposal', role };
  }

  /**
   * Apply the impact: write or propose every value in the plan. Does NOT save a POC/Tactic record
   * — that's the caller's own responsibility, using whichever linkage its feature owns.
   */
  public static async applyWrites(input: Pick<ApplyPocImpactInput, 'model' | 'buId' | 'year' | 'month'>, preview: PocImpactPreview): Promise<void> {
    const { model, buId, year, month } = input;

    for (const write of preview.writes) {
      if (write.outcome === 'target') {
        await TargetWriteService.writeTarget(
          { kind: 'kpi', id: write.kpiId }, buId, year, [month], write.value, POC_SOURCE, write.kpiName
        );
        continue;
      }

      const proposalId = await TargetWriteService.writeProposal({
        entityRef: { kind: 'kpi', id: write.kpiId },
        entityName: write.kpiName,
        buId,
        year,
        month,
        value: write.value,
        modelId: model.id,
        source: POC_SOURCE,
        hasConflict: write.outcome === 'conflict'
      });

      if (write.outcome === 'conflict') {
        await ConflictService.raiseConflict({
          entityRef: { kind: 'kpi', id: write.kpiId },
          entityName: write.kpiName,
          buId,
          year,
          month,
          existingValue: write.existingTarget ?? 0,
          proposedValue: write.value,
          proposalId,
          source: POC_SOURCE
        });
      }
    }
  }
}
