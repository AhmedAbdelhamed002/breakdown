import { Strategy_kpisesService } from "@generated/services/Strategy_kpisesService";
import { Pm_pocimpactsService } from "@generated/services/Pm_pocimpactsService";
import { Pm_modeltermsService } from "@generated/services/Pm_modeltermsService";
import { Pm_kpiachievmentsService } from "@generated/services/Pm_kpiachievmentsService";
import type { Pm_pocimpactsBase } from "@generated/models/Pm_pocimpactsModel";
import { ModelService, type FinancialModel } from "@infrastructure/financialImpact/ModelService";
import { PocImpactService, type PocImpactPreview } from "@infrastructure/financialImpact/PocImpactService";
import { LedgerService } from "@infrastructure/financialImpact/LedgerService";
import { TargetWriteService } from "@infrastructure/financialImpact/TargetWriteService";
import type { EvalContext } from "@infrastructure/financialImpact/ModelEvalService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { AppError } from "@infrastructure/errors/AppError";
import { logger } from "@infrastructure/logging/logger";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { listFinancialModelsForKpis } from "./financialModelService";

/** Monthly=125570000 / Total=125570001 — pm_impactpoctype's raw Dataverse choice values. */
export const IMPACT_POC_TYPE_MONTHLY = 125570000;
export const IMPACT_POC_TYPE_TOTAL = 125570001;
/** The month's Actual isn't considered final until this day — before it, the previous month's own
 * Actual isn't final either, so the achievement month resolves two months back instead of one. */
const ACHIEVEMENT_CUTOFF_DAY = 15;

/** strategy_kpises.strategy_aggregatetype — Percentage KPIs are stored 0-100 but act as fractions inside an equation. */
const PERCENTAGE_AGG_TYPE = 989230000;
/** strategy_kpises.strategy_kpitype — the model's own result is an "Output" only when its KPI is typed exactly this (not Sub Output, which the second hop doesn't apply to per the prototype's own rule). */
const OUTPUT_KPI_TYPE = 620930001;

/** The one Financial Model a Create POC dialog needs, by id — reuses the shared engine's own loader rather than a second implementation. */
export async function getFinancialModel(modelId: string): Promise<FinancialModel | undefined> {
  return ModelService.getModelById(modelId);
}

/** The driver KPI's current standing for the month — actual if recorded and non-zero, else baseline,
 * else 0 (display convention; the calculation engine itself falls back to 1 internally to avoid
 * zeroing a product). A `0` Actual is treated the same as a missing one here — Dataverse can't tell
 * "genuinely zero" apart from "not entered yet" for these KPIs, so an un-entered month's Actual would
 * otherwise silently zero out the Impact calculation instead of using the KPI's Baseline. */
export async function getDriverCurrentValue(kpiId: string, businessUnitId: string, year: number, month: number): Promise<number> {
  if (!kpiId || !businessUnitId) return 0;
  const ledger = await LedgerService.getLedger({ kind: "kpi", id: kpiId }, businessUnitId, year);
  const entry = ledger.months.find((m) => m.month === month);
  return entry?.actual || entry?.baseline || 0;
}

/** Same reading as getDriverCurrentValue, plus which KPI Achievement record it came from — for a
 * caller (e.g. a manual Month change) that needs to persist exactly which record fed the value it
 * displayed, not just the number itself. Also surfaces the raw Baseline (not folded into `actual`
 * like getDriverCurrentValue's own fallback) — needed as-is by the repeated-result-KPI "New Value
 * %" input, which prefers Baseline over Actual (the opposite preference). */
export async function getDriverAchievement(
  kpiId: string,
  businessUnitId: string,
  year: number,
  month: number
): Promise<{ actual: number; baseline: number | null; achievementId?: string }> {
  if (!kpiId || !businessUnitId) return { actual: 0, baseline: null };
  const ledger = await LedgerService.getLedger({ kind: "kpi", id: kpiId }, businessUnitId, year);
  const entry = ledger.months.find((m) => m.month === month);
  return { actual: entry?.actual || entry?.baseline || 0, baseline: entry?.baseline ?? null, achievementId: entry?.id };
}

/** How many months to walk backward before giving up — generous enough to cross several years
 * without a valid Actual, but still bounded so a never-recorded KPI can't loop indefinitely. */
const OUTCOME_ACTUAL_FALLBACK_MAX_MONTHS_BACK = 60;

