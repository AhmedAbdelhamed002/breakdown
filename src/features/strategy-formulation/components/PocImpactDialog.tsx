import { useEffect, useRef, useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { ConflictConfirmDialog, type PendingConflict } from "@shared/components/ConflictConfirmDialog/ConflictConfirmDialog";
import type { FinancialModel } from "@infrastructure/financialImpact/ModelService";
import { equationParts, isRepeatedResultKpi, percentReferenceBase, valueFromPercent, percentFromValue } from "@infrastructure/financialImpact/ModelEvalService";
import { EquationDisplay } from "@shared/components/EquationDisplay";
import { RelationFactorsDisplay } from "./RelationFactorsDisplay";
import { ImpactStepHeader, IMPACT_STEP_ICONS } from "./ImpactStepHeader";
import { CONFLICT_TYPE_BY_SOURCE } from "@infrastructure/financialImpact/TargetSource";
import type { PocImpactPreview } from "@infrastructure/financialImpact/PocImpactService";
import { useOptions, useOptionsState } from "../hooks/useOptions";
import { listBusinessUnits } from "../services/referenceDataService";
import { listFinancialModelsForKpis, listValidKpisForFinancialModel, getOutcomeKpiForModel } from "../services/financialModelService";
import { isGroupRegion } from "../services/strategyService";
import {
  getFinancialModel,
  getOutcomeKpiActualWithSource,
  type OutcomeKpiActualWithSource,
  getPocImpactConfigForPoc,
  getPocImpactRecordsForPoc,
  type PocImpactRecord,
  resolveOutcomeModelCandidates,
  resolveAchievementMonth,
  resolveDriverAchievementMonth,
  getDriverAchievement,
  calculatePocImpact,
  applyPocImpactWrites,
  applyPocImpactCycle,
  getAffectedKpis,
  IMPACT_POC_TYPE_MONTHLY,
  IMPACT_POC_TYPE_TOTAL,
} from "../services/pocImpactService";
import { findOrCreateStrategyKpi, getStrategyKpiById } from "../services/strategyKpiService";
import { QuickCreateFinancialModelDialog } from "./QuickCreateFinancialModelDialog";
import { QuickCreateOutcomeKpiDialog } from "./QuickCreateOutcomeKpiDialog";
import { ImpactPreviewTables, fmt } from "./ImpactPreviewTables";
import type { StrategyKpi } from "../models/strategyKpi";
import type { Poc } from "../models/poc";
import type { PickerOption } from "../models/reference";

interface Props {
  strategyKpis: StrategyKpi[];
  functionId?: string;
  /** Needed to evaluate the Financial Model against real figures — the calculation reads/writes per Business Unit + month. */
  businessUnitId?: string;
  strategyId: string;
  poc: Poc;
  /** Updates the POC's own Related KPI junction when the chosen Driver KPI resolves to a different
   * one than it's currently linked to — routed through the caller so wizard-local state (or
   * whatever owns the POC list) stays in sync, rather than writing stf_strategypocs directly here. */
  onLinkStrategyKpi: (strategyKpiId: string) => Promise<Poc>;
  onClose: () => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One Region = Group Business Unit's own resolved Actual, editable New Value, and own calculated
 * preview — everything here is independent per BU, never shared or copied from another row. */
interface GroupBuCalc {
  id: string;
  label: string;
  year: number;
  month: number;
  currentValue: number;
  newValue: number;
  loading: boolean;
  preview: PocImpactPreview | null;
  /** The KPI Achievement record currentValue was actually read from — persisted on Apply for traceability. */
  achievementId?: string;
}

/** Raw KPI id (strategy_kpises), not the Strategy KPI junction id — resolved to a junction via
 * findOrCreateStrategyKpi on Apply. Seeded from whichever KPI the POC is currently linked to. */
function initialDriverKpiId(poc: Poc, strategyKpis: StrategyKpi[]): string {
  return strategyKpis.find((k) => k.id === poc.strategyKpiId)?.kpiId ?? poc.kpiId ?? "";
}

/**
 * Step 2 of Create POC: link a Financial Model, pick a Driver KPI (independently of the POC's own
 * Related KPI — may end up the same, may not), calculate and apply the Impact. Chains right after
 * PocCreateDialog succeeds for a brand-new POC, and is also reachable later as a standalone
 * "Impact" action on any existing POC. Never writes pm_Model/pm_startmonth onto stf_strategypocs —
 * see pocService.ts's own note — everything here lands on pm_pocimpacts instead.
 */
export function PocImpactDialog({ strategyKpis, functionId, businessUnitId, strategyId, poc, onLinkStrategyKpi, onClose }: Props) {
  const [driverKpiId, setDriverKpiId] = useState(() => initialDriverKpiId(poc, strategyKpis));
  const [financialModelId, setFinancialModelId] = useState("");

  const [selectedModel, setSelectedModel] = useState<FinancialModel | null>(null);
  const [outcomeCandidates, setOutcomeCandidates] = useState<FinancialModel[]>([]);
  const [outcomeModelId, setOutcomeModelId] = useState("");
  const [{ year: calcYear, month: calcMonth }, setCalcDate] = useState(() => resolveAchievementMonth());
  const [newValue, setNewValue] = useState<number>(0);
  const [driverCurrentValue, setDriverCurrentValue] = useState<number>(0);
  const [driverBaselineValue, setDriverBaselineValue] = useState<number | null>(null);
  const [driverAchievementId, setDriverAchievementId] = useState<string | undefined>(undefined);
  /** Draft text for the "New Value %" input — same pattern as the Financial Modeler's own Test %
   * column, so a user typing "-" or "1." doesn't get fought by immediate re-derivation. */
  const [newValuePercentDraft, setNewValuePercentDraft] = useState<string | undefined>(undefined);
  const [impactPreview, setImpactPreview] = useState<PocImpactPreview | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<PendingConflict[] | null>(null);

  const [outcomeKpi, setOutcomeKpi] = useState<PickerOption | undefined>(undefined);
  const [outcomeKpiLoading, setOutcomeKpiLoading] = useState(false);
  const [outcomeActual, setOutcomeActual] = useState<OutcomeKpiActualWithSource>({ value: 0, sourceYear: 0, sourceMonth: 0, isFallback: false });
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [showQuickCreateOutcomeKpi, setShowQuickCreateOutcomeKpi] = useState(false);
  const [quickCreatedModel, setQuickCreatedModel] = useState<{ id: string; name: string } | null>(null);

  const [startMonth, setStartMonth] = useState<number | undefined>(() => new Date().getMonth() + 1);
  const [impactPocType, setImpactPocType] = useState<number | undefined>(undefined);
  const [configError, setConfigError] = useState<string | null>(null);
  const [existingImpactRecords, setExistingImpactRecords] = useState<PocImpactRecord[]>([]);
  /** The Driver's persisted KPI Achievement from a previous Apply, if any — `undefined` while still
   * loading, `null` once confirmed there isn't one (brand-new POC). Read once on open so the dialog
   * shows exactly what the last Apply actually used instead of racing ahead to whatever month a
   * fresh resolution would land on today (see resolveDriverAchievementMonth's own note on drift). */
  const [initialAchievementSeed, setInitialAchievementSeed] = useState<
    { year: number; month: number; actual: number; achievementId?: string } | null | undefined
  >(undefined);
  const seedConsumedRef = useRef(false);

  const [groupBuCalcs, setGroupBuCalcs] = useState<GroupBuCalc[]>([]);
  const [addGroupBuId, setAddGroupBuId] = useState("");

  // The initial driverKpiId guess (above) only resolves correctly when the caller's `strategyKpis`
  // prop happens to include the junction poc.strategyKpiId points at — true for Strategy
  // Formulation's own wizard (passes every KPI on the strategy), but NOT for Top-down Annual's
  // "+ POC / Tactic" flow, which builds `strategyKpis` around the page's own selected/filtered KPI
  // instead. When that lookup misses, the guess falls back to poc.kpiId, which is always empty for
  // a clustered POC (mutually exclusive with strategyKpiId, spec §6.19) — silently zeroing Current
  // Value while the picker still *displays* the right name via kpiNameFallback's poc.strategyKpiName
  // fallback. Resolve the junction directly, once per POC, whenever the prop doesn't already cover it.
  const driverKpiResolvedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (driverKpiResolvedForRef.current === poc.id) return;
    if (!poc.strategyKpiId || strategyKpis.some((k) => k.id === poc.strategyKpiId)) {
      driverKpiResolvedForRef.current = poc.id;
      return;
    }
    let cancelled = false;
    getStrategyKpiById(poc.strategyKpiId).then((resolved) => {
      if (cancelled) return;
      driverKpiResolvedForRef.current = poc.id;
      if (resolved?.kpiId) setDriverKpiId(resolved.kpiId);
    });
    return () => { cancelled = true; };
  }, [poc.id, poc.strategyKpiId, strategyKpis]);

  // Financial Model / Start Month / Impact Type all live only on this POC's own pm_pocimpacts rows
  // — read back once, on open, rather than trusted from a (possibly stale) column on the POC.
  useEffect(() => {
    let cancelled = false;
    setInitialAchievementSeed(undefined);
    seedConsumedRef.current = false;
    getPocImpactConfigForPoc(poc.id)
      .then((config) => {
        if (cancelled) return;
        if (config.financialModelId) setFinancialModelId(config.financialModelId);
        if (config.startMonth != null) setStartMonth(config.startMonth);
        if (config.impactPocType != null) setImpactPocType(config.impactPocType);
      })
      .catch((e) => {
        if (!cancelled) setConfigError(e instanceof Error ? e.message : "Failed to load this POC's existing Impact configuration");
      });
    getPocImpactRecordsForPoc(poc.id)
      .then((records) => {
        if (cancelled) return;
        setExistingImpactRecords(records);
        // The Driver's own row is the one carrying a usedAchievement (see upsertPocImpactMonth —
        // only ever bound on role === "driver"); the most recent one if the cycle spans months.
        const driverRecord = [...records].reverse().find((r) => r.usedAchievement);
        const a = driverRecord?.usedAchievement;
        setInitialAchievementSeed(
          a ? { year: a.year ?? driverRecord!.year ?? 0, month: a.month ?? driverRecord!.month ?? 0, actual: a.actual ?? 0, achievementId: a.id } : null
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setConfigError(e instanceof Error ? e.message : "Failed to load this POC's existing Impact records");
          setInitialAchievementSeed(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [poc.id]);

  useEffect(() => {
    let cancelled = false;
    if (!financialModelId) { setSelectedModel(null); return; }
    getFinancialModel(financialModelId).then((m) => { if (!cancelled) setSelectedModel(m ?? null); });
    return () => { cancelled = true; };
  }, [financialModelId]);

  useEffect(() => {
    let cancelled = false;
    setOutcomeKpi(undefined);
    if (!financialModelId) { setOutcomeKpiLoading(false); return; }
    setOutcomeKpiLoading(true);
    getOutcomeKpiForModel(financialModelId).then((kpi) => {
      if (!cancelled) setOutcomeKpi(kpi);
    }).finally(() => {
      if (!cancelled) setOutcomeKpiLoading(false);
    });
    return () => { cancelled = true; };
  }, [financialModelId]);

  useEffect(() => {
    let cancelled = false;
    if (!outcomeKpi || !businessUnitId) { setOutcomeActual({ value: 0, sourceYear: calcYear, sourceMonth: calcMonth, isFallback: false }); return; }
    getOutcomeKpiActualWithSource(outcomeKpi.id, businessUnitId, calcYear, calcMonth).then((result) => {
      if (!cancelled) setOutcomeActual(result);
    });
    return () => { cancelled = true; };
  }, [outcomeKpi, businessUnitId, calcYear, calcMonth]);

  useEffect(() => {
    let cancelled = false;
    setOutcomeModelId("");
    if (!selectedModel) { setOutcomeCandidates([]); return; }
    resolveOutcomeModelCandidates(selectedModel).then((candidates) => {
      if (cancelled) return;
      setOutcomeCandidates(candidates);
      if (candidates.length > 0) setOutcomeModelId(candidates[0].id);
    });
    return () => { cancelled = true; };
  }, [selectedModel]);

  useEffect(() => {
    if (!driverKpiId || !businessUnitId) { setDriverCurrentValue(0); setDriverBaselineValue(null); return; }
    // Wait for the seed lookup (keyed on poc.id) to resolve first, so this never races ahead with
    // a fresh "today" resolution only to be overwritten a moment later by the persisted seed.
    if (initialAchievementSeed === undefined) return;
    let cancelled = false;
    if (initialAchievementSeed && !seedConsumedRef.current) {
      seedConsumedRef.current = true;
      setCalcDate({ year: initialAchievementSeed.year, month: initialAchievementSeed.month });
      // Re-read via the ledger for this exact month so Baseline (not carried on the persisted
      // usedAchievement snapshot) is available too, alongside the same actual/achievementId.
      getDriverAchievement(driverKpiId, businessUnitId, initialAchievementSeed.year, initialAchievementSeed.month).then((resolved) => {
        if (cancelled) return;
        setDriverCurrentValue(resolved.actual);
        setDriverBaselineValue(resolved.baseline);
        setDriverAchievementId(resolved.achievementId ?? initialAchievementSeed.achievementId);
        setNewValue((prev) => (prev === 0 ? resolved.actual : prev));
      });
      return () => { cancelled = true; };
    }
    resolveDriverAchievementMonth(driverKpiId, businessUnitId).then((resolved) => {
      if (cancelled) return;
      setCalcDate({ year: resolved.year, month: resolved.month });
      setDriverCurrentValue(resolved.actual);
      setDriverBaselineValue(resolved.baseline);
      setDriverAchievementId(resolved.achievementId);
      setNewValue((prev) => (prev === 0 ? resolved.actual : prev));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverKpiId, businessUnitId, initialAchievementSeed]);

  useEffect(() => {
    if (!driverKpiId || groupBuCalcs.length === 0) return;
    let cancelled = false;
    const ids = groupBuCalcs.map((g) => g.id);
    setGroupBuCalcs((prev) => prev.map((g) => ({ ...g, loading: true, preview: null })));
    Promise.all(ids.map((id) => resolveDriverAchievementMonth(driverKpiId, id).then((resolved) => ({ id, resolved })))).then((results) => {
      if (cancelled) return;
      setGroupBuCalcs((prev) =>
        prev.map((g) => {
          const found = results.find((r) => r.id === g.id);
          if (!found) return g;
          return {
            ...g,
            year: found.resolved.year,
            month: found.resolved.month,
            currentValue: found.resolved.actual,
            newValue: found.resolved.actual,
            achievementId: found.resolved.achievementId,
            loading: false,
          };
        })
      );
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverKpiId]);

  useEffect(() => {
    setImpactPreview(null);
    setImpactError(null);
    setGroupBuCalcs((prev) => prev.map((g) => ({ ...g, preview: null })));
  }, [financialModelId, driverKpiId, newValue, outcomeModelId, businessUnitId, calcYear, calcMonth, startMonth, impactPocType]);

  const needsRegion = poc.experimentScope === "Region" || poc.experimentScope === "Both";
  const isGroup = needsRegion && isGroupRegion(poc.regionName);

  const allBusinessUnits = useOptions(() => listBusinessUnits(), []);
  const strategyKpiIds = strategyKpis.map((k) => k.kpiId);
  const { data: financialModels, loading: loadingFinancialModels } = useOptionsState(
    () => listFinancialModelsForKpis(strategyKpiIds),
    [strategyKpiIds.join(",")]
  );
  const { data: validKpis, loading: loadingValidKpis } = useOptionsState(
    () => listValidKpisForFinancialModel(financialModelId),
    [financialModelId]
  );

  function handleFinancialModelChange(id: string) {
    setFinancialModelId(id);
    setDriverKpiId("");
  }

  async function addGroupBusinessUnit() {
    const bu = allBusinessUnits.find((b) => b.id === addGroupBuId);
    if (!bu || groupBuCalcs.some((g) => g.id === bu.id)) return;
    setAddGroupBuId("");
    setGroupBuCalcs((prev) => [...prev, { id: bu.id, label: bu.label, year: calcYear, month: calcMonth, currentValue: 0, newValue: 0, loading: !!driverKpiId, preview: null }]);
    if (!driverKpiId) return;
    const resolved = await resolveDriverAchievementMonth(driverKpiId, bu.id);
    setGroupBuCalcs((prev) =>
      prev.map((g) =>
        g.id === bu.id
          ? { ...g, year: resolved.year, month: resolved.month, currentValue: resolved.actual, newValue: resolved.actual, achievementId: resolved.achievementId, loading: false }
          : g
      )
    );
  }

  function removeGroupBusinessUnit(id: string) {
    setGroupBuCalcs((prev) => prev.filter((g) => g.id !== id));
  }

  function handleModelCreated(modelId: string, modelName: string) {
    setShowQuickCreate(false);
    setQuickCreatedModel({ id: modelId, name: modelName });
    handleFinancialModelChange(modelId);
  }

  const financialModelSelectedLabel =
    quickCreatedModel?.id === financialModelId ? quickCreatedModel.name : poc.financialModelName;

  function kpiNameFallback(id: string): string {
    return validKpis.find((k) => k.id === id)?.label ?? (id === driverKpiId ? poc.strategyKpiName : undefined) ?? id;
  }

  // Same self-referential pattern the Financial Modeler's own Test % supports: the Driver KPI
  // picked here is also one of the model's own equation components. When that's the case, offer a
  // "New Value %" input relative to that KPI's own Baseline (or Actual, if Baseline is missing) —
  // same reference-base preference and conversion formulas as BuilderTesterView's Test % column.
  // Scoped to the single-Business-Unit case, matching where the plain New Value input lives too.
  const isDriverRepeatedInModel = !!selectedModel && isRepeatedResultKpi(selectedModel, driverKpiId);
  const newValuePercentBase = isDriverRepeatedInModel ? percentReferenceBase(driverBaselineValue, driverCurrentValue) : null;
  const showNewValuePercent = !isGroup && isDriverRepeatedInModel && newValuePercentBase != null && newValuePercentBase !== 0;
  const derivedNewValuePercent = newValuePercentBase != null ? percentFromValue(newValue, newValuePercentBase) : null;

  const outcomeModel = outcomeCandidates.find((m) => m.id === outcomeModelId) ?? null;
  const canCalculate =
    !!selectedModel && !!driverKpiId && !!outcomeKpi && !!startMonth && !!impactPocType && !calculating &&
    (isGroup ? groupBuCalcs.length > 0 && groupBuCalcs.every((g) => !g.loading) : !!newValue && !!businessUnitId);
  const canApply =
    !!selectedModel && !!driverKpiId && !!outcomeKpi && !!startMonth && !!impactPocType && !applying &&
    (isGroup ? groupBuCalcs.length > 0 && groupBuCalcs.every((g) => !!g.preview) : !!impactPreview);

  async function handleCalculateImpact() {
    if (!selectedModel || !driverKpiId) return;
    setCalculating(true);
    setImpactError(null);
    try {
      if (isGroup) {
        const results = await Promise.all(
          groupBuCalcs.map((bu) =>
            calculatePocImpact({
              model: selectedModel,
              outcomeModel,
              driverKpiId,
              driverKpiName: kpiNameFallback(driverKpiId),
              currentValue: bu.currentValue,
              newValue: bu.newValue,
              businessUnitId: bu.id,
              year: bu.year,
              month: bu.month,
              kpiName: kpiNameFallback,
            }).then((preview) => ({ id: bu.id, preview }))
          )
        );
        setGroupBuCalcs((prev) =>
          prev.map((g) => {
            const found = results.find((r) => r.id === g.id);
            return found ? { ...g, preview: found.preview } : g;
          })
        );
      } else {
        if (!businessUnitId) return;
        const preview = await calculatePocImpact({
          model: selectedModel,
          outcomeModel,
          driverKpiId,
          driverKpiName: kpiNameFallback(driverKpiId),
          currentValue: driverCurrentValue,
          newValue,
          businessUnitId,
          year: calcYear,
          month: calcMonth,
          kpiName: kpiNameFallback,
        });
        setImpactPreview(preview);
      }
    } catch (e) {
      setImpactError(e instanceof Error ? e.message : "Could not work out the impact");
    } finally {
      setCalculating(false);
    }
  }

  /**
   * Everything Apply Impact does once there are no conflicts left to confirm: write each Business
   * Unit's own model result/outcome KPI ledger entry, link the POC's Related KPI to the Driver KPI
   * (only if it actually changed), then run the dynamic (pm_startmonth → stf_to) Driver KPI cycle.
   */
  async function runApply() {
    if (!selectedModel || !startMonth || !impactPocType) return;
    if (isGroup) {
      if (groupBuCalcs.length === 0 || groupBuCalcs.some((g) => !g.preview)) return;
    } else if (!impactPreview || !businessUnitId) {
      return;
    }
    setApplying(true);
    try {
      const buList = isGroup
        ? groupBuCalcs.map((g) => ({ buId: g.id, year: g.year, month: g.month, newValue: g.newValue, preview: g.preview!, achievementId: g.achievementId }))
        : [{ buId: businessUnitId!, year: calcYear, month: calcMonth, newValue, preview: impactPreview!, achievementId: driverAchievementId }];

      for (const bu of buList) {
        await applyPocImpactWrites({ model: selectedModel, businessUnitId: bu.buId, year: bu.year, month: bu.month }, bu.preview);
      }

      const strategyKpi = await findOrCreateStrategyKpi(strategyId, driverKpiId, kpiNameFallback(driverKpiId));
      if (strategyKpi.id !== poc.strategyKpiId) {
        await onLinkStrategyKpi(strategyKpi.id);
      }

      const buImpacts = buList.map((bu) => ({
        buId: bu.buId,
        driverNewValue: bu.newValue,
        affectedKpis: getAffectedKpis(bu.preview, selectedModel),
        achievementId: bu.achievementId,
      }));

      await applyPocImpactCycle({
        pocId: poc.id,
        strategyId,
        regionId: poc.regionId,
        financialModelId,
        driverKpiId,
        driverKpiName: kpiNameFallback(driverKpiId),
        buImpacts,
        toDate: poc.to ?? "",
        startMonth,
        impactPocType,
        modelSealed: selectedModel.status === "Sealed",
        isGroup,
      });
      onClose();
    } finally {
      setApplying(false);
    }
  }

  function handleApplyClick() {
    const previews = isGroup
      ? groupBuCalcs.map((g) => g.preview).filter((p): p is PocImpactPreview => !!p)
      : impactPreview
        ? [impactPreview]
        : [];
    if (previews.length === 0) return;
    const conflicts = previews.flatMap((preview) =>
      preview.writes
        .filter((write) => write.outcome === "conflict")
        .map<PendingConflict>((write) => ({
          entityName: write.kpiName,
          conflictType: CONFLICT_TYPE_BY_SOURCE["Financial Modelar"],
          existingValue: write.existingTarget,
          proposedValue: write.value,
          reason: `${write.kpiName} is already approved at ${write.existingTarget} for the month, and this ${write.role} value proposes ${write.value}.`,
        }))
    );
    if (!conflicts.length) { void runApply(); return; }
    setPendingConflicts(conflicts);
  }

  async function confirmApply() {
    setPendingConflicts(null);
    await runApply();
  }

  return (
    <Modal
      title="Link Financial Model & Calculate Impact"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canApply} onClick={handleApplyClick}>
            {applying ? "Applying…" : "Apply Impact"}
          </Button>
        </>
      }
    >
      {configError && <div className="alert alert-warn">{configError}</div>}

      {existingImpactRecords.length > 0 && (
        <>
          <ImpactStepHeader step={1} icon={IMPACT_STEP_ICONS.existing} label="Existing Impact" />
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 640 }}>
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Business Unit</th>
                  <th>Period</th>
                  <th className="tright">Driver New Value</th>
                  <th>KPI Achievement Used</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {existingImpactRecords.map((r) => (
                  <tr key={r.id}>
                    <td style={{ overflowWrap: "break-word" }}>{allBusinessUnits.find((b) => b.id === r.buId)?.label ?? r.buId ?? "—"}</td>
                    <td>{r.month ? `${MONTHS[r.month - 1]} ${r.year}` : "—"}</td>
                    <td className="tright mono">{r.driverNewValue != null ? fmt(r.driverNewValue) : "—"}</td>
                    <td className="muted" style={{ fontSize: 11.5, overflowWrap: "break-word" }}>
                      {r.usedAchievement ? (
                        <>
                          <div>
                            {r.usedAchievement.month ? MONTHS[r.usedAchievement.month - 1] : "—"} {r.usedAchievement.year ?? ""} — Actual{" "}
                            {fmt(r.usedAchievement.actual ?? 0)}
                          </div>
                          <div>Target {fmt(r.usedAchievement.target ?? 0)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 11.5, overflowWrap: "break-word" }}>{r.summary ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            This POC already has Impact applied — the values above were written by a previous Apply. Recalculating below and applying again will update them.
          </div>
        </>
      )}

      <Field
        label="Financial Model"
        required
        hint={
          loadingFinancialModels
            ? "Loading Financial Models…"
            : financialModels.length === 0
              ? "No Financial Model is linked to this strategy's KPIs (directly or via a Model Term)"
              : undefined
        }
      >
        <LookupField
          value={financialModelId}
          onChange={handleFinancialModelChange}
          options={financialModels}
          selectedLabel={financialModelSelectedLabel}
          placeholder="Choose Financial Model…"
        />
      </Field>

      {financialModelId && outcomeKpiLoading && <div className="hint">Checking for an Outcome KPI…</div>}

      {financialModelId && !outcomeKpiLoading && !outcomeKpi && (
        <div className="alert alert-warn">
          This Financial Model does not contain an Outcome KPI required to calculate the Financial Impact.
          <div className="flex" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => handleFinancialModelChange("")}>
              Change Financial Model
            </Button>
            <Button size="sm" variant="accent" onClick={() => setShowQuickCreateOutcomeKpi(true)}>
              Quick Create Outcome KPI
            </Button>
            <Button size="sm" variant="accent" onClick={() => setShowQuickCreate(true)}>
              Quick Create Financial Model
            </Button>
          </div>
        </div>
      )}

      {financialModelId && outcomeKpi && (
        <>
          <ImpactStepHeader step={2} icon={IMPACT_STEP_ICONS.configure} label="Configure New Impact" />
          <Field
            label="Driver KPI"
            required
            hint={loadingValidKpis ? "Loading KPIs…" : validKpis.length === 0 ? "No non-Outcome KPI is linked to this Financial Model (directly or via a Model Term)" : undefined}
          >
            <LookupField
              value={driverKpiId}
              onChange={setDriverKpiId}
              options={validKpis}
              selectedLabel={poc.strategyKpiName}
              placeholder="Driver KPI…"
            />
          </Field>

          {selectedModel && (
            <div className="rel-trail">
              <span className="rel-chip">{poc.name || "This POC"}</span>
              <span className="rel-arrow" aria-hidden="true">→</span>
              <span className={`rel-chip${poc.strategyKpiName ? "" : " empty"}`}>{poc.strategyKpiName || "No Related KPI"}</span>
              <span className="rel-arrow" aria-hidden="true">→</span>
              <span className="rel-chip">{selectedModel.name}</span>
              {driverKpiId && (
                <>
                  <span className="rel-arrow" aria-hidden="true">→</span>
                  <span className="rel-chip">{kpiNameFallback(driverKpiId)}</span>
                </>
              )}
            </div>
          )}

          {selectedModel && driverKpiId && (
            <>
              <div className="hint" style={{ marginBottom: 6 }}>
                This Financial Model's {selectedModel.kind === "Relation" ? "relation" : "equation"} — the Driver KPI you just picked is one of these components:
              </div>
              <div className="impact-equation">
                {selectedModel.kind === "Relation" ? (
                  <RelationFactorsDisplay parts={equationParts(selectedModel)} style={{ marginBottom: 16 }} />
                ) : (
                  <EquationDisplay parts={equationParts(selectedModel)} style={{ marginBottom: 16 }} />
                )}
              </div>
            </>
          )}

          <div className="grid-2">
            <Field label="Start Month" required hint="First month of the POC Impact cycle — runs through the To date below">
              <select value={startMonth ?? ""} onChange={(e) => setStartMonth(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="" disabled>
                  Select…
                </option>
                {MONTHS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Impact Type"
              required
              hint={impactPocType != null ? "Loaded from this POC's existing Impact records" : undefined}
            >
              <select value={impactPocType ?? ""} onChange={(e) => setImpactPocType(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="" disabled>
                  Select…
                </option>
                <option value={IMPACT_POC_TYPE_MONTHLY}>Monthly</option>
                <option value={IMPACT_POC_TYPE_TOTAL}>Total</option>
              </select>
            </Field>
          </div>

          {isGroup && (
            <>
              <div className="section-label">Business Units (Region = Group)</div>
              <div className="hint" style={{ marginBottom: 8 }}>
                Each Business Unit resolves its own latest Driver KPI Actual and gets its own New
                Value — the Financial Model is calculated independently per Business Unit, never
                copied from another. Pick at least one before applying.
              </div>
              {groupBuCalcs.length > 0 && (
                <table className="data-table" style={{ marginBottom: 10 }}>
                  <thead>
                    <tr>
                      <th>Business Unit</th>
                      <th className="tright">Current Value</th>
                      <th className="tright">New Value</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupBuCalcs.map((bu) => (
                      <tr key={bu.id}>
                        <td>{bu.label}</td>
                        <td className="tright mono">{bu.loading ? "…" : fmt(bu.currentValue)}</td>
                        <td className="tright">
                          <input
                            type="number"
                            step="any"
                            disabled={bu.loading}
                            value={bu.newValue}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setGroupBuCalcs((prev) => prev.map((g) => (g.id === bu.id ? { ...g, newValue: v, preview: null } : g)));
                            }}
                            style={{ width: 100, textAlign: "right" }}
                          />
                        </td>
                        <td>
                          <Button size="xs" onClick={() => removeGroupBusinessUnit(bu.id)} aria-label={`Remove ${bu.label}`}>
                            ×
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="grid-2">
                <Field label="Add a Business Unit">
                  <LookupField
                    value={addGroupBuId}
                    onChange={setAddGroupBuId}
                    options={allBusinessUnits.filter((b) => !groupBuCalcs.some((g) => g.id === b.id))}
                    placeholder="Select…"
                  />
                </Field>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <Button size="sm" disabled={!addGroupBuId} onClick={() => void addGroupBusinessUnit()}>
                    + Add
                  </Button>
                </div>
              </div>
              {groupBuCalcs.length === 0 && (
                <div className="alert alert-warn">Please select at least one Business Unit before applying the Impact.</div>
              )}
            </>
          )}
        </>
      )}

      {driverKpiId && (
        <>
          {!isGroup && (
            <>
              <div className="grid-2">
                <Field
                  label="Current Value (readonly)"
                  hint={
                    businessUnitId
                      ? `Read from KPI Achievement — Business Unit: ${allBusinessUnits.find((b) => b.id === businessUnitId)?.label ?? businessUnitId}, ${MONTHS[calcMonth - 1]} ${calcYear}`
                      : undefined
                  }
                >
                  <div className="readonly-value-box">
                    {fmt(driverCurrentValue)}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </Field>
                <Field label="New Value" required hint="What this POC drives the Driver KPI to">
                  <input type="number" step="any" value={newValue} onChange={(e) => setNewValue(Number(e.target.value))} />
                </Field>
              </div>

              {showNewValuePercent && (
                <div className="grid-2" style={{ marginTop: -8 }}>
                  <div />
                  <Field
                    label="New Value %"
                    hint={`% of ${kpiNameFallback(driverKpiId)}'s Baseline (or Actual if Baseline is missing) — this Driver KPI is also one of the Financial Model's own components, same as the Financial Modeler's own Test %`}
                  >
                    <input
                      type="number"
                      step="any"
                      value={
                        newValuePercentDraft !== undefined
                          ? newValuePercentDraft
                          : derivedNewValuePercent == null
                            ? ""
                            : Math.round(derivedNewValuePercent * 100) / 100
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        setNewValuePercentDraft(raw);
                        if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
                        const parsed = Number(raw);
                        if (!Number.isFinite(parsed) || newValuePercentBase == null) return;
                        setNewValue(valueFromPercent(parsed, newValuePercentBase));
                      }}
                      onBlur={() => {
                        if (newValuePercentDraft !== undefined) {
                          const parsed = Number(newValuePercentDraft);
                          if (Number.isFinite(parsed) && newValuePercentBase != null) setNewValue(valueFromPercent(parsed, newValuePercentBase));
                        }
                        setNewValuePercentDraft(undefined);
                      }}
                    />
                  </Field>
                </div>
              )}

              {outcomeKpi && (
                <div className="alert alert-ok" style={{ marginBottom: 10 }}>
                  Outcome KPI <b>{outcomeKpi.label}</b> actual for {MONTHS[calcMonth - 1]} {calcYear}: <b>{fmt(outcomeActual.value)}</b>{" "}
                  {outcomeActual.isFallback && (
                    <span className="source-tag">
                      Source: {MONTHS[outcomeActual.sourceMonth - 1]} {outcomeActual.sourceYear}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {!isGroup && !businessUnitId ? (
            <div className="alert alert-warn">This strategy has no Business Unit set — the impact can't be calculated without one.</div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <Button variant="accent" className="btn-block" disabled={!canCalculate} onClick={() => void handleCalculateImpact()}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="2" width="16" height="20" rx="2" />
                  <path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
                </svg>
                {calculating ? "Calculating…" : isGroup ? "Calculate Impact (all Business Units)" : "Calculate Impact"}
              </Button>
            </div>
          )}
          {impactError && <div className="alert alert-warn">{impactError}</div>}

          {!isGroup && impactPreview && (
            <>
              <ImpactPreviewTables preview={impactPreview} driverName={kpiNameFallback(driverKpiId)} currentValue={driverCurrentValue} newValue={newValue} />
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 16 }}>
                {selectedModel?.status === "Sealed"
                  ? "Sealed model → writes targets directly (or a proposal + conflict where a target already exists)."
                  : "Draft model → every value is saved as a proposal only."}{" "}
                Apply Impact links this POC to the Strategy's KPI graph and records a snapshot of every value above on it.
              </div>
            </>
          )}

          {isGroup && groupBuCalcs.some((g) => g.preview) && (
            <>
              {groupBuCalcs
                .filter((g) => g.preview)
                .map((bu) => (
                  <div key={bu.id} style={{ marginBottom: 8 }}>
                    <ImpactPreviewTables
                      preview={bu.preview!}
                      driverName={kpiNameFallback(driverKpiId)}
                      currentValue={bu.currentValue}
                      newValue={bu.newValue}
                      sectionPrefix={`${bu.label} — `}
                    />
                  </div>
                ))}
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 16 }}>
                {selectedModel?.status === "Sealed"
                  ? "Sealed model → writes targets directly (or a proposal + conflict where a target already exists)."
                  : "Draft model → every value is saved as a proposal only."}{" "}
                Apply Impact links this POC to the Strategy's KPI graph and records a snapshot of every value above on it, independently for each Business Unit.
              </div>
            </>
          )}
        </>
      )}

      {showQuickCreate && (
        <QuickCreateFinancialModelDialog
          candidateDriverKpis={strategyKpis.map((k) => ({ id: k.kpiId, label: k.kpiName }))}
          functionId={functionId}
          onCreated={handleModelCreated}
          onClose={() => setShowQuickCreate(false)}
        />
      )}

      {showQuickCreateOutcomeKpi && (
        <QuickCreateOutcomeKpiDialog
          modelId={financialModelId}
          functionId={functionId}
          onCreated={(id, kpiName) => {
            setOutcomeKpi({ id, label: kpiName });
            setShowQuickCreateOutcomeKpi(false);
            void getFinancialModel(financialModelId).then((m) => setSelectedModel(m ?? null));
          }}
          onClose={() => setShowQuickCreateOutcomeKpi(false)}
        />
      )}

      <ConflictConfirmDialog
        open={!!pendingConflicts}
        confirmLabel="Apply impact anyway"
        conflicts={pendingConflicts ?? []}
        saving={applying}
        onCancel={() => setPendingConflicts(null)}
        onConfirm={() => void confirmApply()}
      />
    </Modal>
  );
}
