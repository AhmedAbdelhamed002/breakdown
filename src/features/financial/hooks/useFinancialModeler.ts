import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { financialStore } from '../services/financialStore';
import {
  fetchRegionsFromDataverse,
  fetchBusinessUnitsFromDataverse,
  fetchDepartmentsFromDataverse,
  fetchFunctionsFromDataverse,
  fetchKpisFromDataverse,
  fetchCeilingsFromDataverse,
  fetchModelsFromDataverse,
  fetchModelTermsFromDataverse,
  fetchRelationFactorsFromDataverse,
  saveCeilingToDataverse,
  updateCeilingInDataverse,
  deleteCeilingFromDataverse,
  reconcileCeilingStatuses,
  persistCeilingStatusReconciliation,
  saveEquationModelToDataverse,
  saveProposalsAndConflictsToDataverse,
  type ProposalConflictDraft,
  fetchOrgOutputsFromDataverse,
  fetchOrgOutcomesFromDataverse,
  fetchOutputContributionsFromDataverse,
  fetchOutcomeContributionsFromDataverse,
  fetchOrgOutputAchievementsFromDataverse,
  fetchOrgOutcomeAchievementsFromDataverse,
  fetchKpiAchievementsFromDataverse,
  fetchTargetVersionsFromDataverse,
  fetchWorkingDaysFromDataverse,
  generatedModelName,
  isDataverseEnvironment,
  isAwaitingReviewModel,
  isSealedModel,
  applyModelLifecycle,
  updateModelLifecycleInDataverse,
  PM_MODELTYPE_UNDER_REVIEW,
  PM_MODELTYPE_APPROVED_BY_FINANCE,
  PM_MODELTYPE_SEALED,
  PM_MODELTYPE_DRAFT,
} from '../services/dataverseService';
import type {
  FinancialModel,
  KpiCeiling,
  KpiAchievement,
  StrategyKpi,
  Region,
  BusinessUnit,
  Department,
  HrFunction,
  FilterContext,
  TesterComponentRow,
  TesterPeriod,
  Proposal,
  OrgLinkInfo,
  ModelTerm,
  RelationFactor,
  ModelType,
  EntityKind,
  YesNo,
  OrgRollupRow,
  OrgOutput,
  OrgOutcome,
  OutputContribution,
  OutcomeContribution,
  OrgOutputAchievement,
  OrgOutcomeAchievement,
  RegionChoice,
  Conflict,
  TargetVersion,
  TargetSource,
  WorkingDays,
} from '../models/types';
import { valuesConflict } from '../utils/conflicts';
import {
  pickKpiAchievementBaselineOrHistorical,
  pickKpiAchievementTarget,
} from '../utils/kpiAchievementTarget';
import { equationMissingOperators } from '../utils/equationOperators';
import { findWorkingDaysCount } from '../utils/workingDays';
import { isSupersededCeiling } from '../utils/ceilingStatus';
import {
  stripResultKpiFactors,
  stripResultKpiTerms,
  hasNumericActualOrBaseline,
  relationProposalBlockedMessage,
} from '../utils/modelKpiEligibility';
import { useActingRole } from '../providers/ActingRoleContext';

function normalizeLookupId(id: unknown): string {
  return String(id ?? '').replace(/[{}]/g, '').toLowerCase().trim();
}

export type TesterConflictPreview = {
  entityName: string;
  entityKind: string;
  proposed: number;
  existing: number;
  month: number;
  year: number;
  businessUnit?: string;
  existingSource: TargetSource;
};

type PendingTesterSave = {
  drafts: ProposalConflictDraft[];
  rewriteModelAsDraft: boolean;
  termsToSave: ModelTerm[];
};

function conflictPreviewsFromDrafts(drafts: ProposalConflictDraft[]): TesterConflictPreview[] {
  return drafts
    .filter((d) => d.conflict)
    .map((d) => {
      const c = d.conflict!;
      return {
        entityName:
          c.pm_kpiname || c.pm_orgoutputname || c.pm_orgoutcomename || c.pm_entitykind,
        entityKind: c.pm_entitykind,
        proposed: c.pm_proposedvalue,
        existing: c.pm_existingvalue,
        month: c.pm_month,
        year: c.pm_year,
        businessUnit: c.pm_businessunitname,
        existingSource: c.pm_existingsource,
      };
    });
}

// ═══════════════════════════════════════════════════════════════════
//  useFinancialModeler — Main hook for Financial Modeler state
// ═══════════════════════════════════════════════════════════════════