/**
 * Walks backward month by month — same KPI, same Business Unit, only the month/year moves — from
 * (year, month) until it finds an Achievement record with a valid Actual. `0` is treated as missing
 * here (it means "not yet entered" in this data, same as no record at all), but a genuine negative
 * Actual is a real value and is returned as-is — the rule is specifically `null OR 0`, not `<= 0`.
 * Never looks forward past the requested month. Returns `null` when nothing valid turns up within
 * the lookback window, so the caller can apply its own final fallback.
 */
async function findActualWithMonthFallback(
  kpiId: string,
  businessUnitId: string,
  year: number,
  month: number
): Promise<{ year: number; month: number; actual: number } | null> {
  const entityRef = { kind: "kpi" as const, id: kpiId };
  const ledgersByYear = new Map<number, Awaited<ReturnType<typeof LedgerService.getLedger>>>();
  let y = year;
  let m = month;
  for (let i = 0; i < OUTCOME_ACTUAL_FALLBACK_MAX_MONTHS_BACK; i++) {
    let ledger = ledgersByYear.get(y);
    if (!ledger) {
      ledger = await LedgerService.getLedger(entityRef, businessUnitId, y);
      ledgersByYear.set(y, ledger);
    }
    const entry = ledger.months.find((e) => e.month === m);
    if (entry?.actual != null && entry.actual !== 0) return { year: y, month: m, actual: entry.actual };
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return null;
}

/**
 * The Financial Model's Outcome KPI Actual for the requested month — falling back to the same KPI
 * and Business Unit's most recent prior month with a valid Actual (not null, not 0) when the
 * requested month's own value is missing/0/null. See findActualWithMonthFallback for the exact
 * walk-back rule. Falls back to getDriverCurrentValue's existing behavior (this month's own
 * baseline, else 0) only when no prior month has a valid Actual either.
 */
export async function getOutcomeKpiActual(outcomeKpiId: string, businessUnitId: string, year: number, month: number): Promise<number> {
  if (!outcomeKpiId || !businessUnitId) return 0;
  const found = await findActualWithMonthFallback(outcomeKpiId, businessUnitId, year, month);
  if (found != null) return found.actual;
  return getDriverCurrentValue(outcomeKpiId, businessUnitId, year, month);
}

export interface OutcomeKpiActualWithSource {
  value: number;
  /** The month/year the value actually came from — equal to the requested month/year unless the
   * fallback walked backward. */
  sourceYear: number;
  sourceMonth: number;
  /** Whether the fallback actually had to move off the requested month. */
  isFallback: boolean;
}

/**
 * Same value as getOutcomeKpiActual, plus which month it actually came from — so the UI can make
 * clear when a displayed Actual wasn't recorded in the requested month (see findActualWithMonthFallback).
 * Never changes what value is returned, only what's reported about its source.
 */
export async function getOutcomeKpiActualWithSource(
  outcomeKpiId: string,
  businessUnitId: string,
  year: number,
  month: number
): Promise<OutcomeKpiActualWithSource> {
  if (!outcomeKpiId || !businessUnitId) return { value: 0, sourceYear: year, sourceMonth: month, isFallback: false };
  const found = await findActualWithMonthFallback(outcomeKpiId, businessUnitId, year, month);
  if (found != null) {
    return { value: found.actual, sourceYear: found.year, sourceMonth: found.month, isFallback: found.year !== year || found.month !== month };
  }
  const value = await getDriverCurrentValue(outcomeKpiId, businessUnitId, year, month);
  return { value, sourceYear: year, sourceMonth: month, isFallback: false };
}

export interface PocImpactConfig {
  financialModelId?: string;
  startMonth?: number;
  impactPocType?: number;
}

/**
 * `pm_Model`/`pm_startmonth`/`pm_impactpoctype` are never written onto `stf_strategypocs` itself
 * (see pocService.ts's own note on the broken Dataverse plugin this avoids) — so an existing POC's
 * previously-chosen Financial Model / Start Month / Impact Type are all read back from its own
 * generated `pm_pocimpacts` records instead of a column on the POC. Every record for one POC is
 * expected to agree on Financial Model and Impact Type (they're all written by the same Apply
 * call); if they don't, that's inconsistent data and is surfaced as an error rather than silently
 * guessed at. Start Month is derived from whichever row is chronologically earliest — never the
 * bare minimum `pm_month`, which would be wrong whenever the cycle wraps a year boundary (e.g. a
 * Nov→Mar cycle's minimum `pm_month` is 1, not 11).
 * Returns `{}` when the POC has no Impact records yet (new POC, or Impact never applied).
 */
export async function getPocImpactConfigForPoc(pocId: string): Promise<PocImpactConfig> {
  if (!pocId) return {};
  const rows = resultOrThrow(
    await Pm_pocimpactsService.getAll({
      select: ["pm_pocimpactid", "pm_impactpoctype", "pm_month", "pm_year", "_pm_financialmodel_value"],
      filter: `_pm_poc_value eq '${pocId}'`,
    }),
    "List POC impacts for POC"
  );
  if (rows.length === 0) return {};

  // pm_financialmodel actually points at pm_modelterm, not pm_models (see findModelTermIdsByKpi) —
  // different rows legitimately reference different Model Terms (one per KPI), so resolve each back
  // to its own parent Financial Model before checking they all agree on that.
  const modelTermIds = Array.from(new Set(rows.map((r) => r._pm_financialmodel_value).filter((v): v is string => !!v)));
  const terms = modelTermIds.length
    ? resultOrThrow(
        await Pm_modeltermsService.getAll({
          select: ["pm_modeltermid", "_pm_model_value"],
          filter: modelTermIds.map((id) => `pm_modeltermid eq '${id}'`).join(" or "),
        }),
        "List model terms for POC impacts"
      )
    : [];
  const modelIds = new Set(terms.map((t) => t._pm_model_value).filter((v): v is string => !!v));
  if (modelIds.size > 1) {
    throw new AppError(
      `This POC's existing Impact records disagree on Financial Model (found ${modelIds.size} different values) — fix the data before continuing.`
    );
  }

  const types = new Set(rows.map((r) => r.pm_impactpoctype).filter((t): t is NonNullable<typeof t> => t != null));
  if (types.size > 1) {
    throw new AppError(
      `This POC's existing Impact records disagree on Impact Type (found ${types.size} different values) — fix the data before continuing.`
    );
  }

  const earliest = rows.reduce<{ year: number; month: number } | undefined>((min, r) => {
    if (r.pm_year == null || r.pm_month == null) return min;
    const ordinal = r.pm_year * 12 + r.pm_month;
    if (!min || ordinal < min.year * 12 + min.month) return { year: r.pm_year, month: r.pm_month };
    return min;
  }, undefined);

  return {
    financialModelId: modelIds.size === 1 ? Array.from(modelIds)[0] : undefined,
    startMonth: earliest?.month,
    impactPocType: types.size === 1 ? Number(Array.from(types)[0]) : undefined,
  };
}

/** The exact KPI Achievement record an Impact row's Driver value was calculated from — read
 * straight off the linked record, never re-resolved, so it stays fixed even once newer Achievement
 * records exist for the same KPI/BU. */
export interface UsedAchievement {
  id: string;
  actual?: number | null;
  target?: number | null;
  month?: number;
  year?: number;
}

export interface PocImpactRecord {
  id: string;
  buId?: string;
  /** Which KPI this specific row's own value is for (pm_KPI) — the Driver's own row when role ===
   * "driver", or one of the model's other affected/result KPIs otherwise (see upsertPocImpactMonth).
   * A POC can have several rows across several KPIs and months from a single Apply cycle, so callers
   * that care about one particular KPI (e.g. Top-down Annual's own selected KPI) must filter on this
   * rather than assume the most recent row by month is the relevant one. */
  kpiId?: string;
  month?: number;
  year?: number;
  driverNewValue?: number;
  newKpiValue?: number;
  /** Human-readable summary already written by upsertPocImpactMonth (embeds KPI name, role, month/year) — reused as-is rather than rebuilt from the raw columns. */
  summary?: string;
  /** Set only on the Driver's own row (see upsertPocImpactMonth) — undefined for a component/result row. */
  usedAchievement?: UsedAchievement;
}

/**
 * Every existing `pm_pocimpacts` row for this POC, for read-only display in the Impact dialog when
 * reopened — a POC that already has Impact applied should show what was actually written, not just
 * a blank recalculation form. Returns `[]` for a POC with no Impact history yet.
 */
export async function getPocImpactRecordsForPoc(pocId: string): Promise<PocImpactRecord[]> {
  if (!pocId) return [];
  const rows = resultOrThrow(
    await Pm_pocimpactsService.getAll({
      select: ["pm_pocimpactid", "pm_newcolumn", "pm_month", "pm_year", "pm_pocimpactvalue", "pm_newkpivalue", "_pm_bu_value", "_pm_kpiachievement_value", "_pm_kpi_value"],
      filter: `_pm_poc_value eq '${pocId}'`,
    }),
    "List POC impact records for POC"
  );
  const achievementById = await fetchUsedAchievements(rows.map((r) => r._pm_kpiachievement_value));
  return rows
    .map((r) => ({
      id: r.pm_pocimpactid,
      buId: r._pm_bu_value,
      kpiId: r._pm_kpi_value,
      month: r.pm_month,
      year: r.pm_year,
      driverNewValue: r.pm_pocimpactvalue,
      newKpiValue: r.pm_newkpivalue,
      summary: r.pm_newcolumn,
      usedAchievement: r._pm_kpiachievement_value ? achievementById.get(r._pm_kpiachievement_value) : undefined,
    }))
    .sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - ((b.year ?? 0) * 12 + (b.month ?? 0)));
}

