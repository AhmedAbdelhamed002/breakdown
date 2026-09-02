import { useState, useEffect, useMemo, useCallback } from 'react';
import { BaseEntity, EntityService } from '../services/EntityService';
import { FinancialModel, ModelService } from '@infrastructure/financialImpact/ModelService';
import { EvalContext, KpiValues, recomputeResult, equationString } from '@infrastructure/financialImpact/ModelEvalService';
import { ConflictRecord, ConflictService } from '@infrastructure/financialImpact/ConflictService';
import { ConstraintViolation, KpiConstraint, KpiConstraintService } from '../services/KpiConstraintService';
import { LedgerService } from '@infrastructure/financialImpact/LedgerService';
import { RollUpRow, RollUpService } from '../services/RollUpService';
import { TargetWriteService } from '@infrastructure/financialImpact/TargetWriteService';
import { CONFLICT_TYPE_BY_SOURCE } from '@infrastructure/financialImpact/TargetSource';
import {
  ConflictDetectionService, DetectedConflict, PlannedProposal
} from '../services/ConflictDetectionService';
import { PendingConflict } from '@shared/components/ConflictConfirmDialog/ConflictConfirmDialog';
import { WorkingDaysService } from '../services/WorkingDaysService';
import { SummaryService } from '../services/SummaryService';
import { kpiTypeRank } from '../models/types';

/**
 * useBottomUp — the function manager's path, as the prototype has it: pick one of your function's
 * KPIs and a model it takes part in, propose a target for each component, and see what the model
 * makes of them.
 *
 * Nothing here writes a target. Every component goes in as a proposal against the model; if the
 * KPI already has an approved target and the model's result comes in under it, the proposals are
 * flagged and a conflict is raised for review.
 */
