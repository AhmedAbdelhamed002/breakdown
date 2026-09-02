import { useState, useEffect, useMemo } from 'react';
import { BaseEntity, EntityService } from '../services/EntityService';
import { AchievementService, AchievementRecord } from '../services/AchievementService';
import { FinancialModel, ModelService } from '@infrastructure/financialImpact/ModelService';
import { AnnualForecastService, YearFigures } from '../services/AnnualForecastService';
import { RollUpRow, RollUpService } from '../services/RollUpService';
import { EvalContext } from '@infrastructure/financialImpact/ModelEvalService';
import { LedgerService } from '@infrastructure/financialImpact/LedgerService';

export const useAnnualForecast = (initialBuId: string, initialYear: number) => {
  const [businessUnitId, setBusinessUnitId] = useState<string>(initialBuId);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [functionId, setFunctionId] = useState<string>('');
  const [year, setYear] = useState<number>(initialYear);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);

  /** Org Outcomes and Org Outputs — no department/function of their own, so never scoped. */
  const [orgEntities, setOrgEntities] = useState<BaseEntity[]>([]);
  /**
   * Every KPI, unscoped. Only used to evaluate a model — a component KPI can sit outside the
   * selected department/function and still needs its Percentage flag, so this must not be
   * narrowed to what the picker is showing.
   */
  const [allKpis, setAllKpis] = useState<BaseEntity[]>([]);
  /** The KPIs the picker offers: strategy_kpises for the selected Department + Function. */
  const [scopedKpis, setScopedKpis] = useState<BaseEntity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<BaseEntity | null>(null);
  /**
   * The selected entity's figures for the chosen BU and year, rolled up from its ledger — null
   * until an entity is picked, and `hasRecord: false` when the BU has nothing recorded that year.
   */
  const [selectedEntityFigures, setSelectedEntityFigures] = useState<YearFigures | null>(null);
  /**
   * Each month's approved target for the selected entity and business unit, keyed by month number —
   * pm_target on its achievement row, null where the month has none. Shown under the projected
   * close so each month's projection can be read against what is already approved for it.
   */
  const [monthlyTargets, setMonthlyTargets] = useState<Record<number, number | null>>({});
  const [achievements, setAchievements] = useState<AchievementRecord[]>([]);
  // Prior calendar year's records — needed so "Last 12 months" can roll back across the year boundary.
  const [priorYearAchievements, setPriorYearAchievements] = useState<AchievementRecord[]>([]);
  const [models, setModels] = useState<FinancialModel[]>([]);

  const [rollUpRows, setRollUpRows] = useState<RollUpRow[]>([]);
  const [rollUpLoading, setRollUpLoading] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Base data: every Org Outcome, Org Output and KPI, plus every active model. Nothing here is
  // scoped by the BU/Department/Function selectors — those only decide which KPIs the picker
  // offers and which figures are read once an entity is picked.
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
  // once an entity is picked, to read that entity's figures for the year.
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

  useEffect(() => {
    if (!selectedEntity || !businessUnitId) return;
    const fetchEntityData = async () => {
      setLoading(true);
      try {
        const [ach, priorAch] = await Promise.all([
          AchievementService.getAchievements(selectedEntity, businessUnitId, year),
          AchievementService.getAchievements(selectedEntity, businessUnitId, year - 1),
        ]);
        setAchievements(ach);
        setPriorYearAchievements(priorAch);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch entity data');
      } finally {
        setLoading(false);
      }
    };
    fetchEntityData();
  }, [selectedEntity, businessUnitId, year]);

  // Step two of the cycle: with an entity picked, read its ledger for the selected business unit
  // and year — whether the BU has anything recorded for it at all, and the figures rolled up
  // across the year.
  useEffect(() => {
    if (!selectedEntity || !businessUnitId) {
      setSelectedEntityFigures(null);
      setMonthlyTargets({});
      return;
    }
    let cancelled = false;
    LedgerService.getLedger({ kind: selectedEntity.kind, id: selectedEntity.id }, businessUnitId, year)
      .then(ledger => {
        if (cancelled) return;
        setSelectedEntityFigures(AnnualForecastService.getYearFigures(ledger, selectedEntity.aggType));
        // The same read already has every month's target, so the strip costs no extra request.
        const targets: Record<number, number | null> = {};
        ledger.months.forEach(entry => { targets[entry.month] = entry.target ?? null; });
        setMonthlyTargets(targets);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedEntityFigures(null);
        setMonthlyTargets({});
      });
    return () => { cancelled = true; };
  }, [selectedEntity, businessUnitId, year]);

  // "Last 12 months (actual)" — pinned to the prior calendar year (year - 1), Jan-Dec, as a
  // fixed year-over-year reference next to "Projected close of {year}". Doesn't move with the
  // Month selector. Raw recorded actual/baseline per month, no trending.
  const trailingProfile = useMemo(() => {
    return AnnualForecastService.getTrailingActuals(priorYearAchievements);
  }, [priorYearAchievements]);

  // "Projected close of {year}" — recorded months as they stand, every other month compounded off
  // the monthly CAGR drawn from the prior year plus this year through `month`. POC/Tactic
  // contributions (see useKpiPocTacticImpacts, used directly by TopDownAnnualPage) are shown and
  // written through the same Financial Model Impact engine as everywhere else in the app rather
  // than folded into this baseline forecast.
  const forecastProfile = useMemo(() => {
    return AnnualForecastService.calculateBaselineForecast(achievements, month, priorYearAchievements);
  }, [achievements, month, priorYearAchievements]);

  // Fetch roll-up data only when a KPI is selected
  useEffect(() => {
    if (!selectedEntity || selectedEntity.kind !== 'kpi' || !businessUnitId) {
      setRollUpRows([]);
      return;
    }

    const projectedTotal = selectedEntity.aggType === 'Percentage'
      ? forecastProfile.reduce((sum, m) => sum + m.finalValue, 0) / (forecastProfile.length || 1)
      : forecastProfile.reduce((sum, m) => sum + m.finalValue, 0);

    const fetchRollUp = async () => {
      setRollUpLoading(true);
      try {
        const rows = await RollUpService.getRollUpForKpi(
          selectedEntity.id,
          selectedEntity.name,
          businessUnitId,
          year,
          projectedTotal
        );
        setRollUpRows(rows);
      } catch (err: any) {
        console.error('Failed to fetch roll-up', err);
        setRollUpRows([]);
      } finally {
        setRollUpLoading(false);
      }
    };
    fetchRollUp();
  }, [selectedEntity, businessUnitId, year, forecastProfile]);

  // Percentage KPIs are stored 0-100 but behave as fractions inside an equation. Read from the
  // unscoped KPI list — a model component outside the selected department/function still has to
  // evaluate as a percentage. Working days aren't applied here: the POC dialog works a month at a
  // time, like the monthly screen.
  const evalContext: EvalContext = useMemo(() => ({
    percentageKpiIds: new Set(allKpis.filter(e => e.aggType === 'Percentage').map(e => e.id)),
    workingDays: null
  }), [allKpis]);

  return {
    businessUnitId, setBusinessUnitId,
    departmentId, setDepartmentId,
    functionId, setFunctionId,
    year, setYear,
    month, setMonth,
    entities,
    kpiScopeReady,
    selectedEntity, setSelectedEntity,
    selectedEntityFigures,
    monthlyTargets,
    achievements,
    models,
    evalContext,
    trailingProfile,
    forecastProfile,
    rollUpRows, rollUpLoading,
    loading, error
  };
};
