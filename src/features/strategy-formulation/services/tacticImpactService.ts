import { Pm_tacticimpactsService } from "@generated/services/Pm_tacticimpactsService";
import { Pm_modeltermsService } from "@generated/services/Pm_modeltermsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { AppError } from "@infrastructure/errors/AppError";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { ChoiceService, type ChoiceTable } from "@infrastructure/financialImpact/ChoiceService";
import { LedgerService } from "@infrastructure/financialImpact/LedgerService";
import { TargetWriteService } from "@infrastructure/financialImpact/TargetWriteService";
import { findModelTermIdsByKpi, fetchUsedAchievements, computeImpactCycleMonths, type UsedAchievement } from "./pocImpactService";

export {
  getFinancialModel,
  getDriverCurrentValue,
  getDriverAchievement,
  getOutcomeKpiActual,
  getOutcomeKpiActualWithSource,
  resolveOutcomeModelCandidates,
  resolveAchievementMonth,
  resolveDriverAchievementMonth,
  calculatePocImpact,
  applyPocImpactWrites,
  computeImpactCycleMonths,
} from "./pocImpactService";
export type { OutcomeKpiActualWithSource, UsedAchievement } from "./pocImpactService";

/**
 * Tactic Impact is narrow-scoped compared to POC Impact: one driver KPI's value, one month, no
 * multi-month cycle (stf_strategytactics has only a single stf_deadline, not a start-month/to-date
 * range) and no per-component-KPI breakdown (pm_tacticimpacts has only one KPI lookup, pm_driverkpi,
 * unlike pm_pocimpacts' pair of pm_DrivenKPI/pm_KPI). Everything else — the calculation engine, the
 * ledger writes — is reused as-is from pocImpactService.ts/infrastructure/financialImpact, which are
 * already entity-agnostic.
 */

/**
 * A Tactic's linked Financial Model lives only on its own pm_tacticimpacts rows, never on
 * stf_strategytactics itself (there's no such column) — read back the same way POC infers its own,
 * via getPocImpactConfigForPoc. Throws if existing rows disagree (inconsistent data).
 */
export async function getFinancialModelForTactic(tacticId: string): Promise<string | undefined> {
  if (!tacticId) return undefined;
  const rows = resultOrThrow(
    await Pm_tacticimpactsService.getAll({
      select: ["pm_tacticimpactid", "_pm_financialmodel_value"],
      filter: `_pm_tactic_value eq '${tacticId}'`,
    }),
    "List Tactic impacts for Tactic"
  );
  // pm_financialmodel actually points at pm_modelterm, not pm_models (see findModelTermIdsByKpi in
  // pocImpactService.ts) — resolve back to the real parent Financial Model before returning it.
  const modelTermIds = Array.from(new Set(rows.map((r) => r._pm_financialmodel_value).filter((v): v is string => !!v)));
  if (modelTermIds.length === 0) return undefined;
  const terms = resultOrThrow(
    await Pm_modeltermsService.getAll({
      select: ["pm_modeltermid", "_pm_model_value"],
      filter: modelTermIds.map((id) => `pm_modeltermid eq '${id}'`).join(" or "),
    }),
    "List model terms for Tactic impacts"
  );
  const modelIds = new Set(terms.map((t) => t._pm_model_value).filter((v): v is string => !!v));
  if (modelIds.size === 0) return undefined;
  if (modelIds.size > 1) {
    throw new AppError(
      `This Tactic's existing Impact records disagree on Financial Model (found ${modelIds.size} different values) — fix the data before continuing.`
    );
  }
  return Array.from(modelIds)[0];
}

export interface TacticImpactRecord {
  id: string;
  buId?: string;
  /** Tactics write a single row per (Tactic, month) for the Driver KPI's own value only — no
   * separate component/result rows like POCs have — so this is always the Driver KPI (pm_DriverKPI).
   * Exposed under the same `kpiId` name as PocImpactRecord so a caller matching on KPI (e.g.
   * Top-down Annual's own selected KPI) can treat both record kinds the same way. */
  kpiId?: string;
  month?: number;
  year?: number;
  driverNewValue?: number;
  newKpiValue?: number;
  /** Human-readable summary already written by applyTacticImpact — reused as-is rather than rebuilt from the raw columns. */
  summary?: string;
  usedAchievement?: UsedAchievement;
}

/**
 * Every existing `pm_tacticimpacts` row for this Tactic, for read-only display in the Impact dialog
 * when reopened — a Tactic that already has Impact applied should show what was actually written,
 * not just a blank recalculation form. Returns `[]` for a Tactic with no Impact history yet.
 */