/**
 * Every distinct POC id with at least one pm_pocimpacts row for this KPI — catches a POC whose own
 * Related KPI (stf_strategykpi) is a different KPI than the one the row is actually for (e.g. the
 * POC's Related KPI is its Driver KPI, but the Financial Model's calculated result is a different
 * KPI entirely). Top-down Annual's own "which POCs contribute to this KPI" lookup goes through the
 * Related-KPI junction first (listStrategyKpisByKpi -> listPocsByStrategyKpis), which only finds a
 * POC whose Related KPI itself matches — this is the other half, finding a POC by what its Impact
 * rows actually touch instead.
 */
export async function findPocIdsWithImpactOnKpi(kpiId: string): Promise<string[]> {
  if (!kpiId) return [];
  const rows = resultOrThrow(
    await Pm_pocimpactsService.getAll({
      select: ["_pm_poc_value"],
      filter: `_pm_kpi_value eq '${kpiId}' and statecode eq 0`,
    }),
    "Find POCs with impact on KPI"
  );
  return Array.from(new Set(rows.map((r) => r._pm_poc_value).filter((id): id is string => !!id)));
}

/** Batched lookup of pm_kpiachievments rows by id — feeds PocImpactRecord/TacticImpactRecord's
 * `usedAchievement`, read straight off whatever record each Impact row's lookup already points at. */
