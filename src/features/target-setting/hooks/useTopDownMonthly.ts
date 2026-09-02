import { useState, useEffect, useMemo } from 'react';
import { BaseEntity, EntityService } from '../services/EntityService';
import { FinancialModel, ModelService } from '@infrastructure/financialImpact/ModelService';
import { EvalContext, KpiValues, recomputeResult } from '@infrastructure/financialImpact/ModelEvalService';
import { ContributionService } from '../services/ContributionService';
import { ConflictRecord, ConflictService } from '@infrastructure/financialImpact/ConflictService';
import { LedgerService } from '@infrastructure/financialImpact/LedgerService';
import { RollUpRow, RollUpService } from '../services/RollUpService';
import { TargetWriteService } from '@infrastructure/financialImpact/TargetWriteService';
import { CONFLICT_TYPE_BY_SOURCE } from '@infrastructure/financialImpact/TargetSource';
import {
  ConflictDetectionService, DetectedConflict, PlannedProposal
} from '../services/ConflictDetectionService';
import { PendingConflict } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';
import { WorkingDaysService } from '../services/WorkingDaysService';
import { DeptFunctionService } from '../services/DeptFunctionService';
import {
  percentBasis, percentBasisLabel, percentFromValue, valueFromPercent
} from '../utils/componentPercent';
import { ContributionLink, EntityRef, MONTHS } from '../models/types';

/** An entity a value can be proposed against, carrying the name shown next to it in the UI. */
type NamedEntity = EntityRef & { name: string };