export async function getTacticImpactRecordsForTactic(tacticId: string): Promise<TacticImpactRecord[]> {
  if (!tacticId) return [];
  const rows = resultOrThrow(
    await Pm_tacticimpactsService.getAll({
      select: ["pm_tacticimpactid", "pm_newcolumn", "pm_month", "pm_year", "pm_tacticimpactvalue", "pm_newkpivalue", "_pm_bu_value", "_pm_kpiachievement_value", "_pm_driverkpi_value"],
      filter: `_pm_tactic_value eq '${tacticId}'`,
    }),
    "List Tactic impact records for Tactic"
  );
  const achievementById = await fetchUsedAchievements(rows.map((r) => r._pm_kpiachievement_value));
  return rows
    .map((r) => ({
      id: r.pm_tacticimpactid!,
      buId: r._pm_bu_value,
      kpiId: r._pm_driverkpi_value,
      month: r.pm_month,
      year: r.pm_year,
      driverNewValue: r.pm_tacticimpactvalue,
      newKpiValue: r.pm_newkpivalue,
      summary: r.pm_newcolumn,
      usedAchievement: r._pm_kpiachievement_value ? achievementById.get(r._pm_kpiachievement_value) : undefined,
    }))
    .sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - ((b.year ?? 0) * 12 + (b.month ?? 0)));
}

/** Every distinct Tactic id with at least one pm_tacticimpacts row driven by this KPI — mirrors
 * pocImpactService.ts's findPocIdsWithImpactOnKpi. A Tactic's own Driver KPI (pm_driverkpi, used
 * for the Impact calc) can differ from its Related KPI (stf_strategykpi, used for clustering), so
 * the Related-KPI junction lookup alone can miss a Tactic whose Impact is actually driven by this KPI. */
export async function findTacticIdsWithImpactOnKpi(kpiId: string): Promise<string[]> {
  if (!kpiId) return [];
  const rows = resultOrThrow(
    await Pm_tacticimpactsService.getAll({
      select: ["_pm_tactic_value"],
      filter: `_pm_driverkpi_value eq '${kpiId}' and statecode eq 0`,
    }),
    "Find Tactics with impact on KPI"
  );
  return Array.from(new Set(rows.map((r) => r._pm_tactic_value).filter((id): id is string => !!id)));
}

/** No generated choice const exists for pm_impacttactictype (see Pm_tacticimpactsModel.ts's own
 * note) — resolved purely from existing rows' annotated labels, same mechanism PROPOSAL_CHOICES/
 * CONFLICT_CHOICES already use. An empty seed means a brand-new table with zero rows can't resolve
 * anything yet; the write below simply omits the field in that case rather than guess a value. */
const TACTIC_IMPACT_CHOICES: ChoiceTable = {
  name: "pm_tacticimpacts",
  columns: ["pm_impacttactictype"],
  fetch: async (columns) => {
    const res = await Pm_tacticimpactsService.getAll({ select: ["pm_tacticimpactid", ...columns], top: 200 });
    return (res.data || []) as unknown as Record<string, unknown>[];
  },
  seed: {},
};

export interface ApplyTacticImpactInput {
  tacticId: string;
  strategyId: string;
  financialModelId: string;
  driverKpiId: string;
  businessUnitId: string;
  year: number;
  month: number;
  driverNewValue: number;
  /** The exact KPI Achievement record the Driver KPI's current value was read from (see
   * resolveDriverAchievementMonth/getDriverAchievement) — persisted for traceability, never
   * re-resolved just by reopening this Impact later. */
  achievementId?: string;
}

/**
 * Upserts the one pm_tacticimpacts row for (Tactic, month, year, Business Unit) — BU is part of the
 * key so a Region=Group Tactic (one row expected per selected Business Unit, same month) never has
 * one BU's write silently overwrite another's. The driver KPI's own ledger target/proposal write for
 * this same month is handled separately by applyPocImpactWrites/applyTacticImpactCycle (reused,
 * called by the caller before this) — this only records the Tactic-facing Impact row.
 */
