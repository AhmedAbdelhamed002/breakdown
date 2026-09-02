import { useEffect, useState, useCallback } from "react";
import {
  createStrategy,
  updateStrategy,
  getStrategy,
  type StrategyDraft,
  type StrategyUpdatePatch,
} from "../services/strategyService";
import { listStrategyKpis, addStrategyKpi, findOrCreateStrategyKpi, getKpiDetail } from "../services/strategyKpiService";
import { listTacticsByStrategyKpis, createTactic, updateTactic } from "../services/tacticService";
import { listPocsByStrategyKpis, createPoc, updatePoc } from "../services/pocService";
import { assignItemToStrategy } from "../services/bottomUpItemService";
import type { TacticDraft } from "../models/tactic";
import type { PocDraft } from "../models/poc";
import type { UnassignedItem } from "../models/unassignedItem";
import { newWizardState, stepsFor, type WizardState } from "../models/wizardState";
import type { Strategy } from "../models/strategy";
import { TRACK_SERVICE, STRATEGY_TYPE_SERVICE } from "../constants/optionSets";

function strategyToDraftCore(s: Strategy): Partial<StrategyDraft> & { track: number } {
  return {
    track: s.track === "Service" ? TRACK_SERVICE : 1,
    name: s.name,
    strategyType: s.strategyType,
    strategyLevel: s.strategyLevel,
    complexity: s.complexity,
    implementationConfidence: s.implementationConfidence,
    companyId: s.companyId,
    departmentId: s.departmentId,
    functionId: s.functionId,
    regionId: s.regionId,
    businessUnitId: s.businessUnitId,
    processId: s.processId,
    subProcessId: s.subProcessId,
    objectiveDepartmentId: s.objectiveDepartmentId,
    primaryKpiId: s.primaryKpiId,
    kpiCurrent: s.kpiCurrent,
    kpiTarget: s.kpiTarget,
    specialty: s.specialty,
    startDate: s.startDate,
    endDate: s.endDate,
    supportiveFunctionId: s.supportiveFunctionId,
    supportedStrategyId: s.supportedStrategyId,
    supportedDepartmentId: s.supportedDepartmentId,
  };
}

export type StrategyWizard = ReturnType<typeof useStrategyWizard>;

