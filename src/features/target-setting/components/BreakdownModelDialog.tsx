import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BaseEntity } from '../services/EntityService';
import { FinancialModel, ModelService } from '@infrastructure/financialImpact/ModelService';
import { EvalContext, equationParts, recomputeResult } from '@infrastructure/financialImpact/ModelEvalService';
import { LedgerService } from '@infrastructure/financialImpact/LedgerService';
import { BreakdownService } from '../services/BreakdownService';
import { BreakdownRow, MONTHS, rollUpValues } from '../models/types';
import { SearchableSelect } from '@shared/components/SearchableSelect';
import { EquationDisplay } from '@shared/components/EquationDisplay';
import {
  percentBasis, percentBasisLabel, percentFromValue, valueFromPercent
} from '../utils/componentPercent';

/** One KPI value the fill is about to propose. */
export interface ModelFillProposal {
  kpiId: string;
  kpiName: string;
  value: number;
}

export interface ModelFillResult {
  /** The target each breakdown row takes, keyed by row id — applied to the draft. */
  rowTargets: Record<string, number>;
  /** One proposal per model component, totalled across the rows. */
  componentProposals: ModelFillProposal[];
  /** The breakdown's own KPI, proposed at what the rows now add up to. */
  resultProposal: ModelFillProposal;
  /**
   * Each row's own component values — row id → component KPI id → value.
   *
   * The bottom-up cycle records these as the components' own breakdown rows, mirroring this
   * breakdown's shape under each component's KPI achievement, so the per-row detail survives
   * instead of being flattened into one proposal per component.
   */
  componentRowValues: Record<string, Record<string, number>>;
  modelId: string;
}