export async function fetchUsedAchievements(ids: (string | undefined)[]): Promise<Map<string, UsedAchievement>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (uniqueIds.length === 0) return new Map();
  const rows = resultOrThrow(
    await Pm_kpiachievmentsService.getAll({
      select: ["pm_kpiachievmentid", "pm_actual", "pm_target", "pm_month", "pm_year"],
      filter: uniqueIds.map((id) => `pm_kpiachievmentid eq '${id}'`).join(" or "),
    }),
    "List KPI Achievements used by Impact records"
  );
  return new Map(
    rows.map((r) => [r.pm_kpiachievmentid, { id: r.pm_kpiachievmentid, actual: r.pm_actual, target: r.pm_target, month: r.pm_month, year: r.pm_year }])
  );
}

/**
 * Which month's Actual is safe to read from, given today's date — a month's own figures aren't
 * treated as final until the cutoff day of the *following* month, so before that day the
 * previous-previous month is used instead. E.g. (cutoff 15th): on/before Aug 15 -> June; after
 * Aug 15 -> July. Not hardcoded to any specific month — computed from `today` every time.
 */
export function resolveAchievementMonth(today: Date = new Date()): { year: number; month: number } {
  const monthsBack = today.getDate() <= ACHIEVEMENT_CUTOFF_DAY ? 2 : 1;
  const resolved = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  return { year: resolved.getFullYear(), month: resolved.getMonth() + 1 };
}

/**
 * The most recent month (walking backwards from today, current year then previous year) that
 * actually has a non-null Actual recorded for this Driver KPI + Business Unit in pm_kpiachievments
 * — a direct data lookup rather than assuming a month from the calendar/cutoff-day heuristic, which
 * can land on a month nothing has been entered for yet and read back a false 0. Falls back to
 * resolveAchievementMonth's own guess (with a 0 actual) only when nothing at all was found within
 * the two-year lookback window.
 */