export function useBottomUp(initialBuId: string, initialYear: number) {
  const [businessUnitId, setBusinessUnitId] = useState<string>(initialBuId);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [functionId, setFunctionId] = useState<string>('');
  const [year, setYear] = useState<number>(initialYear);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);

  const [allKpis, setAllKpis] = useState<BaseEntity[]>([]);
  const [models, setModels] = useState<FinancialModel[]>([]);
  const [selectedKpiId, setSelectedKpiId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  /** Proposed target per component, seeded from each component's baseline. */
  const [testValues, setTestValues] = useState<KpiValues>({});
  const [approvedTarget, setApprovedTarget] = useState<number | null>(null);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [constraints, setConstraints] = useState<Map<string, KpiConstraint>>(new Map());
  const [kpiConflicts, setKpiConflicts] = useState<ConflictRecord[]>([]);
  const [conflictReloads, setConflictReloads] = useState<number>(0);

  /** A save waiting on the user to accept the conflict it would record. */
  const [pendingSave, setPendingSave] = useState<{ conflicts: PendingConflict[]; confirmLabel: string } | null>(null);
  /** The component-level conflicts the confirmed save has to record. */
  const [pendingConflicts, setPendingConflicts] = useState<DetectedConflict[]>([]);

  const [rollUpRows, setRollUpRows] = useState<RollUpRow[]>([]);
  const [rollUpLoading, setRollUpLoading] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Base data ---------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([EntityService.getKpis(undefined, departmentId, functionId), ModelService.getAllModels()])
      .then(([kpis, allModels]) => {
        if (cancelled) return;
        setAllKpis(kpis);
        setModels(allModels);
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to fetch base data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [departmentId, functionId]);

  /**
   * The KPIs in scope. strategy_kpises filters Region/Department/Function server-side; the same
   * two are re-checked here so a KPI whose lookups are empty can't slip past a chosen filter.
   */
  const kpis = useMemo(() => allKpis.filter(kpi => {
    if (departmentId && kpi.departmentId !== departmentId) return false;
    if (functionId && kpi.functionId !== functionId) return false;
    return true;
  }), [allKpis, departmentId, functionId]);

  useEffect(() => {
    if (kpis.some(k => k.id === selectedKpiId)) return;
    setSelectedKpiId(kpis[0]?.id ?? '');
  }, [kpis, selectedKpiId]);

  const selectedKpi = useMemo(
    () => kpis.find(k => k.id === selectedKpiId) ?? null,
    [kpis, selectedKpiId]
  );

  /** Models this KPI takes part in — as the result, or as one of the components. */
  const availableModels = useMemo(() => {
    if (!selectedKpi) return [];
    return models.filter(m => ModelService.referencedKpiIds(m).includes(selectedKpi.id));
  }, [models, selectedKpi]);

  useEffect(() => {
    if (availableModels.some(m => m.id === selectedModelId)) return;
    setSelectedModelId(availableModels[0]?.id ?? '');
  }, [availableModels, selectedModelId]);

  const selectedModel = useMemo(
    () => availableModels.find(m => m.id === selectedModelId) ?? null,
    [availableModels, selectedModelId]
  );

  const componentIds = useMemo(
    () => (selectedModel ? ModelService.componentKpiIds(selectedModel) : []),
    [selectedModel]
  );

  const kpiName = useCallback(
    (id: string) => allKpis.find(k => k.id === id)?.name || id,
    [allKpis]
  );

  /* ---------- Context values: component baselines, the KPI's approved target, ceilings ---------- */
  useEffect(() => {
    if (!selectedModel || !businessUnitId) { setTestValues({}); return; }
    let cancelled = false;
    const run = async () => {
      const seeded: KpiValues = {};
      await Promise.all(componentIds.map(async id => {
        const ledger = await LedgerService.getLedger({ kind: 'kpi', id }, businessUnitId, year);
        const entry = ledger.months.find(m => m.month === month);
        // The prototype starts each component at its baseline, falling back to 1 so a product
        // isn't zeroed out before anything has been typed.
        seeded[id] = entry?.baseline ?? entry?.actual ?? 1;
      }));
      if (!cancelled) setTestValues(seeded);
    };
    run();
    return () => { cancelled = true; };
  }, [selectedModel, componentIds, businessUnitId, year, month]);

  useEffect(() => {
    if (!selectedKpi || !businessUnitId) { setApprovedTarget(null); setKpiConflicts([]); return; }
    let cancelled = false;
    const entityRef = { kind: 'kpi' as const, id: selectedKpi.id };
    Promise.all([
      LedgerService.getMonthValue(entityRef, businessUnitId, year, month, 'target'),
      ConflictService.getConflicts(entityRef, businessUnitId, year, month)
    ])
      .then(([target, conflicts]) => {
        if (cancelled) return;
        setApprovedTarget(target);
        setKpiConflicts(conflicts);
      })
      .catch(() => {
        if (cancelled) return;
        setApprovedTarget(null); setKpiConflicts([]);
      });
    return () => { cancelled = true; };
  }, [selectedKpi, businessUnitId, year, month, conflictReloads]);

  useEffect(() => {
    if (!businessUnitId) { setConstraints(new Map()); return; }
    let cancelled = false;
    KpiConstraintService.getConstraints(businessUnitId)
      .then(found => { if (!cancelled) setConstraints(found); })
      .catch(() => { if (!cancelled) setConstraints(new Map()); });
    return () => { cancelled = true; };
  }, [businessUnitId]);

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

  /**
   * The month's target for every KPI in scope, so the screen can list the ones that have none.
   * A KPI with no target is exactly what the bottom-up path is for: the manager proposes one.
   */
  const [monthTargets, setMonthTargets] = useState<Map<string, number | null>>(new Map());
  const [targetReloads, setTargetReloads] = useState<number>(0);
  /** What the user is proposing for each untargeted KPI. */
  const [directTargets, setDirectTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!businessUnitId || !kpis.length) { setMonthTargets(new Map()); return; }
    let cancelled = false;
    SummaryService.getKpiTargets([businessUnitId], year, month)
      .then(byBu => { if (!cancelled) setMonthTargets(byBu.get(businessUnitId) ?? new Map()); })
      .catch(() => { if (!cancelled) setMonthTargets(new Map()); });
    return () => { cancelled = true; };
  }, [businessUnitId, kpis.length, year, month, targetReloads]);

  /** The KPIs in scope with nothing set for the month, in the usual reading order. */
  const untargetedKpis = useMemo(() => kpis
    .filter(kpi => {
      const target = monthTargets.get(kpi.id);
      return target == null || target === 0;
    })
    .sort((a, b) => kpiTypeRank(a.type) - kpiTypeRank(b.type) || a.name.localeCompare(b.name)),
  [kpis, monthTargets]);

  const setDirectTarget = useCallback((kpiId: string, value: string) => {
    setDirectTargets(prev => ({ ...prev, [kpiId]: value }));
  }, []);

  /**
   * Propose a target for each KPI the user filled in. These have no approved target to disagree
   * with, so they go straight in as proposals from the Bottom Up path.
   */
  const proposeDirectTargets = useCallback(async () => {
    if (!businessUnitId) return;
    const entries = Object.entries(directTargets)
      .filter(([, raw]) => raw.trim() !== '')
      .map(([kpiId, raw]) => ({ kpiId, value: parseFloat(raw) || 0 }));
    if (!entries.length) return;

    setSaving(true);
    try {
      for (const entry of entries) {
        await TargetWriteService.writeProposalWithConflict(
          { kind: 'kpi', id: entry.kpiId },
          kpiName(entry.kpiId),
          businessUnitId,
          year,
          month,
          entry.value,
          'Bottom Up'
        );
      }
      setDirectTargets({});
      setTargetReloads(n => n + 1);
      alert(`${entries.length} target(s) proposed for review.`);
    } catch (err: any) {
      alert(`Error proposing targets: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [businessUnitId, directTargets, kpiName, year, month]);

  /* ---------- The model's result for what's been proposed ---------- */
  const evalContext: EvalContext = useMemo(() => ({
    percentageKpiIds: new Set(allKpis.filter(k => k.aggType === 'Percentage').map(k => k.id)),
    workingDays
  }), [allKpis, workingDays]);

  /** The raw model result, then held inside the result KPI's own min/max. */
  const computedResult = useMemo(() => {
    if (!selectedModel) return 0;
    const raw = recomputeResult(selectedModel, testValues, {}, evalContext);
    if (selectedModel.resultKind !== 'kpi' || !selectedModel.resultKpiId) return raw;
    return KpiConstraintService.clamp(raw, constraints.get(selectedModel.resultKpiId));
  }, [selectedModel, testValues, evalContext, constraints]);

  /** True when the result would come in under a target that's already approved. */
  const belowApproved = approvedTarget != null && approvedTarget > 0 && computedResult < approvedTarget;

  /**
   * Components proposed outside their own min/max, keyed by KPI so a row can show its own
   * message. The prototype blocks the save on any of these.
   */
  const violationsByKpi = useMemo(() => {
    const byKpi = new Map<string, ConstraintViolation>();
    componentIds.forEach(id => {
      const violation = KpiConstraintService.violation(testValues[id], constraints.get(id), kpiName(id));
      if (violation) byKpi.set(id, violation);
    });
    return byKpi;
  }, [componentIds, testValues, constraints, kpiName]);

  const componentViolations = useMemo(() => Array.from(violationsByKpi.values()), [violationsByKpi]);

  const equation = selectedModel ? equationString(selectedModel) : '';

  /* ---------- How the result reflects up to the organization ---------- */
  useEffect(() => {
    if (!selectedModel?.resultKpiId || selectedModel.resultKind !== 'kpi' || !businessUnitId) {
      setRollUpRows([]);
      return;
    }
    let cancelled = false;
    setRollUpLoading(true);
    RollUpService.getRollUpForKpi(
      selectedModel.resultKpiId,
      selectedModel.resultKpiName || selectedModel.name,
      businessUnitId,
      year,
      computedResult
    )
      .then(rows => { if (!cancelled) setRollUpRows(rows); })
      .catch(() => { if (!cancelled) setRollUpRows([]); })
      .finally(() => { if (!cancelled) setRollUpLoading(false); });
    return () => { cancelled = true; };
  }, [selectedModel, businessUnitId, year, computedResult]);

  const setComponentValue = useCallback((kpiId: string, value: number) => {
    setTestValues(prev => ({ ...prev, [kpiId]: value }));
  }, []);

  /**
   * Save every component as a proposal against this model. A result under the KPI's approved
   * target flags all of them and raises the conflict for review; a component outside its own
   * min/max blocks the save outright, as the prototype does.
   */
  const runSave = useCallback(async (conflicts: DetectedConflict[] = []) => {
    if (!selectedModel || !selectedKpi || !businessUnitId) return;
    if (componentViolations.length) {
      alert(`Blocked: ${componentViolations.map(v => v.message).join('; ')}`);
      return;
    }
    setSaving(true);
    try {
      const conflictedIds = new Set(conflicts.map(c => c.entityRef.id));
      for (const id of componentIds) {
        const proposalId = await TargetWriteService.writeProposal({
          entityRef: { kind: 'kpi', id },
          entityName: kpiName(id),
          buId: businessUnitId,
          year,
          month,
          value: testValues[id] ?? 0,
          modelId: selectedModel.id,
          source: 'Bottom Up',
          // Flagged when this component disagrees with its own target, or when the result it
          // feeds comes in under the KPI's.
          hasConflict: belowApproved || conflictedIds.has(id)
        });
        const conflict = conflicts.find(c => c.entityRef.id === id);
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
            source: 'Bottom Up'
          });
        }
      }

      if (belowApproved) {
        await ConflictService.raiseConflict({
          entityRef: { kind: 'kpi', id: selectedKpi.id },
          entityName: selectedKpi.name,
          buId: businessUnitId,
          year,
          month,
          existingValue: approvedTarget!,
          proposedValue: computedResult,
          source: 'Bottom Up'
        });
      }

      setConflictReloads(n => n + 1);
      alert(belowApproved
        ? `${componentIds.length} component proposal(s) saved for ${selectedKpi.name}, and a conflict was raised: the model's ${computedResult} is below the approved target of ${approvedTarget}.`
        : `${componentIds.length} component proposal(s) saved for ${selectedKpi.name}.`);
    } catch (err: any) {
      alert(`Error saving proposal: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [
    selectedModel, selectedKpi, businessUnitId, componentIds, componentViolations,
    testValues, belowApproved, approvedTarget, computedResult, year, month, kpiName
  ]);


  /**
   * Ask before saving when the model's result undercuts the KPI's approved target: the save is
   * allowed, but only once the user has seen what goes on record.
   */
  const saveProposal = useCallback(async () => {
    if (!selectedKpi || !businessUnitId) return;
    if (componentViolations.length) {
      alert(`Blocked: ${componentViolations.map(v => v.message).join('; ')}`);
      return;
    }

    // Every component is checked against its own approved target …
    const planned: PlannedProposal[] = componentIds.map(id => ({
      entityRef: { kind: 'kpi' as const, id },
      entityName: kpiName(id),
      value: testValues[id] ?? 0,
      month
    }));
    const conflicts = await ConflictDetectionService.detect(planned, {
      buId: businessUnitId,
      year,
      source: 'Bottom Up'
    });

    // … and the result is checked against the KPI the manager is proposing for.
    const all = [...conflicts];
    if (belowApproved && approvedTarget != null) {
      all.push({
        entityRef: { kind: 'kpi', id: selectedKpi.id },
        entityName: selectedKpi.name,
        conflictType: CONFLICT_TYPE_BY_SOURCE['Bottom Up'],
        existingValue: approvedTarget,
        existingTarget: approvedTarget,
        proposedValue: computedResult,
        value: computedResult,
        month,
        reason: `The components add up to ${computedResult}, below the ${approvedTarget} already approved for this month. Every component proposal is flagged with it.`
      });
    }

    if (!all.length) { runSave(); return; }
    setPendingSave({
      confirmLabel: `Save ${componentIds.length} proposal${componentIds.length === 1 ? '' : 's'}`,
      conflicts: all
    });
    setPendingConflicts(conflicts);
  }, [
    selectedKpi, businessUnitId, componentViolations, belowApproved, componentIds,
    kpiName, testValues, approvedTarget, computedResult, year, month, runSave
  ]);

  const confirmPendingSave = useCallback(async () => {
    setPendingSave(null);
    await runSave(pendingConflicts);
    setPendingConflicts([]);
  }, [runSave, pendingConflicts]);

  const cancelPendingSave = useCallback(() => setPendingSave(null), []);

  return {
    businessUnitId, setBusinessUnitId,
    departmentId, setDepartmentId,
    functionId, setFunctionId,
    year, setYear,
    month, setMonth,
    kpis, selectedKpi, selectedKpiId, setSelectedKpiId,
    untargetedKpis, directTargets, setDirectTarget, proposeDirectTargets,
    availableModels, selectedModel, selectedModelId, setSelectedModelId,
    componentIds, kpiName, equation, workingDays,
    testValues, setComponentValue,
    computedResult, approvedTarget, belowApproved, componentViolations, violationsByKpi,
    kpiConflicts,
    rollUpRows, rollUpLoading,
    saveProposal,
    pendingSave, confirmPendingSave, cancelPendingSave,
    loading, saving, error
  };
}