export function useFinancialModeler(
  initialTab: 'models' | 'builder' | 'review' | 'ceilings' = 'models'
) {
  // ── Filter context state ──
  const [context, setContextState] = useState<FilterContext>({
    region: '',
    businessUnit: '',
    department: '',
    functionId: '',
  });

  const { activeRole } = useActingRole();

  // ── Selected model ──
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState<
    'models' | 'builder' | 'review' | 'ceilings'
  >(initialTab);

  // ── Force re-render counter (for mutation-driven updates) ──
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // ── Live Dataverse State ──
  const [liveRegions, setLiveRegions] = useState<Region[]>([]);
  const [liveBusinessUnits, setLiveBusinessUnits] = useState<BusinessUnit[]>([]);
  const [liveDepartments, setLiveDepartments] = useState<Department[]>([]);
  const [liveFunctions, setLiveFunctions] = useState<HrFunction[]>([]);
  const [liveKpis, setLiveKpis] = useState<StrategyKpi[]>([]);
  const [liveCeilings, setLiveCeilings] = useState<KpiCeiling[]>([]);
  const [liveModels, setLiveModels] = useState<FinancialModel[]>([]);
  const [liveModelTerms, setLiveModelTerms] = useState<ModelTerm[]>([]);
  const [liveRelationFactors, setLiveRelationFactors] = useState<RelationFactor[]>([]);
  const [liveOrgOutputs, setLiveOrgOutputs] = useState<OrgOutput[]>([]);
  const [liveOrgOutcomes, setLiveOrgOutcomes] = useState<OrgOutcome[]>([]);
  const [liveOutputContributions, setLiveOutputContributions] = useState<OutputContribution[]>([]);
  const [liveOutcomeContributions, setLiveOutcomeContributions] = useState<OutcomeContribution[]>([]);
  const [liveOrgOutputAchievements, setLiveOrgOutputAchievements] = useState<OrgOutputAchievement[]>([]);
  const [liveOrgOutcomeAchievements, setLiveOrgOutcomeAchievements] = useState<OrgOutcomeAchievement[]>([]);
  const [liveTargetVersions, setLiveTargetVersions] = useState<TargetVersion[]>([]);
  const [liveWorkingDays, setLiveWorkingDays] = useState<WorkingDays[]>([]);
  const [liveAchievements, setLiveAchievements] = useState<KpiAchievement[]>([]);
  const [didLoadLive, setDidLoadLive] = useState(false);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [testerPeriod, setTesterPeriod] = useState<TesterPeriod>({
    month: 8,
    year: 2026,
    fullYear: false,
  });
  const [draftTerms, setDraftTerms] = useState<ModelTerm[] | null>(null);
  const [draftFactors, setDraftFactors] = useState<RelationFactor[] | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<TesterConflictPreview[] | null>(null);
  const [pendingSaveRewritesModel, setPendingSaveRewritesModel] = useState(false);
  const pendingTesterSaveRef = useRef<PendingTesterSave | null>(null);

  // ── Fetch Live Dataverse Tables on Mount ──
  const loadDataverseData = useCallback(async () => {
    setIsLoadingLive(true);
    setSaveError(null);
    try {
      const [
        regs,
        bus,
        depts,
        fns,
        kpis,
        ceils,
        modelsLive,
        termsLive,
        factorsLive,
        orgOutputsLive,
        orgOutcomesLive,
        outputContribLive,
        outcomeContribLive,
        orgOutputAchLive,
        orgOutcomeAchLive,
        targetVersionsLive,
        workingDaysLive,
      ] = await Promise.all([
        fetchRegionsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Regions fetch failed:', err);
          return [] as Region[];
        }),
        fetchBusinessUnitsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Business units fetch failed:', err);
          setSaveError(err instanceof Error ? err.message : 'Failed to load business units from Dataverse.');
          return [] as BusinessUnit[];
        }),
        fetchDepartmentsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Departments fetch failed:', err);
          return [] as Department[];
        }),
        fetchFunctionsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Functions fetch failed:', err);
          return [] as HrFunction[];
        }),
        fetchKpisFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] KPIs fetch failed:', err);
          setSaveError(err instanceof Error ? err.message : 'Failed to load KPIs from strategy_kpis.');
          return [] as StrategyKpi[];
        }),
        fetchCeilingsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Ceilings fetch failed:', err);
          return [] as KpiCeiling[];
        }),
        fetchModelsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Models fetch failed:', err);
          setSaveError(err instanceof Error ? err.message : 'Failed to load models from pm_model.');
          return [] as FinancialModel[];
        }),
        fetchModelTermsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Model terms fetch failed:', err);
          return [] as ModelTerm[];
        }),
        fetchRelationFactorsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Relation factors fetch failed:', err);
          return [] as RelationFactor[];
        }),
        fetchOrgOutputsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Org outputs fetch failed:', err);
          return [] as OrgOutput[];
        }),
        fetchOrgOutcomesFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Org outcomes fetch failed:', err);
          return [] as OrgOutcome[];
        }),
        fetchOutputContributionsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Output contributions fetch failed:', err);
          return [] as OutputContribution[];
        }),
        fetchOutcomeContributionsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Outcome contributions fetch failed:', err);
          return [] as OutcomeContribution[];
        }),
        fetchOrgOutputAchievementsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Org output achievements fetch failed:', err);
          return [] as OrgOutputAchievement[];
        }),
        fetchOrgOutcomeAchievementsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Org outcome achievements fetch failed:', err);
          return [] as OrgOutcomeAchievement[];
        }),
        fetchTargetVersionsFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Target versions fetch failed:', err);
          return [] as TargetVersion[];
        }),
        fetchWorkingDaysFromDataverse().catch((err) => {
          console.warn('[useFinancialModeler] Working days fetch failed:', err);
          return [] as WorkingDays[];
        }),
      ]);

      // Always apply live results (including empty) so mock bu1/kpi1 rows are not mixed in.
      setLiveRegions(regs ?? []);
      setLiveBusinessUnits(bus ?? []);
      setLiveDepartments(depts ?? []);
      setLiveFunctions(fns ?? []);
      setLiveKpis(kpis ?? []);
      const reconciledCeilings = reconcileCeilingStatuses(ceils ?? []);
      setLiveCeilings(reconciledCeilings);
      void persistCeilingStatusReconciliation(ceils ?? [], reconciledCeilings).catch((err) => {
        console.warn('[useFinancialModeler] Ceiling status reconciliation notice:', err);
      });
      // Keep locally created drafts that are not yet in Dataverse.
      // If a just-submitted model still comes back as Draft (choice mapping lag),
      // keep the Under Review / Sealed status from the local copy.
      setLiveModels((prev) => {
        const remote = modelsLive ?? [];
        const mergedRemote = remote.map((r) => {
          const local = prev.find((m) => m.pm_modelid === r.pm_modelid);
          if (!local) return r;
          const localReview =
            local.pm_modeltypevalue === PM_MODELTYPE_UNDER_REVIEW ||
            local.pm_modeltypevalue === PM_MODELTYPE_APPROVED_BY_FINANCE ||
            local.pm_modeltypevalue === PM_MODELTYPE_SEALED ||
            local.statuscode === 'In Review' ||
            local.statuscode === 'Approved By Finance' ||
            local.statuscode === 'Sealed';
          const remoteDraft =
            (r.pm_modeltypevalue === PM_MODELTYPE_DRAFT || r.pm_modeltypevalue == null) &&
            (r.statuscode === 'Draft' || !r.statuscode);
          if (localReview && remoteDraft) {
            return {
              ...r,
              statuscode: local.statuscode,
              pm_modeltypevalue: local.pm_modeltypevalue,
              statusLabel: local.statusLabel || r.statusLabel,
            };
          }
          return r;
        });
        const localOnly = prev.filter(
          (m) => !mergedRemote.some((r) => r.pm_modelid === m.pm_modelid)
        );
        return [...mergedRemote, ...localOnly];
      });
      setLiveModelTerms(termsLive ?? []);
      setLiveRelationFactors(factorsLive ?? []);
      setLiveOrgOutputs(orgOutputsLive ?? []);
      setLiveOrgOutcomes(orgOutcomesLive ?? []);
      setLiveOutputContributions(outputContribLive ?? []);
      setLiveOutcomeContributions(outcomeContribLive ?? []);
      setLiveOrgOutputAchievements(orgOutputAchLive ?? []);
      setLiveOrgOutcomeAchievements(orgOutcomeAchLive ?? []);
      setLiveTargetVersions(targetVersionsLive ?? []);
      setLiveWorkingDays(workingDaysLive ?? []);
      setDidLoadLive(true);

      // Drop mock / invalid selections after live data loads. Do not auto-pick children.
      setContextState((prev) => {
        const region = regs.some((r) => r.regionid === prev.region) ? prev.region : '';
        const businessUnit =
          region &&
          bus.some(
            (b) =>
              b.businessunitid === prev.businessUnit &&
              (!b.regionid || b.regionid === region)
          )
            ? prev.businessUnit
            : '';
        const department =
          businessUnit &&
          depts.some(
            (d) =>
              d.departmentid === prev.department &&
              (!d.businessunitid || d.businessunitid === businessUnit)
          )
            ? prev.department
            : '';
        const functionId =
          department &&
          fns.some(
            (f) =>
              f.functionid === prev.functionId &&
              (!f.departmentid || f.departmentid === department)
          )
            ? prev.functionId
            : '';

        return { region, businessUnit, department, functionId };
      });
    } catch (err) {
      console.warn('[useFinancialModeler] Live Dataverse fetch warning:', err);
    } finally {
      setIsLoadingLive(false);
    }
  }, []);

  useEffect(() => {
    void loadDataverseData();
  }, [loadDataverseData]);

  useEffect(() => {
    if (activeTab !== 'review') return;
    setSaveError((prev) =>
      prev && /equation terms|submitting for review|saving a proposal|relation factors/i.test(prev)
        ? null
        : prev
    );
  }, [activeTab]);

  // ── Effective Reference Data (Live Dataverse or Store Fallback) ──
  const regions = useMemo(
    () => (didLoadLive ? liveRegions : financialStore.getRegions()),
    [didLoadLive, liveRegions]
  );

  const allBusinessUnits = useMemo(
    () => (didLoadLive ? liveBusinessUnits : financialStore.getBusinessUnits()),
    [didLoadLive, liveBusinessUnits]
  );

  const allDepartments = useMemo(
    () => (didLoadLive ? liveDepartments : financialStore.getDepartments()),
    [didLoadLive, liveDepartments]
  );

  const allFunctions = useMemo(
    () => (didLoadLive ? liveFunctions : financialStore.getFunctions()),
    [didLoadLive, liveFunctions]
  );

  const allKpis = useMemo(
    () => (didLoadLive ? liveKpis : financialStore.getKpis()),
    [didLoadLive, liveKpis]
  );

  const ceilings = useMemo(
    () => reconcileCeilingStatuses(didLoadLive ? liveCeilings : financialStore.getCeilings()),
    [didLoadLive, liveCeilings, tick]
  );

  // ── Cascading Filtered Lists ──
  const businessUnits = useMemo(() => {
    if (!context.region) return [];
    const regionNorm = normalizeLookupId(context.region);
    const linked = allBusinessUnits.filter((bu) => !!bu.regionid);
    if (linked.length === 0) return allBusinessUnits;
    return allBusinessUnits.filter(
      (bu) => normalizeLookupId(bu.regionid) === regionNorm
    );
  }, [allBusinessUnits, context.region]);

  const departments = useMemo(() => {
    if (!context.businessUnit) return [];
    const buNorm = normalizeLookupId(context.businessUnit);
    const linked = allDepartments.filter((d) => !!d.businessunitid);
    if (linked.length === 0) return allDepartments;
    return allDepartments.filter(
      (d) => normalizeLookupId(d.businessunitid) === buNorm
    );
  }, [allDepartments, context.businessUnit]);

  const functions = useMemo(() => {
    if (!context.department) return [];
    const deptNorm = normalizeLookupId(context.department);
    const linked = allFunctions.filter((f) => !!f.departmentid);
    if (linked.length === 0) return allFunctions;
    return allFunctions.filter(
      (f) => normalizeLookupId(f.departmentid) === deptNorm
    );
  }, [allFunctions, context.department]);

  const filteredCeilings = useMemo(() => {
    const buNorm = normalizeLookupId(context.businessUnit);
    if (buNorm) {
      return ceilings.filter((c) => normalizeLookupId(c.pm_businessunit) === buNorm);
    }
    if (context.region) {
      const buIds = new Set(
        businessUnits
          .map((bu) => normalizeLookupId(bu.businessunitid))
          .filter(Boolean)
      );
      if (buIds.size === 0) return ceilings;
      return ceilings.filter((c) => buIds.has(normalizeLookupId(c.pm_businessunit)));
    }
    return ceilings;
  }, [ceilings, context.businessUnit, context.region, businessUnits]);

  /** Full KPI catalog — no region/department/function filtering. */
  const filteredKpis = allKpis;

  const kpiMap = useMemo(() => {
    const m = new Map<string, StrategyKpi>();
    for (const k of allKpis) m.set(k.strategy_kpisid, k);
    return m;
  }, [allKpis]);

  // ── Cascading context: changing a parent clears all dependents ──
  const setContext = useCallback(
    (newContext: FilterContext | ((prev: FilterContext) => FilterContext)) => {
      setContextState((prev) => {
        const next = typeof newContext === 'function' ? newContext(prev) : newContext;

        if (next.region !== prev.region) {
          return { region: next.region, businessUnit: '', department: '', functionId: '' };
        }
        if (next.businessUnit !== prev.businessUnit) {
          return { ...prev, businessUnit: next.businessUnit, department: '', functionId: '' };
        }
        if (next.department !== prev.department) {
          return { ...prev, department: next.department, functionId: '' };
        }

        return { ...prev, ...next };
      });
    },
    []
  );

  // ── Models ──
  const allModels = useMemo(() => {
    const base = didLoadLive ? liveModels : financialStore.getModels();
    return base.map((m) => {
      const factors = liveRelationFactors.filter((f) => f.pm_model === m.pm_modelid);
      const terms = liveModelTerms.filter((t) => t.pm_model === m.pm_modelid);
      let calcType = m.pm_modeltype;
      if (factors.length > 0) calcType = 'Relation';
      else if (terms.length > 0) calcType = 'Equation';
      return calcType === m.pm_modeltype ? m : { ...m, pm_modeltype: calcType };
    });
  }, [didLoadLive, liveModels, liveRelationFactors, liveModelTerms]);

  const selectedModel = useMemo(
    () => (selectedModelId ? allModels.find((m) => m.pm_modelid === selectedModelId) : undefined),
    [selectedModelId, allModels]
  );

  // Reset local drafts when switching models
  useEffect(() => {
    setDraftTerms(null);
    setDraftFactors(null);
  }, [selectedModelId]);

  const storeTermsForSelected = useMemo(() => {
    if (!selectedModelId) return [];
    const live = liveModelTerms.filter((t) => t.pm_model === selectedModelId);
    if (didLoadLive && live.length > 0) return live.sort((a, b) => a.pm_sequence - b.pm_sequence);
    return financialStore.getModelTerms(selectedModelId);
  }, [selectedModelId, liveModelTerms, didLoadLive, tick]);

  const storeFactorsForSelected = useMemo(() => {
    if (!selectedModelId) return [];
    const live = liveRelationFactors.filter((f) => f.pm_model === selectedModelId);
    if (didLoadLive && live.length > 0) return live;
    return financialStore.getRelationFactors(selectedModelId);
  }, [selectedModelId, liveRelationFactors, didLoadLive, tick]);

  const selectedModelTerms = draftTerms ?? storeTermsForSelected;
  const selectedModelFactors = draftFactors ?? storeFactorsForSelected;

  // ── Achievements from pm_kpiachievments (filtered by context bar) ──
  const loadAchievements = useCallback(async () => {
    if (!context.businessUnit) {
      setLiveAchievements([]);
      return;
    }
    try {
      const rows = await fetchKpiAchievementsFromDataverse({
        businessUnitId: context.businessUnit,
      });
      setLiveAchievements(rows);
    } catch (err) {
      console.warn('[useFinancialModeler] Achievements fetch failed:', err);
      setLiveAchievements([]);
    }
  }, [context.businessUnit]);

  useEffect(() => {
    void loadAchievements();
  }, [loadAchievements]);

  const achievements = useMemo(() => {
    if (didLoadLive || liveAchievements.length > 0) return liveAchievements;
    return financialStore.getAchievements();
  }, [didLoadLive, liveAchievements]);

  const contextComplete =
    Boolean(context.region) &&
    Boolean(context.businessUnit) &&
    Boolean(context.department) &&
    Boolean(context.functionId);

  const findAchievement = useCallback(
    (kpiId: string, month = testerPeriod.month, year = testerPeriod.year) => {
      if (!context.businessUnit) return undefined;

      const kpiNorm = normalizeLookupId(kpiId);
      const buNorm = normalizeLookupId(context.businessUnit);
      const deptNorm = normalizeLookupId(context.department);
      const fnNorm = normalizeLookupId(context.functionId);

      const kpi =
        kpiMap.get(kpiId) ||
        [...kpiMap.values()].find(
          (k) => normalizeLookupId(k.strategy_kpisid) === kpiNorm
        );
      const kpiName = (kpi?.btm_kpibusinessname || '').trim().toLowerCase();

      const deptName = allDepartments
        .find((d) => normalizeLookupId(d.departmentid) === deptNorm)
        ?.name?.toLowerCase();
      const fnName = allFunctions
        .find((f) => normalizeLookupId(f.functionid) === fnNorm)
        ?.name?.toLowerCase();

      const kpiMatch = (a: (typeof achievements)[number]) => {
        if (kpiNorm && normalizeLookupId(a.pm_kpi) === kpiNorm) return true;
        const achName = (a.pm_kpiname || '').trim().toLowerCase();
        return Boolean(kpiName && achName && achName === kpiName);
      };

      const pool = achievements.filter((a) => {
        if (!kpiMatch(a)) return false;
        if (buNorm && a.pm_businessunit && normalizeLookupId(a.pm_businessunit) !== buNorm) {
          return false;
        }
        return true;
      });

      if (pool.length === 0) return undefined;

      const score = (a: (typeof pool)[number]): number => {
        let s = 0;
        if (a.pm_year === year) s += 8;
        if (!testerPeriod.fullYear && a.pm_month === month) s += 8;
        if (a.pm_department && deptNorm && normalizeLookupId(a.pm_department) === deptNorm) s += 3;
        if (a.pm_function && fnNorm && normalizeLookupId(a.pm_function) === fnNorm) s += 3;
        if (a.pm_departmentname && deptName && a.pm_departmentname.toLowerCase() === deptName) {
          s += 2;
        }
        if (a.pm_functionname && fnName && a.pm_functionname.toLowerCase() === fnName) {
          s += 2;
        }
        return s;
      };

      return [...pool].sort((a, b) => score(b) - score(a))[0];
    },
    [
      context.businessUnit,
      context.department,
      context.functionId,
      testerPeriod.month,
      testerPeriod.year,
      testerPeriod.fullYear,
      allDepartments,
      allFunctions,
      kpiMap,
      achievements,
    ]
  );

  const getAchievementFields = useCallback(
    (kpiId: string, month = testerPeriod.month, year = testerPeriod.year) => {
      const ach = findAchievement(kpiId, month, year);
      return {
        actual: ach?.pm_actual,
        baseline: ach?.pm_baseline,
        historical: ach?.pm_historical,
        target: ach?.pm_target,
      };
    },
    [findAchievement, testerPeriod.month, testerPeriod.year]
  );

  const getAchievementValue = useCallback(
    (kpiId: string): number | undefined => getAchievementFields(kpiId).actual,
    [getAchievementFields]
  );

  const kpiHasRelationSource = useCallback(
    (kpiId: string) => {
      const fields = getAchievementFields(kpiId);
      return hasNumericActualOrBaseline(fields.actual, fields.baseline);
    },
    [getAchievementFields]
  );

  const relationKpiName = useCallback(
    (kpiId: string) =>
      kpiMap.get(kpiId)?.btm_kpibusinessname ||
      [...kpiMap.values()].find(
        (k) => normalizeLookupId(k.strategy_kpisid) === normalizeLookupId(kpiId)
      )?.btm_kpibusinessname,
    [kpiMap]
  );

  const activeConstraintFor = useCallback(
    (kpiId: string) => {
      const kpiNorm = normalizeLookupId(kpiId);
      const buNorm = normalizeLookupId(context.businessUnit);
      const rows = ceilings
        .filter((c) => {
          if (normalizeLookupId(c.pm_kpi) !== kpiNorm) return false;
          if (c.pm_isconstraint !== 'Enforced') return false;
          if (c.status === 'Superseded' || Number(c.statuscode) === 2) return false;
          if (buNorm && normalizeLookupId(c.pm_businessunit) !== buNorm) return false;
          return true;
        })
        .sort((a, b) => String(b.pm_effectivedate).localeCompare(String(a.pm_effectivedate)));
      const top = rows[0];
      if (!top) return undefined;
      if (top.pm_min == null && top.pm_max == null) return undefined;
      return { min: top.pm_min, max: top.pm_max };
    },
    [ceilings, context.businessUnit]
  );

  // ── Build Component Rows for Tester ──
  const buildTesterRows = useCallback(
    (model: FinancialModel): TesterComponentRow[] => {
      const terms =
        model.pm_modelid === selectedModelId ? selectedModelTerms : financialStore.getModelTerms(model.pm_modelid);
      const factors =
        model.pm_modelid === selectedModelId
          ? selectedModelFactors
          : financialStore.getRelationFactors(model.pm_modelid);

      const kpiIds =
        model.pm_modeltype === 'Equation'
          ? [...new Set(terms.filter((t) => t.pm_termtype === 'KPI' && t.pm_kpi).map((t) => t.pm_kpi!))]
          : [...new Set(factors.map((f) => f.pm_factorkpi))];

      const resultKpiId =
        model.pm_resultkind === 'KPI'
          ? normalizeLookupId(model.pm_calculatedkpi || model.pm_resultref)
          : '';

      const toRow = (kpiId: string, isCalculatedResult: boolean): TesterComponentRow => {
        const kpi =
          kpiMap.get(kpiId) ||
          [...kpiMap.values()].find(
            (k) => normalizeLookupId(k.strategy_kpisid) === normalizeLookupId(kpiId)
          );
        const fields = getAchievementFields(kpiId);
        const actual = fields.actual ?? null;
        const baseline = fields.baseline ?? null;
        const historical = fields.historical ?? null;
        const target = fields.target ?? null;
        const current = fields.actual ?? fields.baseline ?? 0;
        return {
          kpiId,
          kpiName: kpi?.btm_kpibusinessname ?? 'Unknown KPI',
          unit: kpi?.btm_unitofmeasure ?? '%',
          actualValue: actual,
          baselineValue: baseline,
          historicalValue: historical,
          targetValue: target,
          currentValue: current,
          ceiling: activeConstraintFor(kpiId),
          isPercentage: kpi?.strategy_aggregatetype === 'Percentage' || kpi?.btm_unitofmeasure === '%',
          isCalculatedResult,
        };
      };

      const rows = kpiIds.map((kpiId) => toRow(kpiId, false));

      const hasResultRow =
        Boolean(resultKpiId) &&
        rows.some((r) => normalizeLookupId(r.kpiId) === resultKpiId);
      if (resultKpiId && !hasResultRow) {
        const rawId = model.pm_calculatedkpi || model.pm_resultref;
        if (rawId) rows.push(toRow(rawId, true));
      }

      return rows;
    },
    [
      selectedModelId,
      selectedModelTerms,
      selectedModelFactors,
      kpiMap,
      getAchievementFields,
      activeConstraintFor,
    ]
  );

  // ── Working Days (pm_workingdays: selected BU + tester month + year) ──
  const getWorkingDays = useCallback(
    (month: number, year: number) => {
      const buId = context.businessUnit;
      if (!buId) return undefined;
      if (didLoadLive) {
        return findWorkingDaysCount(liveWorkingDays, buId, month, year);
      }
      return financialStore.getWorkingDays(buId, month, year);
    },
    [context.businessUnit, didLoadLive, liveWorkingDays]
  );

  // ── Org Data (live pm_orgoutputs / pm_orgoutcomes, or store fallback) ──
  const orgOutputs = useMemo(() => {
    const all = didLoadLive ? liveOrgOutputs : financialStore.getOrgOutputs();
    if (!context.region) return all;
    const regionName = regions.find((r) => r.regionid === context.region)?.name ?? '';
    const choice: RegionChoice | null = /egypt/i.test(regionName)
      ? 'Egypt'
      : /ksa|saudi/i.test(regionName)
        ? 'KSA'
        : null;
    if (!choice) return all;
    const filtered = all.filter((o) => !o.pm_region || o.pm_region === choice);
    return filtered.length > 0 ? filtered : all;
  }, [didLoadLive, liveOrgOutputs, context.region, regions]);

  const orgOutcomes = useMemo(
    () => (didLoadLive ? liveOrgOutcomes : financialStore.getOrgOutcomes()),
    [didLoadLive, liveOrgOutcomes]
  );
  const outputContributions = useMemo(
    () => (didLoadLive ? liveOutputContributions : financialStore.getOutputContributions()),
    [didLoadLive, liveOutputContributions]
  );
  const outcomeContributions = useMemo(
    () => (didLoadLive ? liveOutcomeContributions : financialStore.getOutcomeContributions()),
    [didLoadLive, liveOutcomeContributions]
  );

  // ── Review & Sealing (unfiltered — all models) ──
  const modelsAwaitingReview = useMemo(
    () => allModels.filter((m) => isAwaitingReviewModel(m)),
    [allModels]
  );

  const sealedModels = useMemo(
    () => allModels.filter((m) => isSealedModel(m)),
    [allModels]
  );

  // ── Builder mutations (local / store until Dataverse write is wired) ──
  const updateSelectedModel = useCallback(
    (updates: Partial<FinancialModel>) => {
      if (!selectedModelId) return;
      financialStore.updateModel(selectedModelId, updates);
      setLiveModels((prev) =>
        prev.map((m) => (m.pm_modelid === selectedModelId ? { ...m, ...updates } : m))
      );
      refresh();
    },
    [selectedModelId, refresh]
  );

  const setSelectedModelTerms = useCallback(
    (terms: ModelTerm[]) => {
      if (!selectedModelId) return;
      const withModel = terms.map((t, i) => ({
        ...t,
        pm_model: selectedModelId,
        pm_sequence: i + 1,
        pm_modeltermid: t.pm_modeltermid || `mt_${Date.now().toString(36)}_${i}`,
      }));
      setDraftTerms(withModel);
      financialStore.updateModelTerms(
        selectedModelId,
        withModel.map(({ pm_modeltermid: _id, pm_model: _m, ...rest }) => rest)
      );
      refresh();
    },
    [selectedModelId, refresh]
  );

  const setSelectedModelFactors = useCallback(
    (factors: RelationFactor[]) => {
      if (!selectedModelId) return;
      const withModel = factors.map((f) => ({
        ...f,
        pm_model: selectedModelId,
        pm_relationfactorid: f.pm_relationfactorid || `rf_${Date.now().toString(36)}`,
      }));
      setDraftFactors(withModel);
      financialStore.updateRelationFactors(
        selectedModelId,
        withModel.map(({ pm_relationfactorid: _id, pm_model: _m, ...rest }) => rest)
      );
      refresh();
    },
    [selectedModelId, refresh]
  );

  const switchSelectedModelType = useCallback(
    (type: ModelType) => {
      const resultName =
        selectedModel?.pm_resultrefname || selectedModel?.pm_calculatedkpiname;
      const currentName = String(selectedModel?.pm_name ?? '').trim();
      const previousGenerated = generatedModelName(resultName, selectedModel?.pm_modeltype);
      const nextName =
        !currentName || currentName === previousGenerated
          ? generatedModelName(resultName, type)
          : currentName;
      updateSelectedModel({
        pm_modeltype: type,
        pm_name: nextName,
      });
      if (type === 'Relation' && selectedModelFactors.length === 0) {
        const resultId = normalizeLookupId(
          selectedModel?.pm_calculatedkpi || selectedModel?.pm_resultref
        );
        const first = allKpis.find(
          (k) => normalizeLookupId(k.strategy_kpisid) !== resultId
        ) ?? allKpis[0];
        if (first && selectedModelId) {
          setSelectedModelFactors([
            {
              pm_relationfactorid: `rf_${Date.now().toString(36)}`,
              pm_model: selectedModelId,
              pm_factorkpi: first.strategy_kpisid,
              pm_direction: 'Increases',
              pm_inputpct: 10,
              pm_resultpct: 5,
            },
          ]);
        }
      }
    },
    [
      updateSelectedModel,
      selectedModel,
      selectedModelFactors.length,
      allKpis,
      selectedModelId,
      setSelectedModelFactors,
    ]
  );

  const toggleSelectedWorkingDays = useCallback(
    (v: YesNo) => updateSelectedModel({ pm_useworkingdays: v }),
    [updateSelectedModel]
  );

  const getResultBaseline = useCallback(
    (model: FinancialModel): number | null => {
      if (model.pm_resultkind !== 'KPI' || !model.pm_resultref) return null;
      const value = getAchievementFields(model.pm_resultref).baseline;
      return value == null ? null : value;
    },
    [getAchievementFields]
  );

  const createNewModel = useCallback((options?: { openBuilder?: boolean }): FinancialModel => {
    const kpis = didLoadLive ? liveKpis : financialStore.getKpis();
    const preferred = kpis[0];

    const functionName = allFunctions.find((f) => f.functionid === context.functionId)?.name;

    const created = financialStore.createModel({
      pm_name: generatedModelName(preferred?.btm_kpibusinessname, 'Relation'),
      pm_resultkind: 'KPI',
      pm_resultref: preferred?.strategy_kpisid || '',
      pm_resultrefname: preferred?.btm_kpibusinessname,
      pm_calculatedkpi: preferred?.strategy_kpisid || undefined,
      pm_calculatedkpiname: preferred?.btm_kpibusinessname,
      pm_scope: context.functionId || preferred?.strategy_function || '',
      pm_scopename: functionName,
      pm_modeltype: 'Relation',
      pm_modeltypevalue: PM_MODELTYPE_DRAFT,
      pm_useworkingdays: 'No',
      pm_version: '0.1',
      statuscode: 'Draft',
    });

    const factorKpi = kpis.find((k) => k.strategy_kpisid !== preferred?.strategy_kpisid);
    if (factorKpi) {
      const seeded = [
        {
          pm_factorkpi: factorKpi.strategy_kpisid,
          pm_direction: 'Increases' as const,
          pm_inputpct: 10,
          pm_resultpct: 5,
        },
      ];
      financialStore.updateRelationFactors(created.pm_modelid, seeded);
      setDraftFactors(
        seeded.map((s, i) => ({
          ...s,
          pm_relationfactorid: `rf_seed_${created.pm_modelid}_${i}`,
          pm_model: created.pm_modelid,
        }))
      );
    } else {
      setDraftFactors([]);
    }
    setDraftTerms([]);
    setLiveModels((prev) => {
      if (prev.some((m) => m.pm_modelid === created.pm_modelid)) return prev;
      return [...prev, created];
    });
    setSelectedModelId(created.pm_modelid);
    if (options?.openBuilder !== false) {
      setActiveTab('builder');
    }
    refresh();
    return created;
  }, [
    didLoadLive,
    liveKpis,
    allFunctions,
    context.functionId,
    refresh,
  ]);

  const setSelectedResult = useCallback(
    (kind: EntityKind, refId: string, refName?: string) => {
      const functionName = allFunctions.find((f) => f.functionid === context.functionId)?.name;
      const previousGenerated = generatedModelName(
        selectedModel?.pm_resultrefname,
        selectedModel?.pm_modeltype || 'Relation'
      );
      const currentName = String(selectedModel?.pm_name ?? '').trim();
      const nextGenerated = generatedModelName(refName, selectedModel?.pm_modeltype || 'Relation');
      const updates: Partial<FinancialModel> = {
        pm_resultkind: kind,
        pm_resultref: refId,
        pm_resultrefname: refName,
        pm_name:
          !currentName || currentName === previousGenerated ? nextGenerated : currentName,
        pm_scope: context.functionId || selectedModel?.pm_scope || '',
        pm_scopename: functionName,
      };
      if (kind === 'KPI') {
        updates.pm_calculatedkpi = refId;
        updates.pm_calculatedkpiname = refName;
        setSelectedModelTerms(stripResultKpiTerms(selectedModelTerms, refId));
        setSelectedModelFactors(stripResultKpiFactors(selectedModelFactors, refId));
      } else {
        updates.pm_calculatedkpi = '';
        updates.pm_calculatedkpiname = undefined;
      }
      if (kind === 'OrgOutput') {
        updates.pm_linkedoutput = refId;
        updates.pm_linkedoutputname = refName;
      }
      if (kind === 'OrgOutcome') {
        updates.pm_linkedoutcome = refId;
        updates.pm_linkedoutcomename = refName;
      }
      updateSelectedModel(updates);
    },
    [
      updateSelectedModel,
      allFunctions,
      context.functionId,
      selectedModel?.pm_scope,
      selectedModel?.pm_modeltype,
      selectedModelTerms,
      selectedModelFactors,
      setSelectedModelTerms,
      setSelectedModelFactors,
    ]
  );

  // When opening Builder with nothing selected, open a new draft form once.
  useEffect(() => {
    if (activeTab !== 'builder') return;
    if (selectedModelId) return;
    createNewModel({ openBuilder: false });
    // Intentionally omit createNewModel from deps — a changing callback must not retrigger create.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedModelId]);

  // ── Dataverse-connected Mutations ──
  const applyPersistedModel = useCallback(
    (
      previousId: string,
      result: {
        modelId: string;
        terms: ModelTerm[];
        factors?: RelationFactor[];
        model: FinancialModel;
      }
    ) => {
      financialStore.updateModel(previousId, result.model);

      setLiveModels((prev) => {
        const withoutOld = prev.filter(
          (m) => m.pm_modelid !== previousId && m.pm_modelid !== result.modelId
        );
        return [...withoutOld, result.model];
      });

      if (result.model.pm_modeltype === 'Equation') {
        if (previousId !== result.modelId) {
          financialStore.updateModelTerms(previousId, []);
        }
        setDraftTerms(result.terms);
        setLiveModelTerms((prev) => {
          const others = prev.filter(
            (t) => t.pm_model !== result.modelId && t.pm_model !== previousId
          );
          return [...others, ...result.terms];
        });
        financialStore.updateModelTerms(
          result.modelId,
          result.terms.map(({ pm_modeltermid: _id, pm_model: _m, ...rest }) => rest)
        );
      }

      if (result.model.pm_modeltype === 'Relation') {
        const factors = result.factors ?? [];
        if (previousId !== result.modelId) {
          financialStore.updateRelationFactors(previousId, []);
        }
        setDraftFactors(factors);
        setLiveRelationFactors((prev) => {
          const others = prev.filter(
            (f) => f.pm_model !== result.modelId && f.pm_model !== previousId
          );
          return [...others, ...factors];
        });
        financialStore.updateRelationFactors(
          result.modelId,
          factors.map(({ pm_relationfactorid: _id, pm_model: _m, ...rest }) => rest)
        );
      }

      setSelectedModelId(result.modelId);
      refresh();
    },
    [refresh]
  );

  /** Submit for review → pm_models + terms/factors */
  const submitSelectedForReview = useCallback(async (termsOverride?: ModelTerm[]): Promise<boolean> => {
    if (!selectedModel) {
      setSaveError('No model selected to submit.');
      return false;
    }
    const termsToSave = termsOverride ?? selectedModelTerms;
    if (selectedModel.pm_modeltype === 'Equation' && termsToSave.length === 0) {
      setSaveError('Add equation terms before submitting for review.');
      return false;
    }
    if (selectedModel.pm_modeltype === 'Equation' && equationMissingOperators(termsToSave)) {
      setSaveError('Add operators between equation components, or choose multiplication as the default.');
      return false;
    }
    if (selectedModel.pm_modeltype === 'Relation' && selectedModelFactors.length === 0) {
      setSaveError('Add relation factors before submitting for review.');
      return false;
    }

    setIsSavingModel(true);
    setSaveError(null);
    try {
      const previousId = selectedModel.pm_modelid;
      const result = await saveEquationModelToDataverse(
        selectedModel,
        termsToSave,
        'In Review',
        selectedModelFactors
      );
      applyPersistedModel(previousId, result);
      financialStore.submitForReview(result.modelId);
      setLiveModels((prev) =>
        prev.map((m) =>
          m.pm_modelid === result.modelId ? applyModelLifecycle(m, 'In Review') : m
        )
      );
      refresh();
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to submit model for review.';
      setSaveError(message);
      console.error('[useFinancialModeler] submitSelectedForReview:', err);
      return false;
    } finally {
      setIsSavingModel(false);
    }
  }, [selectedModel, selectedModelTerms, selectedModelFactors, applyPersistedModel, refresh]);

  const writeTesterProposalDrafts = useCallback(
    async (
      drafts: ProposalConflictDraft[],
      rewriteModelAsDraft: boolean,
      termsToSave: ModelTerm[]
    ): Promise<{ ok: boolean; conflictCount: number }> => {
      if (!selectedModel) {
        setSaveError('No model selected to save as proposal.');
        return { ok: false, conflictCount: 0 };
      }
      setIsSavingModel(true);
      setSaveError(null);
      try {
        let modelId = selectedModel.pm_modelid;
        if (rewriteModelAsDraft && !isSealedModel(selectedModel)) {
          const previousId = selectedModel.pm_modelid;
          const result = await saveEquationModelToDataverse(
            selectedModel,
            termsToSave,
            'Draft',
            selectedModelFactors
          );
          applyPersistedModel(previousId, {
            ...result,
            model: {
              ...result.model,
              statuscode: 'Draft',
              pm_modeltypevalue: PM_MODELTYPE_DRAFT,
            },
          });
          modelId = result.modelId;
        }

        const withModel = drafts.map((draft) => ({
          proposal: { ...draft.proposal, pm_sourcemodel: modelId },
          conflict: draft.conflict,
        }));
        const saved = await saveProposalsAndConflictsToDataverse(withModel);
        pendingTesterSaveRef.current = null;
        setPendingConflicts(null);
        setPendingSaveRewritesModel(false);
        refresh();
        return { ok: true, conflictCount: saved.conflictCount };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to save proposal to Dataverse.';
        setSaveError(message);
        console.error('[useFinancialModeler] writeTesterProposalDrafts:', err);
        return { ok: false, conflictCount: 0 };
      } finally {
        setIsSavingModel(false);
      }
    },
    [selectedModel, selectedModelFactors, applyPersistedModel, refresh]
  );

  /** Persist tester values as pm_proposal rows; raise linked pm_conflict rows when they disagree with existing targets. */
  const persistTesterProposals = useCallback(
    async (
      testValues: Record<string, number>,
      resultValue: number | undefined,
      options: {
        rewriteModelAsDraft: boolean;
        rollupRows?: OrgRollupRow[];
        equationTerms?: ModelTerm[];
      }
    ): Promise<{
      ok: boolean;
      conflictCount: number;
      awaitingConfirm?: boolean;
      blockedMessage?: string;
    }> => {
      if (!selectedModel) {
        setSaveError('No model selected to save as proposal.');
        return { ok: false, conflictCount: 0 };
      }
      const termsToSave = options.equationTerms ?? selectedModelTerms;
      if (selectedModel.pm_modeltype === 'Equation' && termsToSave.length === 0) {
        setSaveError('Add equation terms before saving as proposal.');
        return { ok: false, conflictCount: 0 };
      }
      if (
        options.rewriteModelAsDraft &&
        selectedModel.pm_modeltype === 'Equation' &&
        equationMissingOperators(termsToSave)
      ) {
        setSaveError('Add operators between equation components, or choose multiplication as the default.');
        return { ok: false, conflictCount: 0 };
      }
      if (selectedModel.pm_modeltype === 'Relation' && selectedModelFactors.length === 0) {
        setSaveError('Add relation factors before saving as proposal.');
        return { ok: false, conflictCount: 0 };
      }
      if (selectedModel.pm_modeltype === 'Relation') {
        const blocked = relationProposalBlockedMessage(
          selectedModelFactors,
          (kpiId) => getAchievementFields(kpiId),
          relationKpiName
        );
        if (blocked) {
          setSaveError(blocked);
          return { ok: false, conflictCount: 0, blockedMessage: blocked };
        }
      }
      if (!context.businessUnit || !context.department || !context.functionId) {
        setSaveError('Select BU, Department and Function in the filter bar before saving a proposal.');
        return { ok: false, conflictCount: 0 };
      }
      const deptName =
        allDepartments
          .find((d) => normalizeLookupId(d.departmentid) === normalizeLookupId(context.department))
          ?.name?.trim() || '';
      const fnRaw =
        allFunctions
          .find((f) => normalizeLookupId(f.functionid) === normalizeLookupId(context.functionId))
          ?.name?.trim() || '';
      const fnName = fnRaw.includes('/') ? fnRaw.split('/')[0].trim() : fnRaw;
      if (!deptName || !fnName) {
        setSaveError('Select BU, Department and Function in the filter bar before saving a proposal.');
        return { ok: false, conflictCount: 0 };
      }
      const deptFn = `${deptName} - ${fnName}`;

      setSaveError(null);
      try {
        const modelId = selectedModel.pm_modelid;

        const months = testerPeriod.fullYear
          ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
          : [testerPeriod.month];
        const buId = context.businessUnit;
        const buName = allBusinessUnits.find((b) => b.businessunitid === buId)?.name;
        const nowIso = new Date().toISOString();
        const proposedSource: TargetSource = 'FinancialModeler';
        const resultKpiId = normalizeLookupId(
          selectedModel.pm_calculatedkpi ||
            (selectedModel.pm_resultkind === 'KPI' ? selectedModel.pm_resultref : '')
        );
        const seen = new Set<string>();
        const drafts: ProposalConflictDraft[] = [];

        const pickCurrentVersion = (
          kind: EntityKind,
          entityId: string,
          month: number,
          year: number
        ): TargetVersion | undefined => {
          const entityNorm = normalizeLookupId(entityId);
          const buNorm = normalizeLookupId(buId);
          return liveTargetVersions.find((v) => {
            if (v.pm_iscurrent === 'No') return false;
            if (v.pm_month !== month || v.pm_year !== year) return false;
            if (buNorm && normalizeLookupId(v.pm_businessunit) !== buNorm) return false;
            if (kind === 'KPI') return normalizeLookupId(v.pm_kpi) === entityNorm;
            if (kind === 'OrgOutput') return normalizeLookupId(v.pm_orgoutput) === entityNorm;
            return normalizeLookupId(v.pm_orgoutcome) === entityNorm;
          });
        };

        const kpiAchievementOpts = (kpiId: string, month: number, year: number) => ({
          kpiId,
          kpiName: kpiMap.get(kpiId)?.btm_kpibusinessname,
          buId,
          month,
          year,
        });

        /** Tester conflict compare: Baseline, else Actual; fall back to target / target-version. */
        const kpiExistingForConflict = (kpiId: string, month: number, year: number) => {
          const baselineOrHist = pickKpiAchievementBaselineOrHistorical(
            achievements,
            kpiAchievementOpts(kpiId, month, year)
          );
          if (baselineOrHist) {
            return {
              value: baselineOrHist.value,
              source: 'Forecast' as TargetSource,
            };
          }
          const achTarget = pickKpiAchievementTarget(
            achievements,
            kpiAchievementOpts(kpiId, month, year)
          );
          const version = pickCurrentVersion('KPI', kpiId, month, year);
          return {
            value: achTarget ?? version?.pm_value,
            source: (achTarget != null
              ? version?.pm_source || 'TopDownMonthly'
              : version?.pm_source) as TargetSource | undefined,
            priorVersionId: version?.pm_targetversionid,
          };
        };

        const orgOutputTarget = (outputId: string, month: number, year: number) => {
          const idNorm = normalizeLookupId(outputId);
          const buNorm = normalizeLookupId(buId);
          const row = liveOrgOutputAchievements.find(
            (a) =>
              normalizeLookupId(a.pm_orgoutput) === idNorm &&
              a.pm_month === month &&
              a.pm_year === year &&
              (!buNorm || !a.pm_businessunit || normalizeLookupId(a.pm_businessunit) === buNorm)
          );
          return row?.pm_target;
        };

        const orgOutcomeTarget = (outcomeId: string, month: number, year: number) => {
          const idNorm = normalizeLookupId(outcomeId);
          const buNorm = normalizeLookupId(buId);
          const row = liveOrgOutcomeAchievements.find(
            (a) =>
              normalizeLookupId(a.pm_orgoutcome) === idNorm &&
              a.pm_month === month &&
              a.pm_year === year &&
              (!buNorm || !a.pm_businessunit || normalizeLookupId(a.pm_businessunit) === buNorm)
          );
          return row?.pm_target;
        };

        const pushDraft = (
          proposal: Omit<Proposal, 'pm_proposalid'>,
          existing: { value?: number | null; source?: TargetSource; priorVersionId?: string }
        ) => {
          const key = [
            proposal.pm_entitykind,
            normalizeLookupId(proposal.pm_kpi || proposal.pm_orgoutput || proposal.pm_orgoutcome),
            proposal.pm_month,
            proposal.pm_year,
          ].join('|');
          if (seen.has(key)) return;
          seen.add(key);

          const hasConflict = valuesConflict(proposal.pm_proposedvalue, existing.value);
          const nextProposal: Omit<Proposal, 'pm_proposalid'> = {
            ...proposal,
            pm_hasconflict: hasConflict ? 'Yes' : 'No',
          };
          const conflict: Conflict | undefined = hasConflict
            ? {
                pm_conflictid: '',
                pm_entitykind: proposal.pm_entitykind,
                pm_kpi: proposal.pm_kpi,
                pm_kpiname: proposal.pm_kpiname,
                pm_orgoutput: proposal.pm_orgoutput,
                pm_orgoutputname: proposal.pm_orgoutputname,
                pm_orgoutcome: proposal.pm_orgoutcome,
                pm_orgoutcomename: proposal.pm_orgoutcomename,
                pm_businessunit: proposal.pm_businessunit,
                pm_businessunitname: proposal.pm_businessunitname,
                pm_month: proposal.pm_month,
                pm_year: proposal.pm_year,
                pm_existingvalue: Number(existing.value),
                pm_proposedvalue: proposal.pm_proposedvalue,
                pm_existingsource: existing.source || 'TopDownMonthly',
                pm_proposedsource: proposedSource,
                pm_conflicttype: 'ModelBuilderVsOrgKpi',
                pm_priorversion: existing.priorVersionId,
                pm_raisedon: nowIso,
                statuscode: 'Open',
              }
            : undefined;

          drafts.push({
            proposal: nextProposal,
            conflict: conflict
              ? (({ pm_conflictid: _id, ...rest }) => rest)(conflict)
              : undefined,
          });
        };

        for (const mo of months) {
          if (resultValue != null && Number.isFinite(resultValue)) {
            if (selectedModel.pm_resultkind === 'OrgOutput' && selectedModel.pm_resultref) {
              const version = pickCurrentVersion('OrgOutput', selectedModel.pm_resultref, mo, testerPeriod.year);
              pushDraft(
                {
                  pm_entitykind: 'OrgOutput',
                  pm_orgoutput: selectedModel.pm_resultref,
                  pm_orgoutputname: selectedModel.pm_resultrefname,
                  pm_businessunit: buId,
                  pm_businessunitname: buName,
                  pm_month: mo,
                  pm_year: testerPeriod.year,
                  pm_proposedvalue: resultValue,
                  pm_source: proposedSource,
                  pm_hasconflict: 'No',
                  statuscode: 'Active',
                  pm_sourcemodel: modelId,
                  pm_deptfunction: deptFn,
                },
                {
                  value: version?.pm_value ?? orgOutputTarget(selectedModel.pm_resultref, mo, testerPeriod.year),
                  source: version?.pm_source,
                  priorVersionId: version?.pm_targetversionid,
                }
              );
            } else if (selectedModel.pm_resultkind === 'OrgOutcome' && selectedModel.pm_resultref) {
              const version = pickCurrentVersion('OrgOutcome', selectedModel.pm_resultref, mo, testerPeriod.year);
              pushDraft(
                {
                  pm_entitykind: 'OrgOutcome',
                  pm_orgoutcome: selectedModel.pm_resultref,
                  pm_orgoutcomename: selectedModel.pm_resultrefname,
                  pm_businessunit: buId,
                  pm_businessunitname: buName,
                  pm_month: mo,
                  pm_year: testerPeriod.year,
                  pm_proposedvalue: resultValue,
                  pm_source: proposedSource,
                  pm_hasconflict: 'No',
                  statuscode: 'Active',
                  pm_sourcemodel: modelId,
                  pm_deptfunction: deptFn,
                },
                {
                  value: version?.pm_value ?? orgOutcomeTarget(selectedModel.pm_resultref, mo, testerPeriod.year),
                  source: version?.pm_source,
                  priorVersionId: version?.pm_targetversionid,
                }
              );
            } else {
              const kpiId = selectedModel.pm_calculatedkpi || selectedModel.pm_resultref;
              if (kpiId) {
                const existing = kpiExistingForConflict(kpiId, mo, testerPeriod.year);
                pushDraft(
                  {
                    pm_entitykind: 'KPI',
                    pm_kpi: kpiId,
                    pm_kpiname:
                      kpiMap.get(kpiId)?.btm_kpibusinessname ||
                      selectedModel.pm_calculatedkpiname ||
                      selectedModel.pm_resultrefname,
                    pm_businessunit: buId,
                    pm_businessunitname: buName,
                    pm_month: mo,
                    pm_year: testerPeriod.year,
                    pm_proposedvalue: resultValue,
                    pm_source: proposedSource,
                    pm_hasconflict: 'No',
                    statuscode: 'Active',
                    pm_sourcemodel: modelId,
                    pm_deptfunction: deptFn,
                  },
                  existing
                );
              }
            }
          }

          for (const [kpiId, value] of Object.entries(testValues)) {
            if (resultKpiId && normalizeLookupId(kpiId) === resultKpiId) continue;
            const existing = kpiExistingForConflict(kpiId, mo, testerPeriod.year);
            pushDraft(
              {
                pm_entitykind: 'KPI',
                pm_kpi: kpiId,
                pm_kpiname: kpiMap.get(kpiId)?.btm_kpibusinessname,
                pm_businessunit: buId,
                pm_businessunitname: buName,
                pm_month: mo,
                pm_year: testerPeriod.year,
                pm_proposedvalue: value,
                pm_source: proposedSource,
                pm_hasconflict: 'No',
                statuscode: 'Active',
                pm_sourcemodel: modelId,
                pm_deptfunction: deptFn,
              },
              existing
            );
          }

          if (resultValue != null && Number.isFinite(resultValue)) {
            for (const row of options.rollupRows ?? []) {
              if (row.kind === 'Output') {
                const version = pickCurrentVersion('OrgOutput', row.orgEntityId, mo, testerPeriod.year);
                pushDraft(
                  {
                    pm_entitykind: 'OrgOutput',
                    pm_orgoutput: row.orgEntityId,
                    pm_orgoutputname: row.orgEntityName,
                    pm_businessunit: buId,
                    pm_businessunitname: buName,
                    pm_month: mo,
                    pm_year: testerPeriod.year,
                    pm_proposedvalue: row.projectedValue ?? resultValue,
                    pm_source: proposedSource,
                    pm_hasconflict: 'No',
                    statuscode: 'Active',
                    pm_sourcemodel: modelId,
                    pm_deptfunction: deptFn,
                  },
                  {
                    value: version?.pm_value ?? orgOutputTarget(row.orgEntityId, mo, testerPeriod.year) ?? row.existingTarget,
                    source: version?.pm_source,
                    priorVersionId: version?.pm_targetversionid,
                  }
                );
              } else {
                const version = pickCurrentVersion('OrgOutcome', row.orgEntityId, mo, testerPeriod.year);
                pushDraft(
                  {
                    pm_entitykind: 'OrgOutcome',
                    pm_orgoutcome: row.orgEntityId,
                    pm_orgoutcomename: row.orgEntityName,
                    pm_businessunit: buId,
                    pm_businessunitname: buName,
                    pm_month: mo,
                    pm_year: testerPeriod.year,
                    pm_proposedvalue: row.projectedValue ?? resultValue,
                    pm_source: proposedSource,
                    pm_hasconflict: 'No',
                    statuscode: 'Active',
                    pm_sourcemodel: modelId,
                    pm_deptfunction: deptFn,
                  },
                  {
                    value: version?.pm_value ?? orgOutcomeTarget(row.orgEntityId, mo, testerPeriod.year) ?? row.existingTarget,
                    source: version?.pm_source,
                    priorVersionId: version?.pm_targetversionid,
                  }
                );
              }
            }
          }
        }

        const conflicts = conflictPreviewsFromDrafts(drafts);
        if (conflicts.length > 0) {
          pendingTesterSaveRef.current = {
            drafts,
            rewriteModelAsDraft: options.rewriteModelAsDraft,
            termsToSave,
          };
          setPendingSaveRewritesModel(options.rewriteModelAsDraft);
          setPendingConflicts(conflicts);
          return { ok: true, awaitingConfirm: true, conflictCount: conflicts.length };
        }

        return await writeTesterProposalDrafts(drafts, options.rewriteModelAsDraft, termsToSave);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to save proposal to Dataverse.';
        setSaveError(message);
        console.error('[useFinancialModeler] persistTesterProposals:', err);
        return { ok: false, conflictCount: 0 };
      }
    },
    [
      selectedModel,
      selectedModelTerms,
      selectedModelFactors,
      allModels,
      testerPeriod,
      context.businessUnit,
      context.department,
      context.functionId,
      allBusinessUnits,
      allDepartments,
      allFunctions,
      liveTargetVersions,
      liveOrgOutputAchievements,
      liveOrgOutcomeAchievements,
      achievements,
      kpiMap,
      getAchievementFields,
      relationKpiName,
      writeTesterProposalDrafts,
    ]
  );

  const confirmPendingTesterSave = useCallback(async (): Promise<{
    ok: boolean;
    conflictCount: number;
  }> => {
    const pending = pendingTesterSaveRef.current;
    if (!pending) return { ok: false, conflictCount: 0 };
    return writeTesterProposalDrafts(
      pending.drafts,
      pending.rewriteModelAsDraft,
      pending.termsToSave
    );
  }, [writeTesterProposalDrafts]);

  const cancelPendingTesterSave = useCallback(() => {
    pendingTesterSaveRef.current = null;
    setPendingConflicts(null);
    setPendingSaveRewritesModel(false);
  }, []);

  /** Save as proposal → pm_models (Draft) + terms/factors + pm_proposal test values */
  const saveSelectedAsProposal = useCallback(
    async (
      testValues: Record<string, number>,
      resultValue?: number,
      rollupRows?: OrgRollupRow[],
      equationTerms?: ModelTerm[]
    ): Promise<{
      ok: boolean;
      conflictCount: number;
      awaitingConfirm?: boolean;
      blockedMessage?: string;
    }> => {
      return persistTesterProposals(testValues, resultValue, {
        rewriteModelAsDraft: true,
        rollupRows,
        equationTerms,
      });
    },
    [persistTesterProposals]
  );

  /** Sealed model "Save as proposal" still writes pm_proposal rows and raises linked conflicts (does not rewrite the sealed model). */
  const saveSelectedAsTarget = useCallback(
    async (
      testValues: Record<string, number>,
      resultValue?: number,
      rollupRows?: OrgRollupRow[]
    ): Promise<{ ok: boolean; conflictCount: number; awaitingConfirm?: boolean }> => {
      return persistTesterProposals(testValues, resultValue, {
        rewriteModelAsDraft: false,
        rollupRows,
      });
    },
    [persistTesterProposals]
  );

  const submitForReview = useCallback(
    (modelId: string) => {
      financialStore.submitForReview(modelId);
      setLiveModels((prev) =>
        prev.map((m) =>
          m.pm_modelid === modelId
            ? { ...m, statuscode: 'In Review', pm_modeltypevalue: PM_MODELTYPE_UNDER_REVIEW }
            : m
        )
      );
      refresh();
    },
    [refresh]
  );

  const patchLiveModel = useCallback((modelId: string, next: FinancialModel) => {
    setLiveModels((prev) => prev.map((m) => (m.pm_modelid === modelId ? next : m)));
    financialStore.updateModel(modelId, {
      statuscode: next.statuscode,
      pm_modeltypevalue: next.pm_modeltypevalue,
      statusLabel: next.statusLabel,
    });
    refresh();
  }, [refresh]);

  const approveModel = useCallback(
    async (modelId: string) => {
      if (activeRole !== 'Finance') {
        setSaveError('Only Finance can approve and seal models.');
        return;
      }
      const current =
        liveModels.find((m) => m.pm_modelid === modelId) ||
        financialStore.getModels().find((m) => m.pm_modelid === modelId);
      if (!current) return;

      if (isSealedModel(current)) {
        setSaveError('This model is already sealed.');
        return;
      }

      // Finance Approve seals the model (Approved By Finance → Sealed).
      const nextStatus = 'Sealed' as const;
      const next = applyModelLifecycle(current, nextStatus);
      const previous = current;
      setSaveError(null);
      setIsReviewing(true);
      patchLiveModel(modelId, next);
      financialStore.sealModel(modelId);
      try {
        await updateModelLifecycleInDataverse(modelId, nextStatus);
      } catch (err) {
        patchLiveModel(modelId, previous);
        setSaveError(err instanceof Error ? err.message : 'Failed to approve and seal model.');
      } finally {
        setIsReviewing(false);
      }
    },
    [activeRole, liveModels, patchLiveModel]
  );

  const returnModel = useCallback(
    async (modelId: string) => {
      if (activeRole !== 'Finance' && activeRole !== 'BI') {
        setSaveError('Only Finance or BI can return a model.');
        return;
      }
      const current =
        liveModels.find((m) => m.pm_modelid === modelId) ||
        financialStore.getModels().find((m) => m.pm_modelid === modelId);
      if (!current) return;
      if (isSealedModel(current)) {
        setSaveError('Sealed models cannot be returned.');
        return;
      }
      const next = applyModelLifecycle(current, 'Draft');
      const previous = current;
      setSaveError(null);
      setIsReviewing(true);
      patchLiveModel(modelId, next);
      financialStore.returnModel(modelId);
      try {
        await updateModelLifecycleInDataverse(modelId, 'Draft');
      } catch (err) {
        patchLiveModel(modelId, previous);
        setSaveError(err instanceof Error ? err.message : 'Failed to return model to Draft.');
      } finally {
        setIsReviewing(false);
      }
    },
    [activeRole, liveModels, patchLiveModel]
  );

  const sealModel = useCallback(
    async (modelId: string) => {
      // Kept for compatibility — Finance Approve now seals directly.
      return approveModel(modelId);
    },
    [approveModel]
  );

  const saveTarget = useCallback(
    (kpiId: string, month: number, year: number, value: number) => {
      financialStore.saveTarget(kpiId, context.businessUnit, month, year, value);
      refresh();
    },
    [context.businessUnit, refresh]
  );

  const saveProposal = useCallback(
    (proposal: Omit<Proposal, 'pm_proposalid'>) => {
      financialStore.saveProposal(proposal);
      refresh();
    },
    [refresh]
  );

  /** Add Ceiling with instant UI rendering + live Dataverse write */
  const addCeiling = useCallback(
    async (ceiling: Omit<KpiCeiling, 'pm_kpiceilingid'>) => {
      const tempId = 'c_' + Date.now().toString(36);
      const kpiName = allKpis.find((k) => k.strategy_kpisid === ceiling.pm_kpi)?.btm_kpibusinessname;
      const buName = allBusinessUnits.find((b) => b.businessunitid === ceiling.pm_businessunit)?.name;
      const newRecord: KpiCeiling = {
        ...ceiling,
        pm_kpiceilingid: tempId,
        pm_kpiname: kpiName,
        pm_businessunitname: buName,
      };

      setSaveError(null);
      setLiveCeilings((prev) =>
        reconcileCeilingStatuses([...prev, { ...newRecord, status: 'Active', statuscode: 1 }])
      );
      financialStore.addCeiling({ ...newRecord, status: 'Active', statuscode: 1 });
      refresh();

      try {
        const generatedId = await saveCeilingToDataverse({
          ...ceiling,
          pm_kpiname: kpiName,
          pm_businessunitname: buName,
        });
        if (generatedId && generatedId !== tempId) {
          setLiveCeilings((prev) =>
            reconcileCeilingStatuses(
              prev.map((c) => (c.pm_kpiceilingid === tempId ? { ...c, pm_kpiceilingid: generatedId } : c))
            )
          );
        }

        const fresh = await fetchCeilingsFromDataverse();
        const reconciled = reconcileCeilingStatuses(fresh.length > 0 ? fresh : []);
        setLiveCeilings(reconciled);
        await persistCeilingStatusReconciliation(fresh, reconciled);
        setDidLoadLive(true);
      } catch (err) {
        console.error('[useFinancialModeler] Error saving ceiling to Dataverse:', err);
        setLiveCeilings((prev) => prev.filter((c) => c.pm_kpiceilingid !== tempId));
        setSaveError(err instanceof Error ? err.message : 'Failed to save constraint to Dataverse.');
      }
    },
    [refresh, allKpis, allBusinessUnits]
  );

  /** Remove Ceiling with instant UI rendering + live Dataverse delete */
  const removeCeiling = useCallback(
    async (ceilingId: string) => {
      const previous = liveCeilings;
      setSaveError(null);
      setLiveCeilings((prev) => prev.filter((c) => c.pm_kpiceilingid !== ceilingId));
      financialStore.removeCeiling(ceilingId);
      refresh();

      try {
        await deleteCeilingFromDataverse(ceilingId);
      } catch (err) {
        console.error('[useFinancialModeler] Error deleting ceiling from Dataverse:', err);
        setLiveCeilings(previous);
        setSaveError(err instanceof Error ? err.message : 'Failed to delete constraint from Dataverse.');
      }
    },
    [refresh, liveCeilings]
  );

  /** Update Ceiling with instant UI rendering + live Dataverse update */
  const updateCeiling = useCallback(
    async (ceilingId: string, updates: Partial<KpiCeiling>) => {
      const previous = liveCeilings;
      setSaveError(null);
      const next = reconcileCeilingStatuses(
        previous.map((c) => {
          if (c.pm_kpiceilingid !== ceilingId) return c;
          const merged = { ...c, ...updates };
          if (isSupersededCeiling(merged) && updates.pm_isconstraint === 'Enforced') {
            return { ...merged, pm_isconstraint: 'Off' as const };
          }
          return merged;
        })
      );
      setLiveCeilings(next);
      financialStore.updateCeiling(ceilingId, updates);
      refresh();

      try {
        const { status: _status, statuscode: _statuscode, ...fieldUpdates } = updates;
        if (Object.keys(fieldUpdates).length > 0) {
          await updateCeilingInDataverse(ceilingId, fieldUpdates);
        }
        await persistCeilingStatusReconciliation(previous, next);
      } catch (err) {
        console.error('[useFinancialModeler] Error updating ceiling in Dataverse:', err);
        setLiveCeilings(previous);
        setSaveError(err instanceof Error ? err.message : 'Failed to update constraint in Dataverse.');
      }
    },
    [refresh, liveCeilings]
  );

  const getOrgLinks = useCallback(
    (model: FinancialModel): OrgLinkInfo[] => {
      const links: OrgLinkInfo[] = [];
      const outputId =
        model.pm_linkedoutput ||
        (model.pm_resultkind === 'OrgOutput' ? model.pm_resultref : '');
      const outcomeId =
        model.pm_linkedoutcome ||
        (model.pm_resultkind === 'OrgOutcome' ? model.pm_resultref : '');

      if (outputId) {
        const name =
          model.pm_linkedoutputname ||
          (model.pm_resultkind === 'OrgOutput' ? model.pm_resultrefname : undefined) ||
          orgOutputs.find(
            (o) => normalizeLookupId(o.pm_orgoutputid) === normalizeLookupId(outputId)
          )?.pm_name;
        links.push({ kind: 'Output', name: name || 'Org Output' });
      }

      if (outcomeId) {
        const name =
          model.pm_linkedoutcomename ||
          (model.pm_resultkind === 'OrgOutcome' ? model.pm_resultrefname : undefined) ||
          orgOutcomes.find(
            (o) => normalizeLookupId(o.pm_orgoutcomeid) === normalizeLookupId(outcomeId)
          )?.pm_name;
        links.push({ kind: 'Outcome', name: name || 'Org Outcome' });
      }

      return links;
    },
    [orgOutputs, orgOutcomes]
  );

  const getOrgLinkedOutputName = useCallback(
    (modelId: string) => {
      const live = allModels.find((m) => m.pm_modelid === modelId);
      if (!live) return financialStore.getOrgLinkedOutputName(modelId);
      return getOrgLinks(live)[0]?.name;
    },
    [allModels, getOrgLinks]
  );

  const getResultKpiName = useCallback(
    (model: FinancialModel): string => {
      let base: string;
      if (model.pm_resultkind === 'KPI') {
        base =
          kpiMap.get(model.pm_calculatedkpi || model.pm_resultref)?.btm_kpibusinessname ||
          model.pm_calculatedkpiname ||
          model.pm_resultrefname ||
          model.pm_name ||
          'Unknown';
      } else {
        const outputs = financialStore.getOrgOutputs();
        const outcomes = financialStore.getOrgOutcomes();
        const out = outputs.find((o) => o.pm_orgoutputid === model.pm_resultref);
        const oc = outcomes.find((o) => o.pm_orgoutcomeid === model.pm_resultref);
        base = out?.pm_name || oc?.pm_name || model.pm_resultrefname || model.pm_name || 'Unknown';
      }
      return generatedModelName(base, model.pm_modeltype);
    },
    [kpiMap]
  );

  const getOrgRollup = useCallback(
    (model: FinancialModel, newResultVal: number): OrgRollupRow[] => {
      const kpiId = model.pm_calculatedkpi || (model.pm_resultkind === 'KPI' ? model.pm_resultref : '');
      if (!kpiId) return [];

      const kpiNorm = normalizeLookupId(kpiId);
      const buNorm = normalizeLookupId(context.businessUnit);
      const kpiName = (
        kpiMap.get(kpiId)?.btm_kpibusinessname ||
        model.pm_calculatedkpiname ||
        model.pm_resultrefname ||
        getResultKpiName(model)
      ).trim();
      const kpiNameLc = kpiName.toLowerCase();

      const matchesSource = (sourceId: string, sourceName?: string) => {
        if (kpiNorm && normalizeLookupId(sourceId) === kpiNorm) return true;
        return Boolean(kpiNameLc && sourceName && sourceName.trim().toLowerCase() === kpiNameLc);
      };

      const matchesBu = (rowBu: string) => {
        if (!buNorm) return true;
        if (!rowBu) return true;
        return normalizeLookupId(rowBu) === buNorm;
      };

      const pickOrgAch = <T extends { pm_businessunit: string; pm_month: number; pm_year: number }>(
        list: T[],
        idMatch: (row: T) => boolean
      ): T | undefined => {
        const pool = list.filter((row) => {
          if (!idMatch(row)) return false;
          return matchesBu(row.pm_businessunit);
        });
        if (pool.length === 0) return undefined;
        const month = testerPeriod.month;
        const year = testerPeriod.year;
        const scored = [...pool].sort((a, b) => {
          const sa = (a.pm_year === year ? 8 : 0) + (!testerPeriod.fullYear && a.pm_month === month ? 8 : 0);
          const sb = (b.pm_year === year ? 8 : 0) + (!testerPeriod.fullYear && b.pm_month === month ? 8 : 0);
          return sb - sa;
        });
        return scored[0];
      };

      const kpiFields = getAchievementFields(kpiId);
      const kpiNow = kpiFields.actual ?? kpiFields.baseline ?? 0;
      const round2 = (n: number) => Math.round(n * 100) / 100;

      const buildRow = (opts: {
        id: string;
        name: string;
        kind: 'Output' | 'Outcome';
        weight: number;
        current: number | null;
        target: number | null;
      }): OrgRollupRow => {
        const w = (opts.weight || 0) / 100;
        const current = opts.current;
        const projected =
          current != null
            ? current + (newResultVal - kpiNow) * w
            : newResultVal * w;
        const delta = current != null ? projected - current : (newResultVal - kpiNow) * w;
        const conflict =
          opts.target != null && projected != null && Math.abs(projected - opts.target) > 0.5;
        return {
          orgEntityId: opts.id,
          orgEntityName: opts.name,
          kind: opts.kind,
          linkNote: `${kpiName} is ${opts.weight}% of ${opts.name}`,
          weightPct: opts.weight,
          currentValue: current,
          projectedValue: round2(projected),
          existingTarget: opts.target,
          conflict,
          delta: round2(delta),
          deltaPct: current ? (delta / current) * 100 : 0,
        };
      };

      const rows: OrgRollupRow[] = [];

      for (const link of outputContributions) {
        if (!matchesSource(link.pm_sourcekpi, link.pm_sourcekpiname)) continue;
        if (!matchesBu(link.pm_businessunit)) continue;
        const entity =
          orgOutputs.find((o) => normalizeLookupId(o.pm_orgoutputid) === normalizeLookupId(link.pm_targetoutput))
            ?.pm_name ||
          link.pm_targetoutputname ||
          'Org Output';
        const ach = pickOrgAch(
          liveOrgOutputAchievements,
          (a) => normalizeLookupId(a.pm_orgoutput) === normalizeLookupId(link.pm_targetoutput)
        );
        rows.push(
          buildRow({
            id: link.pm_targetoutput || link.pm_outputcontributionid,
            name: entity,
            kind: 'Output',
            weight: link.pm_weightpct,
            current: ach?.pm_actual ?? ach?.pm_baseline ?? null,
            target: ach?.pm_target ?? null,
          })
        );
      }

      for (const link of outcomeContributions) {
        if (!matchesSource(link.pm_sourcekpi, link.pm_sourcekpiname)) continue;
        if (!matchesBu(link.pm_businessunit)) continue;
        const entity =
          orgOutcomes.find((o) => normalizeLookupId(o.pm_orgoutcomeid) === normalizeLookupId(link.pm_targetoutcome))
            ?.pm_name ||
          link.pm_targetoutcomename ||
          'Org Outcome';
        const ach = pickOrgAch(
          liveOrgOutcomeAchievements,
          (a) => normalizeLookupId(a.pm_orgoutcome) === normalizeLookupId(link.pm_targetoutcome)
        );
        rows.push(
          buildRow({
            id: link.pm_targetoutcome || link.pm_outcomecontributionid,
            name: entity,
            kind: 'Outcome',
            weight: link.pm_weightpct,
            current: ach?.pm_actual ?? ach?.pm_baseline ?? null,
            target: ach?.pm_target ?? null,
          })
        );
      }

      return rows;
    },
    [
      context.businessUnit,
      getAchievementFields,
      getResultKpiName,
      kpiMap,
      outputContributions,
      outcomeContributions,
      orgOutputs,
      orgOutcomes,
      liveOrgOutputAchievements,
      liveOrgOutcomeAchievements,
      testerPeriod.month,
      testerPeriod.year,
      testerPeriod.fullYear,
    ]
  );

  const getModelDefinition = useCallback(
    (model: FinancialModel): string => {
      if (model.pm_modeltype === 'Equation') {
        const terms =
          model.pm_modelid === selectedModelId
            ? selectedModelTerms
            : liveModelTerms.filter((t) => t.pm_model === model.pm_modelid).length > 0
              ? liveModelTerms
                  .filter((t) => t.pm_model === model.pm_modelid)
                  .sort((a, b) => a.pm_sequence - b.pm_sequence)
              : financialStore.getModelTerms(model.pm_modelid);
        return terms
          .map((t) => {
            if (t.pm_termtype === 'KPI') {
              return kpiMap.get(t.pm_kpi!)?.btm_kpibusinessname ?? '?';
            }
            if (t.pm_termtype === 'Operator') return ` ${t.pm_operator} `;
            if (t.pm_termtype === 'Constant') return String(t.pm_constant);
            if (t.pm_termtype === 'Bracket') return t.pm_operator === ')' ? ')' : '(';
            return '';
          })
          .join('');
      } else {
        const factors =
          model.pm_modelid === selectedModelId
            ? selectedModelFactors
            : liveRelationFactors.filter((f) => f.pm_model === model.pm_modelid).length > 0
              ? liveRelationFactors.filter((f) => f.pm_model === model.pm_modelid)
              : financialStore.getRelationFactors(model.pm_modelid);
        return factors
          .map((f) => {
            const name = kpiMap.get(f.pm_factorkpi)?.btm_kpibusinessname ?? '?';
            const dir = f.pm_direction === 'Increases' ? '↑' : '↓';
            return `${name} ${dir}${f.pm_inputpct}% → ${f.pm_resultpct}%`;
          })
          .join(', ');
      }
    },
    [kpiMap, selectedModelId, selectedModelTerms, selectedModelFactors, liveModelTerms, liveRelationFactors]
  );

  return {
    // State
    context,
    setContext,
    activeRole,
    activeTab,
    setActiveTab,
    selectedModelId,
    setSelectedModelId,

    // Reference Data (Dataverse Live with Fallback)
    regions,
    businessUnits,
    allBusinessUnits,
    departments,
    allDepartments,
    functions,
    allFunctions,
    allKpis,
    filteredKpis,
    kpiMap,
    isLoadingLive,
    isSavingModel,
    isReviewing,
    saveError,
    isDataverse: isDataverseEnvironment(),

    // Models
    models: allModels,
    selectedModel,
    selectedModelTerms,
    selectedModelFactors,

    // Achievements
    achievements,
    getAchievementValue,
    getAchievementFields,
    kpiHasRelationSource,
    testContextReady: contextComplete,
    missingTestFilters: [
      !context.region ? 'Region' : '',
      !context.businessUnit ? 'BU' : '',
      !context.department ? 'Department' : '',
      !context.functionId ? 'Function' : '',
    ].filter(Boolean),

    // Tester / Builder
    buildTesterRows,
    testerPeriod,
    setTesterPeriod,
    setSelectedModelTerms,
    setSelectedModelFactors,
    switchSelectedModelType,
    toggleSelectedWorkingDays,
    getResultBaseline,
    setSelectedResult,
    createNewModel,
    updateSelectedModel,

    // Ceilings (Dataverse Live)
    ceilings: filteredCeilings,
    allCeilings: ceilings,

    // Working Days
    getWorkingDays,

    // Org
    orgOutputs,
    orgOutcomes,
    outputContributions,
    outcomeContributions,

    // Review
    modelsAwaitingReview,
    sealedModels,

    // Mutations
    submitSelectedForReview,
    saveSelectedAsProposal,
    saveSelectedAsTarget,
    pendingConflicts,
    pendingSaveRewritesModel,
    confirmPendingTesterSave,
    cancelPendingTesterSave,
    submitForReview,
    approveModel,
    returnModel,
    sealModel,
    saveTarget,
    saveProposal,
    addCeiling,
    removeCeiling,
    updateCeiling,
    loadDataverseData,

    // Helpers
    getOrgLinkedOutputName,
    getOrgLinks,
    getResultKpiName,
    getModelDefinition,
    getOrgRollup,
    refresh,
  };
}