export async function resolveDriverAchievementMonth(
  kpiId: string,
  businessUnitId: string,
  today: Date = new Date()
): Promise<{ year: number; month: number; actual: number; baseline: number | null; achievementId?: string }> {
  const fallback = resolveAchievementMonth(today);
  if (!kpiId || !businessUnitId) return { ...fallback, actual: 0, baseline: null };

  const entityRef = { kind: "kpi" as const, id: kpiId };
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  for (const year of [currentYear, currentYear - 1]) {
    const ledger = await LedgerService.getLedger(entityRef, businessUnitId, year);
    const startMonth = year === currentYear ? currentMonth : 12;
    for (let month = startMonth; month >= 1; month--) {
      const entry = ledger.months.find((m) => m.month === month);
      // A `0` Actual is treated as "not entered" here too (same rule as getDriverCurrentValue) — use
      // this record's Baseline instead of feeding a false zero into the Impact calculation.
      if (entry?.actual != null) return { year, month, actual: entry.actual || entry.baseline || 0, baseline: entry.baseline ?? null, achievementId: entry.id };
    }
  }
  logger.warn(
    "resolveDriverAchievementMonth found no Actual for this KPI + Business Unit in either year — falling back to 0",
    { kpiId, businessUnitId, years: [currentYear, currentYear - 1] }
  );
  return { ...fallback, actual: 0, baseline: null };
}