export function useStrategyWizard(strategyId: string | undefined, initialCore?: Partial<StrategyDraft>) {
  const [state, setState] = useState<WizardState>(() => {
    const base = newWizardState();
    if (strategyId || !initialCore) return base;
    return { ...base, core: { ...base.core, ...initialCore } };
  });
  const [loading, setLoading] = useState(!!strategyId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Staged from the selected Parent Objective's KPI hierarchy; only ever
   * consumed once, right after the Strategy itself is first created (the
   * stf_strategykpi junction needs a real stf_strategy id to point at). */
  const [pendingOutcomeKpi, setPendingOutcomeKpi] = useState<{ id: string; name: string } | undefined>();

  useEffect(() => {
    if (!strategyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const strategy = await getStrategy(strategyId);
        const kpis = await listStrategyKpis(strategyId);
        const strategyKpiIds = kpis.map((k) => k.id);
        const [tactics, pocs] = await Promise.all([
          listTacticsByStrategyKpis(strategyKpiIds),
          listPocsByStrategyKpis(strategyKpiIds),
        ]);
        if (cancelled) return;
        const core = strategyToDraftCore(strategy);
        // Land on the last real step (Review) when reopening an existing
        // strategy, for both tracks — the legacy source jumps here too, but
        // has an off-by-one bug for the Service track that lands one step
        // early; land on the true last step instead (see plan Phase 1).
        const lastStepIndex = stepsFor(core.track).length - 1;
        setState({
          strategyId: strategy.id,
          revisionStatus: strategy.revisionStatus,
          stepIndex: lastStepIndex,
          core,
          kpis,
          tactics,
          pocs,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load strategy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strategyId]);

  const steps = stepsFor(state.core.track);
  const currentStep = steps[state.stepIndex] ?? steps[0];

  const setCore = useCallback((patch: Partial<StrategyDraft>) => {
    setState((s) => ({ ...s, core: { ...s.core, ...patch } }));
  }, []);

  /** Track is locked forever once the strategy exists in Dataverse (spec §6.6). */
  const setTrack = useCallback(
    (track: number) => {
      setState((s) => {
        if (s.strategyId) return s;
        return {
          ...s,
          core: { ...s.core, track, strategyType: track === TRACK_SERVICE ? STRATEGY_TYPE_SERVICE : s.core.strategyType },
        };
      });
    },
    []
  );

  const saveDraft = useCallback(
    async (description: string): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        if (!state.strategyId) {
          const created = await createStrategy(state.core as StrategyDraft, description);
          setState((s) => ({ ...s, strategyId: created.id, revisionStatus: created.revisionStatus }));
          if (state.core.primaryKpiId) {
            try {
              // Folds the primary/Output KPI into the same stf_strategykpi
              // junction list as any manually-added KPI (spec: "goes through
              // the identical persist path") — otherwise Tactics/POCs could
              // never target the Output KPI itself, only the Outcome KPI.
              const primaryKpi = await getKpiDetail(state.core.primaryKpiId);
              const kpi = await findOrCreateStrategyKpi(created.id, primaryKpi.id, primaryKpi.name);
              setState((s) => ({ ...s, kpis: [...s.kpis, kpi] }));
            } catch {
              // Best-effort — never undo a successful Strategy creation because of it.
            }
          }
          if (pendingOutcomeKpi) {
            try {
              const kpi = await findOrCreateStrategyKpi(created.id, pendingOutcomeKpi.id, pendingOutcomeKpi.name);
              setState((s) => ({ ...s, kpis: [...s.kpis, kpi] }));
            } catch {
              // Auto-linking the derived Outcome KPI is best-effort — never
              // undo a successful Strategy creation because of it (spec
              // §16/Rule 3).
            }
            setPendingOutcomeKpi(undefined);
          }
        } else {
          const patch: StrategyUpdatePatch = {
            description,
            complexity: state.core.complexity,
            implementationConfidence: state.core.implementationConfidence,
            kpiCurrent: state.core.kpiCurrent,
            kpiTarget: state.core.kpiTarget,
            specialty: state.core.specialty,
            startDate: state.core.startDate,
            endDate: state.core.endDate,
            processId: state.core.processId,
            subProcessId: state.core.subProcessId,
          };
          await updateStrategy(state.strategyId, patch);
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save strategy");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [state.strategyId, state.core, pendingOutcomeKpi]
  );

  const goNext = useCallback(() => setState((s) => ({ ...s, stepIndex: Math.min(s.stepIndex + 1, steps.length - 1) })), [steps.length]);
  const goBack = useCallback(() => setState((s) => ({ ...s, stepIndex: Math.max(s.stepIndex - 1, 0) })), []);
  const goToStep = useCallback((index: number) => setState((s) => ({ ...s, stepIndex: index })), []);

  const addKpi = useCallback(async (kpiId: string, kpiName: string) => {
    if (!state.strategyId) throw new Error("Save the strategy before adding KPIs");
    const kpi = await addStrategyKpi(state.strategyId, kpiId, kpiName);
    setState((s) => ({ ...s, kpis: [...s.kpis, kpi] }));
  }, [state.strategyId]);

  const addTactic = useCallback(async (draft: TacticDraft) => {
    const tactic = await createTactic(draft);
    setState((s) => ({ ...s, tactics: [...s.tactics, tactic] }));
    return tactic;
  }, []);

  const editTactic = useCallback(async (id: string, draft: Partial<TacticDraft> & { status?: number }) => {
    const tactic = await updateTactic(id, draft);
    setState((s) => ({ ...s, tactics: s.tactics.map((t) => (t.id === id ? tactic : t)) }));
    return tactic;
  }, []);

  const addPoc = useCallback(async (draft: PocDraft) => {
    const poc = await createPoc(draft);
    setState((s) => ({ ...s, pocs: [...s.pocs, poc] }));
    return poc;
  }, []);

  const editPoc = useCallback(async (id: string, draft: Partial<PocDraft> & { status?: number }) => {
    const poc = await updatePoc(id, draft);
    setState((s) => ({ ...s, pocs: s.pocs.map((p) => (p.id === id ? poc : p)) }));
    return poc;
  }, []);

  /** Reverse of addTactic/addPoc — clusters an already-existing unassigned item into this strategy
   * (see bottomUpItemService's own note on the dual-KPI invariant) rather than creating a new one.
   * Reloads KPIs/Tactics/POCs afterward since the item's KPI may not have been on this strategy yet. */
  const attachExistingItem = useCallback(async (item: UnassignedItem) => {
    if (!state.strategyId) throw new Error("Save the strategy before attaching items");
    await assignItemToStrategy(item, state.strategyId);
    const kpis = await listStrategyKpis(state.strategyId);
    const strategyKpiIds = kpis.map((k) => k.id);
    const [tactics, pocs] = await Promise.all([
      listTacticsByStrategyKpis(strategyKpiIds),
      listPocsByStrategyKpis(strategyKpiIds),
    ]);
    setState((s) => ({ ...s, kpis, tactics, pocs }));
  }, [state.strategyId]);

  const setRevisionStatus = useCallback((strategy: Strategy) => {
    setState((s) => ({ ...s, revisionStatus: strategy.revisionStatus }));
  }, []);

  return {
    state,
    loading,
    saving,
    error,
    steps,
    currentStep,
    isServiceTrack: state.core.track === TRACK_SERVICE,
    setCore,
    setTrack,
    saveDraft,
    setRevisionStatus,
    pendingOutcomeKpi,
    setPendingOutcomeKpi,
    goNext,
    goBack,
    goToStep,
    addKpi,
    addTactic,
    editTactic,
    addPoc,
    editPoc,
    attachExistingItem,
  };
}