interface BreakdownModelDialogProps {
  /** The KPI being broken down — the model's result. */
  kpi: BaseEntity;
  /** The rows of the breakdown being filled. */
  rows: BreakdownRow[];
  /** The dimension those rows split by, for the column heading. */
  dimension: string;
  models: FinancialModel[];
  /** Every KPI, for component names and types. */
  entities: BaseEntity[];
  businessUnitId: string;
  businessUnitLabel: string;
  year: number;
  month: number;
  evalContext: EvalContext;
  /**
   * The bottom-up cycle records what the model works out — the components as their own breakdown
   * rows, the result as the KPI's own figure — instead of proposing it, and nothing is written
   * until Save breakdown. Top-down still writes proposals from here.
   */
  isBottomUp?: boolean;
  saving?: boolean;
  onClose: () => void;
  onApply: (result: ModelFillResult) => void;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The KPI list's entry for an id, matched case-insensitively.
 *
 * Dataverse GUIDs compare case-insensitively but JavaScript strings don't, and a lookup's raw
 * `_value` can come back in a different case than the KPI table's own primary key — which is why
 * ModelService keys its name map lower-cased. An exact compare here would silently lose both the
 * KPI's name and its aggregation type, so a Percentage component would evaluate as a raw value.
 */
const findEntity = (entities: BaseEntity[], id: string): BaseEntity | undefined =>
  entities.find(e => e.id.toLowerCase() === id.toLowerCase());

/** Whether a component id is the KPI being broken down — the same KPI on both sides of the model. */
const isResultKpi = (componentId: string, resultKpiId: string): boolean =>
  componentId.toLowerCase() === resultKpiId.toLowerCase();

const fmt = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * BreakdownModelDialog — building a breakdown row's target on a financial model, as the
 * prototype's fill-from-a-model popup does.
 *
 * Each row of the breakdown gets its own set of component values — what this account, physician or
 * payment type is expected to contribute to each part of the equation — and the model turns those
 * into that row's target. Walk the rows with prev/next; the totals at the bottom are what gets
 * proposed for the component KPIs themselves.
 *
 * Components are seeded from what's already recorded for the month (actual, else baseline), and
 * each one says whether it has a target yet, so it's obvious which of them this is filling in.
 */
export const BreakdownModelDialog: React.FC<BreakdownModelDialogProps> = ({
  kpi, rows, dimension, models, entities, businessUnitId, businessUnitLabel,
  year, month, evalContext, isBottomUp, saving, onClose, onApply
}) => {
  /** Component values per row: rowId → kpiId → value. */
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const [modelId, setModelId] = useState<string>('');
  const [rowIndex, setRowIndex] = useState<number>(0);
  /**
   * Each component's own figures from its KPI achievement record for this business unit, year and
   * month. Baseline is kept apart from actual rather than collapsed into it: the seed wants
   * "actual, else baseline", but the percentage basis wants the baseline specifically.
   */
  const [recorded, setRecorded] = useState<Record<string, {
    actual: number | null;
    baseline: number | null;
    target: number | null;
  }>>({});
  /**
   * What each component is already broken down to for each value of this dimension:
   * componentKpiId → optionId → the figure, the level it was found at, and how many rows made
   * it up. This is the per-trigger answer — whether *this* physician already has something under
   * that component, wherever in its tree — as opposed to the KPI's overall target.
   */
  const [perTrigger, setPerTrigger] = useState<
    Record<string, Record<string, { value: number; level: number; rowCount: number }>>
  >({});
  /**
   * The same per-trigger answer for what each value of the dimension was last *recorded* at —
   * componentKpiId → optionId → the figure and the level it was found at. Read from the component's
   * own breakdown rows (stf_value) by the same lowest-level-wins rule as the target, so a row is
   * seeded from what this service category actually did rather than from the whole KPI's figure.
   * An option with nothing recorded is simply absent.
   */
  const [perTriggerActual, setPerTriggerActual] = useState<
    Record<string, Record<string, { value: number; level: number; rowCount: number }>>
  >({});
  const [loading, setLoading] = useState<boolean>(false);

  /** The models this KPI takes part in — as their result, or as one of their components. */
  const relevantModels = useMemo(
    () => models.filter(m => ModelService.referencedKpiIds(m).includes(kpi.id)),
    [models, kpi]
  );

  useEffect(() => {
    if (relevantModels.some(m => m.id === modelId)) return;
    setModelId(relevantModels[0]?.id ?? '');
  }, [relevantModels, modelId]);

  const model = useMemo(
    () => relevantModels.find(m => m.id === modelId) ?? null,
    [relevantModels, modelId]
  );

  const componentIds = useMemo(
    () => (model ? ModelService.componentKpiIds(model) : []),
    [model]
  );

  /**
   * Whether the KPI being broken down is itself one of the equation's terms — a model that both
   * consumes and produces the same KPI, as in `charge = charge × kpi a × kpi b`.
   *
   * Only then does the percentage column appear and the KPI's own factor row lock: a share "of the
   * KPI being calculated" only means something when that KPI is on both sides of the equation.
   * Every other model keeps the plain, editable value inputs, unchanged.
   */
  const resultIsComponent = useMemo(
    () => componentIds.some(id => isResultKpi(id, kpi.id)),
    [componentIds, kpi.id]
  );

  /**
   * The figure the KPI being broken down contributes as a factor of its own model, and what the
   * other factors' percentages are a share of.
   *
   * Read from that KPI's own achievement record for this business unit, year and month — its
   * baseline, falling back to its actual. Department and function are settled by the KPI itself,
   * which carries both, so the achievement is identified by KPI + BU + year + month alone. One
   * figure for the month, so every row shares it: 10% means the same amount on each.
   */
  /**
   * The figure the KPI being broken down contributes as a factor of its own model, and what the
   * other factors' percentages are a share of.
   *
   * Read from the row being filled — that account's or physician's own breakdown row for this KPI
   * in stf_kpiachievmentbreakdowns: its stf_baseline, falling back to its stf_value. Per row, so
   * 10% is a different amount on each. A row with neither is 0, and the percentage column disables
   * rather than dividing by it.
   */
  const basisFor = useCallback(
    (rowId: string): number => percentBasis(rows.find(r => r.id === rowId) ?? null),
    [rows]
  );

  /**
   * A component's display name.
   *
   * The KPI list answers first. When it can't — a KPI that's been deactivated is no longer in it —
   * the model itself is asked next, since a term or factor records the name the KPI had when the
   * model was built. Only when nothing names it does this fall back to a marker, rather than
   * printing the raw id and leaving a GUID reading as though it were a KPI's name. This is the
   * same chain Top-Down Monthly uses in componentName, so both screens label components alike.
   */
  const kpiName = useCallback((id: string): string => {
    const known = findEntity(entities, id)?.name;
    if (known) return known;
    const fromModel = model?.terms.find(t => t.kpiId === id)?.kpiName
      || model?.factors.find(f => f.kpiId === id)?.kpiName;
    if (fromModel) return fromModel;
    return `Unresolved KPI (…${id.slice(-4)})`;
  }, [entities, model]);

  /** Whether a component resolves to a KPI at all — used to flag the row, not to skip it. */
  const isUnresolved = useCallback(
    (id: string) => !findEntity(entities, id),
    [entities]
  );

  // What each component already stands at this month, and whether it has a target yet.
  useEffect(() => {
    if (!componentIds.length || !businessUnitId) {
      setRecorded({}); setPerTrigger({}); setPerTriggerActual({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      const found: Record<string, {
        actual: number | null; baseline: number | null; target: number | null;
      }> = {};
      const byTrigger: Record<string, Record<string, { value: number; level: number; rowCount: number }>> = {};
      const actualByTrigger: Record<string, Record<string, { value: number; level: number; rowCount: number }>> = {};

      await Promise.all(componentIds.map(async id => {
        const ledger = await LedgerService.getLedger({ kind: 'kpi', id }, businessUnitId, year);
        const entry = ledger.months.find(m => m.month === month);
        found[id] = {
          actual: entry?.actual ?? null,
          baseline: entry?.baseline ?? null,
          target: entry?.target ?? null
        };

        // The component's own breakdown for the month, so a row can say whether this account or
        // physician was already given a figure under it — and what it was last recorded at.
        const anchor = await BreakdownService.getAnchor(id, businessUnitId, year, month);
        if (!anchor.achievementId) return;
        const componentRows = await BreakdownService.getAllRows(anchor.achievementId, id);
        const aggType = findEntity(entities, id)?.aggType;
        // Every value of this dimension the component is already broken down by, at any level.
        const byOption: Record<string, { value: number; level: number; rowCount: number }> = {};
        const actualByOption: Record<string, { value: number; level: number; rowCount: number }> = {};
        new Set(
          componentRows
            .filter(r => r.dimension === dimension && r.optionId)
            .map(r => r.optionId!)
        ).forEach(optionId => {
          const match = BreakdownService.targetForOption(componentRows, dimension, optionId, aggType);
          if (match) byOption[optionId] = match;
          const recordedMatch = BreakdownService.actualForOption(componentRows, dimension, optionId, aggType);
          if (recordedMatch) actualByOption[optionId] = recordedMatch;
        });
        byTrigger[id] = byOption;
        actualByTrigger[id] = actualByOption;
      }));

      if (cancelled) return;
      setRecorded(found);
      setPerTrigger(byTrigger);
      setPerTriggerActual(actualByTrigger);
    };
    run().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [componentIds, businessUnitId, year, month, dimension]);

  /**
   * A row's component values, seeded the first time it's opened from what this row's own value of
   * the dimension was last recorded at — its figure in the component's breakdown, by the
   * lowest-level-wins rule. Rows therefore seed differently from each other, which is the point.
   * A value with nothing recorded under the component falls back to the component's own month
   * figure, so a row is never left seeding from nothing.
   */
  const valuesFor = useCallback((rowId: string): Record<string, number> => {
    const existing = values[rowId];
    const optionId = rows.find(r => r.id === rowId)?.optionId ?? null;
    const seeded: Record<string, number> = {};
    componentIds.forEach(id => {
      // The KPI's own factor row isn't the user's to set: it is what this account or physician
      // already does, and it's the figure the other factors are a percentage of. Read straight from
      // the row every time, ignoring anything in `values` for it, so it can't drift.
      if (resultIsComponent && isResultKpi(id, kpi.id)) {
        seeded[id] = basisFor(rowId);
        return;
      }
      const optionActual = optionId ? perTriggerActual[id]?.[optionId]?.value : undefined;
      seeded[id] = existing?.[id] ?? optionActual ?? recorded[id]?.actual ?? recorded[id]?.baseline ?? 0;
    });
    return seeded;
  }, [values, componentIds, recorded, perTriggerActual, rows, resultIsComponent, kpi.id, basisFor]);

  const row = rows[rowIndex] ?? rows[0];

  const setComponent = (rowId: string, kpiId: string, value: number) => {
    setValues(prev => ({
      ...prev,
      [rowId]: { ...valuesFor(rowId), [kpiId]: value }
    }));
  };

  /**
   * The value and the percentage are two views of one number, so only the value is held in state:
   * the percentage is derived from it on the way out and converted back on the way in. Typing
   * either one therefore updates the other with no second copy to keep in step, and what gets
   * applied is always the value.
   */
  const percentFor = useCallback((rowId: string, kpiId: string): number | null => {
    const percent = percentFromValue(basisFor(rowId), valuesFor(rowId)[kpiId] ?? 0);
    return percent == null ? null : round(percent);
  }, [basisFor, valuesFor]);

  const setPercent = (rowId: string, kpiId: string, percent: number) => {
    const basis = basisFor(rowId);
    if (!basis) return;
    setComponent(rowId, kpiId, round(valueFromPercent(basis, percent)));
  };

  /** What the model makes of one row's component values. */
  const resultFor = useCallback((rowId: string): number => {
    if (!model) return 0;
    return round(recomputeResult(model, valuesFor(rowId), {}, evalContext));
  }, [model, valuesFor, evalContext]);

  /**
   * Every row's result, and what each component comes to across the rows.
   *
   * Each KPI is rolled up its own way: a Value component's rows add up, a Percentage component's
   * average — and the same for the KPI being broken down, so the figure proposed for it matches
   * what the breakdown screen will reconcile against.
   */
  const totals = useMemo(() => {
    const rowTargets: Record<string, number> = {};
    const perComponentValues: Record<string, number[]> = {};
    rows.forEach(r => {
      rowTargets[r.id] = resultFor(r.id);
      const rowValues = valuesFor(r.id);
      componentIds.forEach(id => {
        (perComponentValues[id] ??= []).push(rowValues[id] ?? 0);
      });
    });
    const perComponent: Record<string, number> = {};
    componentIds.forEach(id => {
      perComponent[id] = rollUpValues(
        perComponentValues[id] ?? [], findEntity(entities, id)?.aggType
      );
    });
    const resultTotal = rollUpValues(Object.values(rowTargets), kpi.aggType);
    return { rowTargets, perComponent, resultTotal };
  }, [rows, resultFor, valuesFor, componentIds, entities, kpi.aggType]);

  const apply = () => {
    if (!model) return;
    const componentRowValues: Record<string, Record<string, number>> = {};
    rows.forEach(r => { componentRowValues[r.id] = valuesFor(r.id); });
    onApply({
      rowTargets: totals.rowTargets,
      // The KPI being broken down is left out of the components: when a model names it on both
      // sides, its factor figure is what the row already does, not something this fill decided, and
      // the KPI is recorded once — as the result. Without this it would be saved twice over, the
      // second write overwriting the first with the wrong number.
      componentProposals: componentIds
        .filter(id => !isResultKpi(id, kpi.id))
        .map(id => ({
          kpiId: id,
          kpiName: kpiName(id),
          value: totals.perComponent[id] ?? 0
        })),
      resultProposal: { kpiId: kpi.id, kpiName: kpi.name, value: totals.resultTotal },
      componentRowValues,
      modelId: model.id
    });
  };

  if (!rows.length) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-head">
            <b>Build on a financial model</b>
            <button className="btn btn-xs" onClick={onClose}>close</button>
          </div>
          <div className="modal-body">
            <div className="alert alert-warn">
              Add the {dimension.toLowerCase()} rows first — the model fills a target per row.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <b>Build “{row?.name}” via model — {kpi.name} · {businessUnitLabel}</b>
          {relevantModels.length > 1 && (
            <SearchableSelect
              options={relevantModels.map(m => ({
                value: m.id, label: m.resultKpiName || m.name, hint: m.status || 'Draft'
              }))}
              value={modelId}
              onChange={setModelId}
              placeholder="Select a model…"
            />
          )}
          <button className="btn btn-xs" disabled={saving} onClick={onClose}>close</button>
        </div>

        <div className="modal-body">
          {!model ? (
            <div className="alert alert-warn">
              No financial model has {kpi.name} as its result or as a component. Build one in the
              Financial Modeler first.
            </div>
          ) : (
            <>
              <EquationDisplay parts={equationParts(model)} style={{ marginBottom: '8px' }} />
              <div className="sub" style={{ marginBottom: '6px' }}>
                Row {rowIndex + 1} of {rows.length} — <b>{row?.name}</b> · {MONTHS[month - 1]} {year}
              </div>
              {resultIsComponent && row && (
                basisFor(row.id) ? (
                  <div className="sub" style={{ marginBottom: '6px' }}>
                    {kpi.name} is both a term and the result of this model. Its factor row is fixed at{' '}
                    <b>{fmt(basisFor(row.id))}</b> — {row.name}'s own {percentBasisLabel(row)} on this
                    breakdown — and the other factors are entered as a <b>% of it</b>. Typing a
                    percentage fills the value and typing a value shows the percentage. Only the other
                    factors and {kpi.name} as the result are saved; the factor figure itself is not.
                  </div>
                ) : (
                  <div className="sub warn-text" style={{ marginBottom: '6px' }}>
                    ⚠ {row.name} has no baseline or actual recorded on its {kpi.name} breakdown row,
                    so its factor row is 0 and there is nothing to take a percentage of — enter the
                    other factors' values directly.
                  </div>
                )
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    {resultIsComponent && (
                      <th
                        className="tright"
                        title={`A share of this ${dimension.toLowerCase()}'s own ${kpi.name} — its target if it has one, otherwise its baseline, otherwise its actual`}
                      >
                        % of {kpi.name}
                      </th>
                    )}
                    <th className="tright">Target for this {dimension}</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={resultIsComponent ? 4 : 3} className="muted" style={{ padding: '12px' }}>
                        Loading…
                      </td>
                    </tr>
                  ) : componentIds.map(id => {
                    const info = recorded[id];
                    // Whether this row's own value already carries a figure under the component.
                    const alreadySet = row.optionId ? perTrigger[id]?.[row.optionId] : undefined;
                    // What this row's own value was last recorded at under the component. Absent
                    // when it has no recorded figure, in which case nothing is offered — the
                    // component's KPI-wide actual would not be this value's actual.
                    const lastActual = row.optionId ? perTriggerActual[id]?.[row.optionId] : undefined;
                    // The KPI's own factor row: filled from what this row already does, locked, and
                    // not saved anywhere — the same KPI is recorded once, as the model's result.
                    const isLockedFactor = resultIsComponent && isResultKpi(id, kpi.id);
                    return (
                      <tr key={id}>
                        <td>
                          {kpiName(id)}
                          {isUnresolved(id) && (
                            <div
                              className="sub warn-text"
                              title={`This model term points at ${id}, which matches no KPI in the list — the record is either deactivated or no longer there. Fix the model's term to clear it.`}
                            >
                              ⚠ no KPI matches this model term
                            </div>
                          )}
                        </td>
                        {resultIsComponent && (
                          <td className="tright">
                            {isLockedFactor ? (
                              <span className="muted" title={`This is the figure the other factors' percentages are taken from`}>—</span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                disabled={!basisFor(row.id)}
                                title={basisFor(row.id)
                                  ? `${fmt(basisFor(row.id))} is ${row.name}'s own ${percentBasisLabel(row)} on this ${kpi.name} breakdown — the figure the percentage is taken from`
                                  : `${row.name} has no baseline or actual recorded on its ${kpi.name} breakdown row, so there is nothing to take a percentage of`}
                                value={percentFor(row.id, id) ?? ''}
                                onChange={e => setPercent(row.id, id, parseFloat(e.target.value) || 0)}
                                style={{ width: '72px' }}
                              />
                            )}
                          </td>
                        )}
                        <td className="tright">
                          <input
                            type="number"
                            step="0.01"
                            readOnly={isLockedFactor}
                            title={isLockedFactor
                              ? `${row.name}'s own ${percentBasisLabel(row) ?? 'figure'} on this ${kpi.name} breakdown — not editable, since it's what the other factors are a share of`
                              : undefined}
                            value={round(valuesFor(row.id)[id] ?? 0)}
                            onChange={e => setComponent(row.id, id, parseFloat(e.target.value) || 0)}
                            style={{ width: '96px', ...(isLockedFactor ? { opacity: 0.7 } : {}) }}
                          />
                        </td>
                        <td className="muted" style={{ fontSize: '11px' }}>
                          {alreadySet ? (
                            <span
                              style={{ color: 'var(--success)' }}
                              title={alreadySet.rowCount > 1
                                ? `${alreadySet.rowCount} rows at level ${alreadySet.level} added together`
                                : `Found at level ${alreadySet.level} of this component's breakdown`}
                            >
                              {row.name} already at {fmt(alreadySet.value)}
                              {' '}(level {alreadySet.level}
                              {alreadySet.rowCount > 1 ? `, ${alreadySet.rowCount} rows summed` : ''})
                            </span>
                          ) : info?.target != null ? (
                            <span title={`No ${dimension.toLowerCase()}-level figure for ${row.name}; this is the KPI's overall target`}>
                              KPI target {fmt(info.target)} · nothing for this {dimension.toLowerCase()}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--danger)' }}>no target</span>
                          )}
                          {lastActual && !isLockedFactor && (
                            <>
                              {' · '}
                              <button
                                className="btn btn-xs"
                                title={lastActual.rowCount > 1
                                  ? `${row.name}'s recorded figure: ${lastActual.rowCount} rows at level ${lastActual.level} of this component's breakdown, rolled up`
                                  : `${row.name}'s recorded figure, found at level ${lastActual.level} of this component's breakdown`}
                                onClick={() => setComponent(row.id, id, lastActual.value)}
                              >
                                use last actual {fmt(lastActual.value)} (level {lastActual.level}
                                {lastActual.rowCount > 1 ? `, ${lastActual.rowCount} rows` : ''})
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="resultbox" style={{ marginTop: '10px' }}>
                <div>
                  <div className="sub">Resulting {kpi.name} for {row?.name}</div>
                  <div className="stat">{fmt(totals.rowTargets[row.id])}</div>
                </div>
                <div className="resultset">
                  <button
                    className="btn btn-sm"
                    disabled={rowIndex <= 0}
                    onClick={() => setRowIndex(i => Math.max(0, i - 1))}
                  >
                    ← prev
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={rowIndex >= rows.length - 1}
                    onClick={() => setRowIndex(i => Math.min(rows.length - 1, i + 1))}
                  >
                    next →
                  </button>
                </div>
              </div>

              <div className="section-label" style={{ marginTop: '12px' }}>
                What this proposes — every row {kpi.aggType === 'Percentage' ? 'averaged' : 'totalled'}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>KPI</th>
                    <th className="tright">Approved</th>
                    <th className="tright">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {componentIds.map(id => {
                    const isLockedFactor = resultIsComponent && isResultKpi(id, kpi.id);
                    return (
                      <tr key={`total-${id}`}>
                        <td>
                          {kpiName(id)}{' '}
                          <span className="muted">({isLockedFactor ? 'factor' : 'component'})</span>
                          {isLockedFactor && (
                            <div className="sub">
                              feeds the equation from what each {dimension.toLowerCase()} already
                              does — {kpi.name} is recorded once, as the result below
                            </div>
                          )}
                          {!isLockedFactor && Object.keys(perTrigger[id] ?? {}).length > 0 && (
                            <div className="sub">
                              already broken down by {dimension.toLowerCase()} for{' '}
                              {Object.keys(perTrigger[id]).length} value(s)
                            </div>
                          )}
                        </td>
                        <td className="tright mono muted">{fmt(recorded[id]?.target)}</td>
                        <td className="tright mono">
                          {fmt(totals.perComponent[id])}
                          {isLockedFactor && <div className="sub muted">not saved</div>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="row-total">
                    <td>{kpi.name} <span className="muted">(result)</span></td>
                    <td></td>
                    <td className="tright mono">{fmt(totals.resultTotal)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="sub" style={{ marginTop: '10px' }}>
                {isBottomUp ? (
                  <>
                    Each row's target is filled from the model. Every component value below becomes
                    that component's own breakdown row — under the same {dimension.toLowerCase()},
                    at the same level as this breakdown — and {kpi.name} takes what its rows add up
                    to as its own figure. Nothing is written until <b>Save breakdown</b>.
                  </>
                ) : (
                  <>
                    Each row's target is filled from the model. The component totals and the
                    resulting {kpi.name} are saved as proposals — anything that disagrees with an
                    approved target is confirmed first and recorded as a conflict.
                  </>
                )}
              </div>

              <div className="btn-row" style={{ marginTop: '14px', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" disabled={saving} onClick={onClose}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={apply}>
                  {saving ? 'Saving…' : isBottomUp ? 'Fill rows' : 'Fill rows & save proposals'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