function yearMonthOf(dateStr: string): { year: number; month: number } {
  const d = new Date(dateStr);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * The consecutive {year, month} pairs of the POC Impact cycle: pm_startmonth is the first month;
 * stf_to (the POC's own "To" date — not stf_from) anchors the last. pm_startmonth has no year of
 * its own, so its year is picked so the range runs forward to stf_to's month without passing it —
 * the same calendar month as stf_to's own, or the previous year if pm_startmonth's month number is
 * greater than stf_to's. Inclusive of both ends, so the cycle length is no longer a fixed 5.
 */
export function computeImpactCycleMonths(toDate: string, startMonth: number): { year: number; month: number }[] {
  const { year: toYear, month: toMonth } = yearMonthOf(toDate);
  const startYear = startMonth <= toMonth ? toYear : toYear - 1;
  const totalMonths = (toYear - startYear) * 12 + (toMonth - startMonth) + 1;
  return Array.from({ length: Math.max(totalMonths, 0) }, (_, i) => {
    const d = new Date(startYear, startMonth - 1 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

/**
 * Whether a model's result is an Output-typed KPI — the trigger for offering a second, Outcome-
 * producing model (spec: "if the first Financial Model produces an Output KPI..."). The KPI table
 * is always the source of truth for type, never the model's own resultKind (which only says the
 * result points at a KPI record, not what type that KPI is).
 */
export async function resolveOutcomeModelCandidates(model: FinancialModel): Promise<FinancialModel[]> {
  if (model.resultKind !== "kpi" || !model.resultKpiId) return [];
  const kpiRes = resultOrThrow(
    await Strategy_kpisesService.getAll({ filter: `strategy_kpisid eq '${model.resultKpiId}'`, top: 1 }),
    "Get model result KPI type"
  );
  if (kpiRes[0]?.strategy_kpitype !== OUTPUT_KPI_TYPE) return [];

  const candidates = await listFinancialModelsForKpis([model.resultKpiId]);
  const others = candidates.filter((c) => c.id !== model.id);
  if (others.length === 0) return [];

  const models = await Promise.all(others.map((c) => ModelService.getModelById(c.id)));
  return models.filter((m): m is FinancialModel => !!m);
}

/** Which of a model's components (and its result) are Percentage-aggregated, read fresh from the KPI table for every model involved in this calculation. */
async function buildEvalContext(models: FinancialModel[]): Promise<EvalContext> {
  const ids = Array.from(
    new Set(models.flatMap((m) => [...ModelService.componentKpiIds(m), m.resultKpiId].filter((id): id is string => !!id)))
  );
  if (ids.length === 0) return { percentageKpiIds: new Set() };

  const rows = resultOrThrow(
    await Strategy_kpisesService.getAll({ filter: ids.map((id) => `strategy_kpisid eq '${id}'`).join(" or ") }),
    "List KPI aggregation types"
  );
  return { percentageKpiIds: new Set(rows.filter((r) => r.strategy_aggregatetype === PERCENTAGE_AGG_TYPE).map((r) => r.strategy_kpisid)) };
}

export interface CalculatePocImpactInput {
  model: FinancialModel;
  outcomeModel?: FinancialModel | null;
  driverKpiId: string;
  driverKpiName: string;
  currentValue: number;
  newValue: number;
  businessUnitId: string;
  year: number;
  month: number;
  kpiName: (kpiId: string) => string;
}

export interface AffectedKpi {
  kpiId: string;
  kpiName: string;
  value: number;
  role: "driver" | "affected";
}

/**
 * The full POC Impact KPI set for the selected Financial Model — read straight from
 * PocImpactService.preview()'s own kpiImpacts, never recomputed and never crossing into another
 * pm_models record. Always includes the Driver KPI itself (role 'driver', already present in
 * kpiImpacts with `after === newValue`, since `overrides = { [driverKpiId]: newValue }`) and,
 * when the model's result is KPI-typed, that one calculated result (role 'result').
 *
 * For a **Relation** model it also includes every other component (`role === 'component'` —
 * every pm_relationfactors.pm_factorkpi on this model): `evalRelation` compounds every relation
 * factor row directly onto the model's one shared result (there is no per-row "target KPI" field —
 * only `_pm_model_value`, which always means "this model's own result"), so a non-driver
 * component's own value is never recalculated by this engine — its `after` here is its own
 * unchanged current actual/baseline (PocImpactService.baseValues), which is exactly "the actual
 * existing semantics" for that KPI, not a fabricated propagated value and never a copy of the
 * driver's new value. This is what makes every KPI "participating in" a Relation model — driver,
 * every factor KPI, and the result — show up in pm_pocimpacts, while an Equation model keeps its
 * narrower Driver + Result set (its own non-driver term KPIs are excluded, matching existing
 * behavior exactly).
 *
 * `outcome-component`/`outcome-result` rows (the existing one-hop outcomeModel chain, a DIFFERENT
 * pm_models record) are excluded either way — that chain still powers the dialog's own "Outcome
 * Impact" preview table, it just must never contribute a pm_pocimpacts row.
 */
export function getAffectedKpis(preview: PocImpactPreview, model: FinancialModel): AffectedKpi[] {
  const seen = new Set<string>();
  const affected: AffectedKpi[] = [];
  for (const row of preview.kpiImpacts) {
    if (seen.has(row.kpiId)) continue;
    const include = row.role === "driver" || row.role === "result" || (model.kind === "Relation" && row.role === "component");
    if (!include) continue;
    seen.add(row.kpiId);
    affected.push({ kpiId: row.kpiId, kpiName: row.kpiName, value: row.after, role: row.role === "driver" ? "driver" : "affected" });
  }
  return affected;
}

/** What the model (and, when applicable, the second Outcome-producing model) makes of the new driver value — nothing is written yet. */
export async function calculatePocImpact(input: CalculatePocImpactInput): Promise<PocImpactPreview> {
  const evalContext = await buildEvalContext(input.outcomeModel ? [input.model, input.outcomeModel] : [input.model]);
  return PocImpactService.preview({
    model: input.model,
    driverKpiId: input.driverKpiId,
    driverKpiName: input.driverKpiName,
    currentValue: input.currentValue,
    newValue: input.newValue,
    month: input.month,
    year: input.year,
    buId: input.businessUnitId,
    outcomeModel: input.outcomeModel,
    evalContext,
    kpiName: input.kpiName,
  });
}

/** Writes every planned target/proposal/conflict from a calculated preview. Never touches the POC record itself — that's this feature's own findOrCreateStrategyKpi + createPoc/updatePoc path. */
export async function applyPocImpactWrites(
  input: Pick<CalculatePocImpactInput, "model" | "businessUnitId" | "year" | "month">,
  preview: PocImpactPreview
): Promise<void> {
  await PocImpactService.applyWrites({ model: input.model, buId: input.businessUnitId, year: input.year, month: input.month }, preview);
}

export interface ApplyPocImpactCycleInput {
  pocId: string;
  strategyId: string;
  regionId?: string;
  financialModelId: string;
  driverKpiId: string;
  driverKpiName: string;
  /** One entry per Business Unit this POC drives — exactly one for a non-Group POC (the strategy's
   * own BU), one per selected BU for Region = Group. Each BU resolves its own Driver Actual and its
   * own Financial Model impact independently (see BuImpact) — nothing here is shared across BUs. */
  buImpacts: BuImpact[];
  /** The POC's own stf_to — anchors the last month of the cycle (stf_from is not used for this). */
  toDate: string;
  startMonth: number;
  /** Raw pm_impactpoctype choice value (125570000 Monthly / 125570001 Total) — saved verbatim, never the label. */
  impactPocType: number;
  /** Whether the Financial Model is Sealed — same target-vs-proposal rule PocImpactService.plan() applies for a single month, replicated here per month. */
  modelSealed: boolean;
  /** Whether pm_pocimpacts upserts key on BU too (Region = Group) — kept explicit rather than
   * inferred from buImpacts.length, since a Group POC with exactly one selected BU still keys by BU. */
  isGroup: boolean;
}

/**
 * One Business Unit's own contribution to the POC Impact cycle: its own Driver New Value (for its
 * own ledger write) and its own affected-KPI set (from getAffectedKpis on that BU's own preview) —
 * the Driver KPI plus the model's own calculated result, each already carrying that BU's own value.
 */
export interface BuImpact {
  buId: string;
  driverNewValue: number;
  affectedKpis: AffectedKpi[];
  /** The exact KPI Achievement record the Driver KPI's current value was read from for this BU
   * (see resolveDriverAchievementMonth) — persisted on the Driver's own pm_pocimpacts row so
   * reopening this Impact later always traces back to what was actually used, even once newer
   * Achievement records exist. Undefined when nothing was found to read from. */
  achievementId?: string;
}

/**
 * `pm_pocimpacts.pm_financialmodel` is misleadingly named — despite the label, its actual Dataverse
 * relationship targets `pm_modelterm`, not `pm_models` (confirmed via entity metadata: binding a
 * Financial Model id there is what produced the "references a deleted pm_modelterm record" 404 this
 * codebase used to work around by never writing it at all). The real, writable value is the specific
 * Model Term row that represents a given KPI within a given Financial Model — resolved here in one
 * batched query per Apply rather than once per KPI/month. A KPI with no Model Term of its own (e.g.
 * every component of a pure Relation model, which uses pm_relationfactors instead, or the model's own
 * calculated result) has nothing to bind to and is simply omitted from the returned map.
 */
export async function findModelTermIdsByKpi(modelId: string, kpiIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(kpiIds.filter(Boolean)));
  if (!modelId || ids.length === 0) return new Map();
  const terms = resultOrThrow(
    await Pm_modeltermsService.getAll({
      select: ["pm_modeltermid", "_pm_kpi_value"],
      filter: `_pm_model_value eq '${modelId}' and (${ids.map((id) => `_pm_kpi_value eq '${id}'`).join(" or ")})`,
    }),
    "List model terms for KPIs"
  );
  const byKpi = new Map<string, string>();
  for (const t of terms) {
    if (t._pm_kpi_value && !byKpi.has(t._pm_kpi_value)) byKpi.set(t._pm_kpi_value, t.pm_modeltermid);
  }
  return byKpi;
}

/**
 * Upserts one pm_pocimpacts row for (POC, KPI, month, year) — or (POC, KPI, month, year, BU) when
 * `keyByBu` is set, for Region = Group where more than one record can share the same month. Updates
 * the matching row in place if Apply to Impact already ran for this key, otherwise creates it —
 * what prevents re-clicking Apply from piling up duplicates. `kpi` is one entry of one BU's own
 * Impact KPI set (see getAffectedKpis) — the Driver KPI's own new value, or the model's calculated
 * result's own new value for that same BU; each KPI carries its own value, never a shared one.
 */
async function upsertPocImpactMonth(
  input: ApplyPocImpactCycleInput,
  kpi: AffectedKpi,
  driverNewValue: number,
  year: number,
  month: number,
  buId: string,
  keyByBu: boolean,
  modelTermIdByKpi: Map<string, string>,
  achievementId: string | undefined
): Promise<void> {
  const filters = [
    `_pm_poc_value eq '${input.pocId}'`,
    `_pm_kpi_value eq '${kpi.kpiId}'`,
    `pm_month eq ${month}`,
    `pm_year eq ${year}`,
  ];
  if (keyByBu) filters.push(`_pm_bu_value eq '${buId}'`);
  const existing = resultOrThrow(
    await Pm_pocimpactsService.getAll({ filter: filters.join(" and "), top: 1 }),
    "Check existing POC impact for month"
  );

  const summary =
    kpi.role === "driver"
      ? `${kpi.kpiName} (Driver): New Value ${kpi.value.toLocaleString()} (M${month} ${year})`
      : `${kpi.kpiName}: New Value ${kpi.value.toLocaleString()} (Driver ${input.driverKpiName} → ${driverNewValue.toLocaleString()}) (M${month} ${year})`;
  const shared: Partial<Pm_pocimpactsBase> = {
    pm_newcolumn: summary,
    // pm_pocimpactvalue/pm_newkpivalue are Whole Number (Edm.Int32) columns in Dataverse — a KPI
    // whose real Actual/Baseline is fractional (e.g. a ratio stored as 0.04) must be rounded before
    // writing, or Dataverse rejects the payload outright ("Cannot convert ... to Edm.Int32").
    pm_pocimpactvalue: Math.round(driverNewValue),
    pm_newkpivalue: Math.round(kpi.value),
    pm_impactpoctype: input.impactPocType as Pm_pocimpactsBase["pm_impactpoctype"],
    pm_month: month as Pm_pocimpactsBase["pm_month"],
    pm_year: year,
    "pm_DrivenKPI@odata.bind": bindRef("kpi", input.driverKpiId),
    "pm_KPI@odata.bind": bindRef("kpi", kpi.kpiId),
    "pm_BU@odata.bind": bindRef("businessUnit", buId),
  };
  // pm_FinancialModel actually targets pm_modelterm, not pm_models (see findModelTermIdsByKpi) —
  // only settable when this KPI has its own Model Term row in the selected model.
  const modelTermId = modelTermIdByKpi.get(kpi.kpiId);
  if (modelTermId) shared["pm_FinancialModel@odata.bind"] = bindRef("modelTerm", modelTermId);
  // Traceability: which KPI Achievement record the Driver's current value was actually read from
  // at Apply time — set only on the Driver's own row, never on a component/result row (their
  // value is computed, not read from this record). Never re-resolved just by opening the Impact
  // later; only overwritten the next time the user explicitly recalculates and re-applies.
  if (kpi.role === "driver" && achievementId) shared["pm_KPIAchievement@odata.bind"] = bindRef("kpiAchievement", achievementId);

  if (existing[0]) {
    resultOrThrow(await Pm_pocimpactsService.update(existing[0].pm_pocimpactid, shared), "Update POC impact");
    return;
  }

  const payload: Omit<Pm_pocimpactsBase, "pm_pocimpactid"> = {
    statecode: 0,
    ...shared,
    "pm_POC@odata.bind": bindRef("strategyPoc", input.pocId),
    "pm_Strategy@odata.bind": bindRef("strategy", input.strategyId),
  };
  if (input.regionId) payload["pm_Region@odata.bind"] = bindRef("region", input.regionId);
  resultOrThrow(await Pm_pocimpactsService.create(payload), "Create POC impact");
}

/**
 * The POC Impact cycle: writes each Business Unit's own Driver KPI target/proposal to every month
 * (same sealed-vs-draft rule PocImpactService.plan() uses for a single month — replicated here
 * since that method only ever handles one), then upserts one pm_pocimpacts row per (BU × KPI in
 * that BU's own Impact KPI set × month) — every BU's Driver New Value and calculated result are its
 * own, resolved independently, never copied from another BU. The model's own result/outcome KPI
 * ledger writes for the single preview month are handled separately by applyPocImpactWrites, unchanged.
 */
export async function applyPocImpactCycle(input: ApplyPocImpactCycleInput): Promise<void> {
  const months = computeImpactCycleMonths(input.toDate, input.startMonth);
  const driverEntityRef = { kind: "kpi" as const, id: input.driverKpiId };

  for (const bu of input.buImpacts) {
    for (const { year, month } of months) {
      const existingTarget = await LedgerService.getMonthValue(driverEntityRef, bu.buId, year, month, "target");
      const hasTarget = existingTarget != null && existingTarget !== 0;
      if (input.modelSealed && !hasTarget) {
        await TargetWriteService.writeTarget(driverEntityRef, bu.buId, year, [month], bu.driverNewValue, "Financial Modelar", input.driverKpiName);
      } else {
        await TargetWriteService.writeProposalWithConflict(
          driverEntityRef, input.driverKpiName, bu.buId, year, month, bu.driverNewValue, "Financial Modelar", input.financialModelId
        );
      }
    }
  }

  const allKpiIds = input.buImpacts.flatMap((bu) => bu.affectedKpis.map((k) => k.kpiId));
  const modelTermIdByKpi = await findModelTermIdsByKpi(input.financialModelId, allKpiIds);

  for (const bu of input.buImpacts) {
    for (const kpi of bu.affectedKpis) {
      for (const { year, month } of months) {
        await upsertPocImpactMonth(input, kpi, bu.driverNewValue, year, month, bu.buId, input.isGroup, modelTermIdByKpi, bu.achievementId);
      }
    }
  }
}