export const useTopDownMonthly = (initialBuId: string, initialYear: number) => {
  const [businessUnitId, setBusinessUnitId] = useState<string>(initialBuId);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [functionId, setFunctionId] = useState<string>('');
  const [year, setYear] = useState<number>(initialYear);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);

  /** Org Outcomes and Org Outputs — no department/function of their own, so never scoped. */
  const [orgEntities, setOrgEntities] = useState<BaseEntity[]>([]);
  /**
   * Every KPI, unscoped. Only used to evaluate a model — a component KPI can sit outside the
   * selected department/function and still needs its Percentage flag and name, so this must not
   * be narrowed to what the picker is showing.
   */
  const [allKpis, setAllKpis] = useState<BaseEntity[]>([]);
  /** The KPIs the picker offers: strategy_kpises for the selected Department + Function. */
  const [scopedKpis, setScopedKpis] = useState<BaseEntity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<BaseEntity | null>(null);
  const [models, setModels] = useState<FinancialModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // Component values: the model's own base (actual/baseline) vs the user's "New" overrides,
  // plus each component's existing target for the month as a read-only reference.
  const [baseValues, setBaseValues] = useState<KpiValues>({});
  const [testValues, setTestValues] = useState<KpiValues>({});
  const [componentTargets, setComponentTargets] = useState<Record<string, number | null>>({});
  /** Whether each component has a pm_kpiachievments row for the month at all. */
  const [componentRecorded, setComponentRecorded] = useState<Record<string, boolean>>({});
  /**
   * Each component's other recorded figures for the month — baseline, historical and actual —
   * shown beside its target so the number being proposed can be judged against what the KPI has
   * actually been doing.
   */
  const [componentFigures, setComponentFigures] = useState<Record<string, {
    baseline: number | null; historical: number | null; actual: number | null;
  }>>({});
  const [resultOverride, setResultOverride] = useState<number | null>(null);
  const [workingDays, setWorkingDays] = useState<number | null>(null);

  // Auto-calc for Org Output/Outcome: the plain sum of its contributing department KPI targets.
  const [contributingKpis, setContributingKpis] = useState<ContributionLink[]>([]);
  const [contributingTargets, setContributingTargets] = useState<Record<string, number | null>>({});
  const [orgCalcDraft, setOrgCalcDraft] = useState<number | null>(null);
  const [existingEntityTarget, setExistingEntityTarget] = useState<number | null>(null);
  /**
   * The selected entity's pm_kpiachievments row for the chosen BU / year / month — null until an
   * entity is picked, and `hasRecord: false` when the BU has nothing recorded for it that month.
   */
  const [selectedEntityFigures, setSelectedEntityFigures] = useState<{
    hasRecord: boolean;
    actual: number | null;
    baseline: number | null;
    historical: number | null;
    target: number | null;
  } | null>(null);

  // Conflicts already on record for the month, for the selected entity and for the model's
  // result entity, plus a counter to re-read them after a save raises a new one.
  const [entityConflicts, setEntityConflicts] = useState<ConflictRecord[]>([]);
  const [resultConflicts, setResultConflicts] = useState<ConflictRecord[]>([]);
  const [resultExistingTarget, setResultExistingTarget] = useState<number | null>(null);
  const [conflictReloads, setConflictReloads] = useState<number>(0);

  /**
   * A save the user still has to accept: the conflicts it would put on record, and the work to
   * run once they do. Nothing is written while this is set.
   */
  const [pendingSave, setPendingSave] = useState<{
    conflicts: PendingConflict[];
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  const [rollUpRows, setRollUpRows] = useState<RollUpRow[]>([]);
  const [rollUpLoading, setRollUpLoading] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Base data: every Org Outcome, Org Output and KPI, plus every active model. Nothing here is
  // scoped by the BU/Department/Function selectors or by model status — those only decide which
  // KPIs the picker offers and which achievement values are read once an entity is picked.
  useEffect(() => {
    const fetchBaseData = async () => {
      setLoading(true);
      try {
        const [outcomes, outputs, kpis, allModels] = await Promise.all([
          EntityService.getOrgOutcomes(),
          EntityService.getOrgOutputs(),
          EntityService.getKpis(),
          ModelService.getAllModels()
        ]);
        setOrgEntities([...outcomes, ...outputs]);
        setAllKpis(kpis);
        setModels(allModels);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch base data');
      } finally {
        setLoading(false);
      }
    };
    fetchBaseData();
  }, []);

  /** A Department and a Function are both needed before any KPI is offered. */
  const kpiScopeReady = !!departmentId && !!functionId;

  // Step one of the cycle: the KPIs the picker offers come from strategy_kpises alone, narrowed to
  // the selected Department and Function. The business unit plays no part here — it only comes in
  // once a KPI is picked, to read that KPI's pm_kpiachievments row.
  useEffect(() => {
    if (!kpiScopeReady) { setScopedKpis([]); return; }
    let cancelled = false;
    EntityService.getKpis(undefined, departmentId, functionId)
      .then(kpis => { if (!cancelled) setScopedKpis(kpis); })
      .catch((err: any) => {
        if (cancelled) return;
        setScopedKpis([]);
        setError(err.message || 'Failed to fetch KPIs');
      });
    return () => { cancelled = true; };
  }, [kpiScopeReady, departmentId, functionId]);

  /** What the picker lists — org entities always, KPIs only once scoped. */
  const entities = useMemo(() => [...orgEntities, ...scopedKpis], [orgEntities, scopedKpis]);

  // Drop a selection the scope no longer offers rather than leave it pointing at a hidden entity.
  useEffect(() => {
    setSelectedEntity(prev => (prev && entities.some(e => e.id === prev.id)) ? prev : null);
  }, [entities]);

  // Which department KPIs contribute to the selected Org Output/Outcome, and their targets.
  useEffect(() => {
    if (!selectedEntity || (selectedEntity.kind !== 'output' && selectedEntity.kind !== 'outcome') || !businessUnitId) {
      setContributingKpis([]);
      setContributingTargets({});
      return;
    }
    let cancelled = false;
    const run = async () => {
      const links = selectedEntity.kind === 'output'
        ? await ContributionService.getContributingKpisForOutput(selectedEntity.id, businessUnitId)
        : await ContributionService.getContributingKpisForOutcome(selectedEntity.id, businessUnitId);
      if (cancelled) return;
      setContributingKpis(links);
      const targets: Record<string, number | null> = {};
      await Promise.all(links.map(async link => {
        targets[link.sourceKpiId] = await LedgerService.getMonthValue(
          { kind: 'kpi', id: link.sourceKpiId }, businessUnitId, year, month, 'target'
        );
      }));
      if (!cancelled) setContributingTargets(targets);
    };
    run();
    return () => { cancelled = true; };
  }, [selectedEntity, businessUnitId, year, month]);

  // Only models the selected entity appears in — as the model's result, or as a KPI recorded
  // against it in pm_modelterms / pm_relationfactors. For an Org Output/Outcome, a model also
  // counts when its result KPI contributes to that org entity.
  const availableModels = useMemo(() => {
    if (!selectedEntity) return [];
    const contributorIds = new Set(contributingKpis.map(c => c.sourceKpiId));
    return models.filter(m => {
      if (ModelService.referencedKpiIds(m).includes(selectedEntity.id)) return true;
      if (selectedEntity.kind === 'kpi') return false;
      return !!m.resultKpiId && contributorIds.has(m.resultKpiId);
    });
  }, [models, selectedEntity, contributingKpis]);

  // Keep the picker on a valid model — fall back to the first available one.
  useEffect(() => {
    if (availableModels.some(m => m.id === selectedModelId)) return;
    setSelectedModelId(availableModels[0]?.id ?? '');
  }, [availableModels, selectedModelId]);

  const selectedModel = useMemo(
    () => availableModels.find(m => m.id === selectedModelId) ?? null,
    [availableModels, selectedModelId]
  );

  // Percentage KPIs are stored 0-100 but behave as fractions inside an equation. Read from the
  // unscoped KPI list — a model component outside the selected department/function still has to
  // evaluate as a percentage.
  const evalContext: EvalContext = useMemo(() => ({
    percentageKpiIds: new Set(allKpis.filter(e => e.aggType === 'Percentage').map(e => e.id)),
    workingDays
  }), [allKpis, workingDays]);

  // The month's working days — only models with useWorkingDays multiply by it.
  useEffect(() => {
    if (!businessUnitId) { setWorkingDays(null); return; }
    let cancelled = false;
    WorkingDaysService.getAllWorkingDays()
      .then(records => {
        if (cancelled) return;
        const rec = records.find(r => r.businessUnitId === businessUnitId && r.year === year && r.month === month);
        setWorkingDays(rec ? rec.totalWorkingDays : null);
      })
      .catch(() => { if (!cancelled) setWorkingDays(null); });
    return () => { cancelled = true; };
  }, [businessUnitId, year, month]);

  // Each component's base value (actual, else baseline, else 1 so a product isn't zeroed out) and
  // its existing target for the month — pm_target on the component's pm_kpiachievments row for
  // this BU/year/month. Whether that row exists at all is tracked separately, so a blank target
  // can be told apart from a KPI with nothing recorded for the month.
  useEffect(() => {
    if (!selectedModel || !businessUnitId) {
      setBaseValues({}); setComponentTargets({}); setComponentRecorded({});
      setComponentFigures({}); setTestValues({});
      return;
    }
    let cancelled = false;
    const componentIds = ModelService.componentKpiIds(selectedModel);
    const run = async () => {
      const bases: KpiValues = {};
      const targets: Record<string, number | null> = {};
      const recorded: Record<string, boolean> = {};
      const figures: Record<string, { baseline: number | null; historical: number | null; actual: number | null }> = {};
      await Promise.all(componentIds.map(async kpiId => {
        const ledger = await LedgerService.getLedger({ kind: 'kpi', id: kpiId }, businessUnitId, year);
        const entry = ledger.months.find(m => m.month === month);
        bases[kpiId] = entry?.actual ?? entry?.baseline ?? 1;
        targets[kpiId] = entry?.target ?? null;
        recorded[kpiId] = !!entry?.hasRecord;
        figures[kpiId] = {
          baseline: entry?.baseline ?? null,
          historical: entry?.historical ?? null,
          actual: entry?.actual ?? null
        };
      }));
      if (cancelled) return;
      setBaseValues(bases);
      setComponentTargets(targets);
      setComponentRecorded(recorded);
      setComponentFigures(figures);
      setTestValues({});
      setResultOverride(null);
    };
    run();
    return () => { cancelled = true; };
  }, [selectedModel, businessUnitId, year, month]);

  /** A component KPI's display name, for the proposals saved against it. */
  const componentName = (kpiId: string): string =>
    allKpis.find(e => e.id === kpiId)?.name
    || selectedModel?.terms.find(t => t.kpiId === kpiId)?.kpiName
    || selectedModel?.factors.find(f => f.kpiId === kpiId)?.kpiName
    || kpiId;

  /**
   * The component that *is* the model's result — a model naming the same KPI on both sides, as in
   * `charge = charge × kpi a × kpi b`. Null for every other model, which is what keeps their
   * behaviour here unchanged.
   *
   * Returned as the component id actually used in the model, not the result's, so everything keyed
   * by component id lines up even when the two lookups come back in different letter case.
   */
  const lockedFactorId = useMemo(() => {
    const resultKpiId = selectedModel?.resultKpiId;
    if (!selectedModel || !resultKpiId) return null;
    return ModelService.componentKpiIds(selectedModel)
      .find(id => id.toLowerCase() === resultKpiId.toLowerCase()) ?? null;
  }, [selectedModel]);

  /**
   * What that factor is fixed at: the KPI's own baseline for the month, falling back to its actual,
   * off its achievement record for this business unit — the Baseline and Actual already shown
   * against it in the component table. Not the user's to set, and it's what the other factors'
   * percentages are a share of.
   *
   * The achievement's target is deliberately not used: the target is what this screen is deciding,
   * so taking a share of it would feed the result back into its own inputs.
   */
  const factorBasis = useMemo(
    () => (lockedFactorId ? percentBasis(componentFigures[lockedFactorId] ?? null) : 0),
    [lockedFactorId, componentFigures]
  );
  const factorBasisLabel = useMemo(
    () => (lockedFactorId ? percentBasisLabel(componentFigures[lockedFactorId] ?? null) : null),
    [lockedFactorId, componentFigures]
  );

  /**
   * The values the model is evaluated with. Identical to testValues except that the KPI's own
   * factor is pinned to its recorded figure, so the equation uses what the KPI actually does rather
   * than anything typed against it.
   */
  const effectiveTestValues = useMemo<KpiValues>(
    () => (lockedFactorId ? { ...testValues, [lockedFactorId]: factorBasis } : testValues),
    [testValues, lockedFactorId, factorBasis]
  );

  /** What a component is currently set to — the pinned factor, or its own new/base value. */
  const componentValue = (kpiId: string): number => (
    kpiId === lockedFactorId ? factorBasis : (testValues[kpiId] ?? baseValues[kpiId] ?? 0)
  );

  /** A component's value as a share of the pinned factor, and the reverse. Only the value is held
   * in state, so typing either one leaves the other agreeing. */
  const componentPercent = (kpiId: string): number | null => {
    const percent = percentFromValue(factorBasis, componentValue(kpiId));
    return percent == null ? null : Math.round(percent * 100) / 100;
  };
  const setComponentPercent = (kpiId: string, percent: number) => {
    if (!factorBasis) return;
    const value = Math.round(valueFromPercent(factorBasis, percent) * 100) / 100;
    setTestValues(prev => ({ ...prev, [kpiId]: value }));
  };

  /** The model's result for the current component values. */
  const computedResult = useMemo(() => {
    if (!selectedModel) return 0;
    return recomputeResult(selectedModel, baseValues, effectiveTestValues, evalContext);
  }, [selectedModel, baseValues, effectiveTestValues, evalContext]);

  /**
   * What the result would be with nothing changed — the reference for isolated effects. The pinned
   * factor counts as unchanged, so it is held at its recorded figure here too; otherwise every
   * component's effect would be measured against a result the equation never actually produces.
   */
  const pinnedFactor = useMemo<KpiValues>(
    () => (lockedFactorId ? { [lockedFactorId]: factorBasis } : {}),
    [lockedFactorId, factorBasis]
  );

  const unchangedResult = useMemo(() => {
    if (!selectedModel) return 0;
    return recomputeResult(selectedModel, baseValues, pinnedFactor, evalContext);
  }, [selectedModel, baseValues, pinnedFactor, evalContext]);

  /**
   * Effect on the result if ONLY this component moved to its new value. The pinned factor has no
   * "new value" of its own to move to, so it never reports an effect.
   */
  const isolatedEffect = (kpiId: string): number => {
    if (!selectedModel || kpiId === lockedFactorId || testValues[kpiId] == null) return 0;
    const moved = { ...pinnedFactor, [kpiId]: testValues[kpiId] };
    return recomputeResult(selectedModel, baseValues, moved, evalContext) - unchangedResult;
  };

  // Relation models derive their result purely from the factors, so it can't be set directly.
  const finalResult = (selectedModel?.kind === 'Relation' ? null : resultOverride) ?? computedResult;

  // Suggested org target — a plain sum of contributing KPI targets, averaged for Percentage
  // entities (weights describe the roll-up, not this sum).
  const suggestedOrgTarget = useMemo(() => {
    const values = contributingKpis.map(link => contributingTargets[link.sourceKpiId] ?? 0);
    if (!values.length) return 0;
    const total = values.reduce((a, b) => a + b, 0);
    const agg = selectedEntity?.aggType === 'Percentage' ? total / values.length : total;
    return Math.round(agg * 100) / 100;
  }, [contributingKpis, contributingTargets, selectedEntity]);

  useEffect(() => { setOrgCalcDraft(null); }, [selectedEntity?.id, businessUnitId, year, month]);

  // Step two of the cycle: with a KPI picked, read its pm_kpiachievments row for the selected
  // business unit, year and month — whether the KPI has anything recorded there at all, and the
  // figures on it, including the target the rest of the screen compares against.
  useEffect(() => {
    if (!selectedEntity || !businessUnitId) {
      setExistingEntityTarget(null);
      setSelectedEntityFigures(null);
      return;
    }
    let cancelled = false;
    LedgerService.getLedger({ kind: selectedEntity.kind, id: selectedEntity.id }, businessUnitId, year)
      .then(ledger => {
        if (cancelled) return;
        const entry = ledger.months.find(m => m.month === month);
        setExistingEntityTarget(entry?.target ?? null);
        setSelectedEntityFigures({
          hasRecord: !!entry?.hasRecord,
          actual: entry?.actual ?? null,
          baseline: entry?.baseline ?? null,
          historical: entry?.historical ?? null,
          target: entry?.target ?? null
        });
      })
      .catch(() => {
        if (cancelled) return;
        setExistingEntityTarget(null);
        setSelectedEntityFigures(null);
      });
    return () => { cancelled = true; };
  }, [selectedEntity, businessUnitId, year, month]);

  /**
   * The entity a model's result is proposed against. It follows the model, not the picker, so a
   * model whose result is an Org Output is proposed against that Output even while a contributing
   * KPI is selected.
   */
  const resultEntity = useMemo<NamedEntity | null>(() => {
    if (!selectedModel?.resultKpiId) return null;
    return {
      kind: selectedModel.resultKind,
      id: selectedModel.resultKpiId,
      name: selectedModel.resultKpiName || selectedModel.name
    };
  }, [selectedModel]);

  // Conflicts already recorded for this month — so an entity that went to review in an earlier
  // session is still flagged — plus the result entity's own approved target.
  useEffect(() => {
    if (!businessUnitId) {
      setEntityConflicts([]); setResultConflicts([]); setResultExistingTarget(null);
      return;
    }
    let cancelled = false;
    const entityRef = selectedEntity ? { kind: selectedEntity.kind, id: selectedEntity.id } : null;

    const load = async () => {
      const [forEntity, forResult, resultTarget] = await Promise.all([
        entityRef ? ConflictService.getConflicts(entityRef, businessUnitId, year, month) : [],
        resultEntity ? ConflictService.getConflicts(resultEntity, businessUnitId, year, month) : [],
        resultEntity
          ? LedgerService.getMonthValue(resultEntity, businessUnitId, year, month, 'target')
          : null
      ]);
      if (cancelled) return;
      setEntityConflicts(forEntity);
      setResultConflicts(forResult);
      setResultExistingTarget(resultTarget);
    };
    load().catch(() => {
      if (cancelled) return;
      setEntityConflicts([]); setResultConflicts([]); setResultExistingTarget(null);
    });
    return () => { cancelled = true; };
  }, [selectedEntity, resultEntity, businessUnitId, year, month, conflictReloads]);

  /** The value the org auto-calc box would confirm as the target. */
  const orgTargetToConfirm = orgCalcDraft ?? suggestedOrgTarget;

  /**
   * Whether saving right now would raise a conflict — the same rule the write path applies: an
   * approved target already exists and is higher than what would be saved.
   */
  const resultWouldConflict = resultExistingTarget != null && resultExistingTarget > finalResult;
  const orgTargetWouldConflict = existingEntityTarget != null && existingEntityTarget > orgTargetToConfirm;

  // The impact section follows the selected entity: a KPI may contribute to Outputs/Outcomes;
  // an Output may affect Outcomes; an Outcome is the top level and has no onward link.
  useEffect(() => {
    if (!selectedEntity || !businessUnitId || selectedEntity.kind === 'outcome') {
      setRollUpRows([]);
      return;
    }
    let cancelled = false;
    setRollUpLoading(true);
    const request = selectedEntity.kind === 'kpi'
      ? RollUpService.getRollUpForKpi(
        selectedEntity.id,
        selectedEntity.name,
        businessUnitId,
        year,
        finalResult
      )
      : RollUpService.getRollUpForOutput(
        selectedEntity.id,
        selectedEntity.name,
        businessUnitId,
        year
      );
    request
      .then(rows => { if (!cancelled) setRollUpRows(rows); })
      .catch(() => { if (!cancelled) setRollUpRows([]); })
      .finally(() => { if (!cancelled) setRollUpLoading(false); });
    return () => { cancelled = true; };
  }, [selectedEntity, businessUnitId, year, finalResult]);

  /**
   * Commit the (possibly edited) contributor sum as the selected Output/Outcome's target. A month
   * that already has an approved target can't be overwritten — it goes in as a proposal, and as a
   * conflict too when the confirmed value is lower than that target, which the user has to accept
   * first.
   */
  const runOrgTargetSave = async () => {
    if (!selectedEntity || !businessUnitId) return;
    setSaving(true);
    try {
      const value = orgTargetToConfirm;
      const proposed = await TargetWriteService.writeTarget(
        { kind: selectedEntity.kind, id: selectedEntity.id },
        businessUnitId, year, [month], value, 'Top Down Monthly', selectedEntity.name
      );
      const conflicted = proposed.some(p => p.outcome.conflictRaised);
      setConflictReloads(n => n + 1);
      if (proposed.length === 0) setExistingEntityTarget(value);
      alert(proposed.length === 0
        ? `Target confirmed for ${selectedEntity.name}.`
        : conflicted
          ? `${selectedEntity.name} already has an approved target for ${MONTHS[month - 1]} (${existingEntityTarget}), so ${value} was saved as a proposal and a conflict was raised.`
          : `${selectedEntity.name} already has an approved target for ${MONTHS[month - 1]}, so ${value} was saved as a proposal for review.`);
    } catch (err: any) {
      alert(`Error confirming target: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmOrgTarget = () => {
    if (!selectedEntity || !businessUnitId) return;
    if (!orgTargetWouldConflict) return runOrgTargetSave();
    setPendingSave({
      confirmLabel: 'Save as proposal',
      run: runOrgTargetSave,
      conflicts: [{
        entityName: selectedEntity.name,
        conflictType: CONFLICT_TYPE_BY_SOURCE['Top Down Monthly'],
        existingValue: existingEntityTarget,
        proposedValue: orgTargetToConfirm,
        reason: `${MONTHS[month - 1]} ${year} is already approved at ${existingEntityTarget}, which is higher than the ${orgTargetToConfirm} being confirmed.`
      }]
    });
  };

  /**
   * Save the month on the model: a proposal for every component the user set, and one for the
   * result the model resolves to. Targets are never written directly from here — a result under
   * an approved target is flagged and raised as a conflict once the user accepts it.
   */
  /**
   * Every value the model save proposes: each component the user set, then the result.
   *
   * A model naming its own result as a factor contributes that KPI once, as the result. Its factor
   * figure is what the KPI already does rather than anything this screen decided, and proposing
   * both would write the same KPI twice over — the second write landing the factor figure on top
   * of the result.
   */
  const proposableComponentIds = (): string[] => (
    selectedModel
      ? ModelService.componentKpiIds(selectedModel).filter(id => id !== lockedFactorId)
      : []
  );

  const plannedModelProposals = () => {
    if (!selectedModel || !resultEntity) return [];
    const planned: PlannedProposal[] = proposableComponentIds()
      .filter(kpiId => (testValues[kpiId] ?? baseValues[kpiId]) != null)
      .map(kpiId => ({
        entityRef: { kind: 'kpi' as const, id: kpiId },
        entityName: componentName(kpiId),
        value: testValues[kpiId] ?? baseValues[kpiId],
        month
      }));
    planned.push({
      entityRef: { kind: resultEntity.kind, id: resultEntity.id },
      entityName: resultEntity.name,
      value: finalResult,
      month
    });
    return planned;
  };

  const runModelResultSave = async (conflicts: DetectedConflict[] = []) => {
    if (!selectedModel || !resultEntity || !businessUnitId) return;
    setSaving(true);
    try {
      // Each component is judged against its own approved target, so a proposal is only
      // flagged when that KPI itself disagrees.
      const conflictedIds = new Set(conflicts.map(c => c.entityRef.id));
      for (const kpiId of proposableComponentIds()) {
        const value = testValues[kpiId] ?? baseValues[kpiId];
        if (value == null) continue;
        const proposalId = await TargetWriteService.writeProposal({
          entityRef: { kind: 'kpi', id: kpiId },
          entityName: componentName(kpiId),
          buId: businessUnitId,
          year,
          month,
          value,
          modelId: selectedModel.id,
          source: 'Top Down Monthly',
          hasConflict: conflictedIds.has(kpiId),
          deptFunction: await DeptFunctionService.labelFor(kpiId)
        });
        const conflict = conflicts.find(c => c.entityRef.id === kpiId);
        if (conflict) {
          await ConflictService.raiseConflict({
            entityRef: conflict.entityRef,
            entityName: conflict.entityName,
            buId: businessUnitId,
            year,
            month,
            existingValue: conflict.existingTarget,
            proposedValue: conflict.value,
            proposalId,
            source: 'Top Down Monthly'
          });
        }
      }

      const { conflictRaised, existingTarget } = await TargetWriteService.writeProposalWithConflict(
        { kind: resultEntity.kind, id: resultEntity.id },
        resultEntity.name,
        businessUnitId,
        year,
        month,
        finalResult,
        'Top Down Monthly',
        selectedModel.id,
        resultEntity.kind === 'kpi' ? await DeptFunctionService.labelFor(resultEntity.id) : undefined
      );
      // Re-read so the conflict chip appears next to the result without a reload.
      setConflictReloads(n => n + 1);
      alert(conflictRaised
        ? `Proposals saved for ${resultEntity.name} and its components, and a conflict was raised: the existing target (${existingTarget}) is higher than the proposed ${finalResult}.`
        : `Proposals saved for ${resultEntity.name} and its components.`);
    } catch (err: any) {
      alert(`Error saving proposal: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Check every value the save would propose — each component and the result — and let the user
   * see what goes on record before any of it is written.
   */
  const saveModelResult = async () => {
    if (!selectedModel || !resultEntity || !businessUnitId) return;
    const conflicts = await ConflictDetectionService.detect(plannedModelProposals(), {
      buId: businessUnitId,
      year,
      source: 'Top Down Monthly'
    });
    if (!conflicts.length) { runModelResultSave(); return; }
    setPendingSave({
      confirmLabel: 'Save proposals anyway',
      run: () => runModelResultSave(conflicts),
      conflicts
    });
  };

  /** Run the save the user just accepted, then close the dialog. */
  const confirmPendingSave = async () => {
    const pending = pendingSave;
    if (!pending) return;
    await pending.run();
    setPendingSave(null);
  };

  const cancelPendingSave = () => setPendingSave(null);

  return {
    businessUnitId, setBusinessUnitId,
    departmentId, setDepartmentId,
    functionId, setFunctionId,
    year, setYear,
    month, setMonth,
    entities,
    kpiScopeReady,
    selectedEntity, setSelectedEntity,
    availableModels,
    selectedModel, selectedModelId, setSelectedModelId,
    baseValues, testValues, setTestValues,
    lockedFactorId, factorBasis, factorBasisLabel,
    componentValue, componentPercent, setComponentPercent,
    componentTargets, componentRecorded, componentFigures, isolatedEffect,
    resultOverride, setResultOverride,
    computedResult, finalResult,
    workingDays,
    contributingKpis, contributingTargets, suggestedOrgTarget,
    orgCalcDraft, setOrgCalcDraft, orgTargetToConfirm,
    existingEntityTarget, selectedEntityFigures,
    resultEntity, resultExistingTarget,
    entityConflicts, resultConflicts,
    resultWouldConflict, orgTargetWouldConflict,
    rollUpRows, rollUpLoading,
    confirmOrgTarget, saveModelResult,
    pendingSave, confirmPendingSave, cancelPendingSave,
    loading, saving, error
  };
};