export async function applyTacticImpact(input: ApplyTacticImpactInput): Promise<void> {
  const filters = [
    `_pm_tactic_value eq '${input.tacticId}'`,
    `pm_month eq ${input.month}`,
    `pm_year eq ${input.year}`,
    `_pm_bu_value eq '${input.businessUnitId}'`,
  ];
  const existing = resultOrThrow(
    await Pm_tacticimpactsService.getAll({ filter: filters.join(" and "), top: 1 }),
    "Check existing Tactic impact for month"
  );

  const impactTacticType = await ChoiceService.resolve(TACTIC_IMPACT_CHOICES, "pm_impacttactictype", "Monthly");
  // pm_tacticimpacts' generated Base type declares no "...@odata.bind" members (see
  // Pm_tacticimpactsModel.ts) — `any` here matches the established convention for this exact
  // situation elsewhere in the codebase (see PocTacticService.ts's savePoc/saveTactic).
  const shared: any = {
    pm_newcolumn: `Driver KPI New Value ${input.driverNewValue.toLocaleString()} (M${input.month} ${input.year})`,
    // Whole Number (Edm.Int32) columns in Dataverse — round, matching pm_pocimpacts' own note in
    // pocImpactService.ts (a fractional KPI value 404s with "Cannot convert ... to Edm.Int32").
    pm_tacticimpactvalue: Math.round(input.driverNewValue),
    pm_newkpivalue: Math.round(input.driverNewValue),
    pm_month: input.month,
    pm_year: input.year,
    "pm_DriverKPI@odata.bind": bindRef("kpi", input.driverKpiId),
    "pm_BU@odata.bind": bindRef("businessUnit", input.businessUnitId),
  };
  if (impactTacticType != null) shared.pm_impacttactictype = impactTacticType;
  // pm_FinancialModel actually targets pm_modelterm, not pm_models (see findModelTermIdsByKpi in
  // pocImpactService.ts) — only settable when the Driver KPI has its own Model Term row in this model.
  const modelTermId = (await findModelTermIdsByKpi(input.financialModelId, [input.driverKpiId])).get(input.driverKpiId);
  if (modelTermId) shared["pm_FinancialModel@odata.bind"] = bindRef("modelTerm", modelTermId);
  // Traceability: which KPI Achievement record the Driver's current value was actually read from
  // at Apply time — never re-resolved just by opening the Impact later, only when recalculated.
  if (input.achievementId) shared["pm_KPIAchievement@odata.bind"] = bindRef("kpiAchievement", input.achievementId);

  if (existing[0]) {
    resultOrThrow(await Pm_tacticimpactsService.update(existing[0].pm_tacticimpactid!, shared), "Update Tactic impact");
    return;
  }
  const payload: any = {
    statecode: 0,
    ...shared,
    "pm_Tactic@odata.bind": bindRef("strategyTactic", input.tacticId),
    "pm_Strategy@odata.bind": bindRef("strategy", input.strategyId),
  };
  resultOrThrow(await Pm_tacticimpactsService.create(payload), "Create Tactic impact");
}

/** One Business Unit's own contribution to the Tactic Impact cycle — its own Driver New Value and
 * the exact KPI Achievement record it was read from, same shape as POC's own BuImpact but without an
 * affectedKpis set (pm_tacticimpacts has no per-component breakdown, see this file's own top note). */
export interface TacticBuImpact {
  buId: string;
  driverNewValue: number;
  achievementId?: string;
}

export interface ApplyTacticImpactCycleInput {
  tacticId: string;
  strategyId: string;
  financialModelId: string;
  driverKpiId: string;
  driverKpiName: string;
  /** One entry per Business Unit this Tactic drives — exactly one for a non-Group Tactic (the
   * strategy's own BU), one per selected BU for Region = Group. */
  buImpacts: TacticBuImpact[];
  /** The Tactic's own stf_deadline — anchors the last month of the cycle, same role as POC's stf_to. */
  toDate: string;
  startMonth: number;
  /** Whether the Financial Model is Sealed — same target-vs-proposal rule applyPocImpactCycle uses. */
  modelSealed: boolean;
}

/**
 * The Tactic Impact cycle: writes each Business Unit's own Driver KPI target/proposal to every month
 * from startMonth through the Tactic's Deadline (identical rule to applyPocImpactCycle), then upserts
 * one pm_tacticimpacts row per (BU × month) via applyTacticImpact — every BU's Driver New Value is
 * its own, resolved independently, never copied from another BU. The model's own result/outcome KPI
 * ledger writes for the single preview month are handled separately by applyPocImpactWrites, unchanged.
 */
export async function applyTacticImpactCycle(input: ApplyTacticImpactCycleInput): Promise<void> {
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

  for (const bu of input.buImpacts) {
    for (const { year, month } of months) {
      await applyTacticImpact({
        tacticId: input.tacticId,
        strategyId: input.strategyId,
        financialModelId: input.financialModelId,
        driverKpiId: input.driverKpiId,
        businessUnitId: bu.buId,
        year,
        month,
        driverNewValue: bu.driverNewValue,
        achievementId: bu.achievementId,
      });
    }
  }
}
