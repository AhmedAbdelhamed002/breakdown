import { Pm_modelsService } from "@generated/services/Pm_modelsService";
import { Pm_modelspm_modeltype } from "@generated/models/Pm_modelsModel";
import { Pm_modeltermsService } from "@generated/services/Pm_modeltermsService";
import { Pm_relationfactorsService } from "@generated/services/Pm_relationfactorsService";
import { Strategy_kpisesService } from "@generated/services/Strategy_kpisesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { orFilter } from "../utils/odataFilters";
import type { PickerOption } from "../models/reference";

function kpiOrFilter(field: string, kpiIds: string[]): string {
  return kpiIds.map((id) => `${field} eq '${id}'`).join(" or ");
}

/** KPI Table is the source of truth for KPI Type — pm_model/pm_modelterm carry no type of their own. */
const OUTCOME_KPI_TYPE = 620930000;
const SUB_OUTCOME_KPI_TYPE = 620930002;
/** pm_modelterm's pm_termtype option set — only 1 (KPI) rows carry a KPI reference that's actually
 * part of the equation. An Operator/Bracket/Constant row can carry a leftover pm_KPI value from
 * earlier editing (confirmed in live data) — collecting every term's KPI unconditionally pulls
 * that stray reference in as if it were a real component of the model. */
const TERM_TYPE_KPI = 1;

/** A Financial Model's own Calculated KPI plus every one of its Model Terms' KPIs and every one of
 * its Relation Factors' KPIs, resolved against strategy_kpises (the only source of truth for KPI
 * Type). Shared by both the Driver KPI list (excludes Outcome/Sub Outcome) and the Outcome-KPI
 * check (wants exactly those types). A pure Relation model has no Model Terms at all, so without
 * the Relation Factors query here neither the Driver list nor the Outcome check would ever see any
 * of its KPIs. */
async function getKpisReachableFromModel(modelId: string) {
  if (!modelId) return [];

  const [modelResult, termsResult, factorsResult] = await Promise.all([
    Pm_modelsService.get(modelId),
    Pm_modeltermsService.getAll({ filter: `_pm_model_value eq '${modelId}'` }),
    Pm_relationfactorsService.getAll({ filter: `_pm_model_value eq '${modelId}'` }),
  ]);
  const model = resultOrThrow(modelResult, "Get financial model");
  const terms = resultOrThrow(termsResult, "List model terms for financial model");
  const factors = resultOrThrow(factorsResult, "List relation factors for financial model");

  const kpiTermIds = terms.filter((t) => t.pm_termtype === TERM_TYPE_KPI).map((t) => t._pm_kpi_value);
  const kpiIds = Array.from(
    new Set(
      [model._pm_calculatedkpi_value, ...kpiTermIds, ...factors.map((f) => f._pm_factorkpi_value)].filter(
        (id): id is string => !!id
      )
    )
  );
  if (kpiIds.length === 0) return [];

  return resultOrThrow(await Strategy_kpisesService.getAll({ filter: orFilter("strategy_kpisid", kpiIds) }), "List KPIs for financial model");
}

/**
 * KPIs reachable from a single Financial Model, kept as long as KPI Type isn't Outcome or Sub
 * Outcome (a Driver KPI drives a result, it isn't the strategy's own outcome measure).
 */
export async function listValidKpisForFinancialModel(modelId: string): Promise<PickerOption[]> {
  const kpis = await getKpisReachableFromModel(modelId);
  return kpis
    .filter((k) => k.strategy_kpitype !== OUTCOME_KPI_TYPE && k.strategy_kpitype !== SUB_OUTCOME_KPI_TYPE)
    .map((k) => ({ id: k.strategy_kpisid, label: k.strategy_newcolumn }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The Outcome-type KPI reachable from this Financial Model (its own Calculated KPI or one of its
 * Model Terms), if any — what the Impact calculation requires before it can run. Same
 * reachable-KPI query as the Driver KPI list, just kept instead of excluded.
 */
export async function getOutcomeKpiForModel(modelId: string): Promise<PickerOption | undefined> {
  const kpis = await getKpisReachableFromModel(modelId);
  const outcome = kpis.find((k) => k.strategy_kpitype === OUTCOME_KPI_TYPE);
  return outcome ? { id: outcome.strategy_kpisid, label: outcome.strategy_newcolumn } : undefined;
}

/** Outcome-type KPIs matching a search term — for the Quick Create Financial Model / Quick Create Outcome KPI pickers. */
export async function searchOutcomeKpis(term: string): Promise<PickerOption[]> {
  const filters = [`strategy_kpitype eq ${OUTCOME_KPI_TYPE}`];
  if (term) filters.push(`contains(strategy_newcolumn,'${term.replace(/'/g, "''")}')`);
  const kpis = resultOrThrow(
    await Strategy_kpisesService.getAll({ filter: filters.join(" and "), top: 25 }),
    "Search Outcome KPIs"
  );
  return kpis.map((k) => ({ id: k.strategy_kpisid, label: k.strategy_newcolumn }));
}

/**
 * Creates a brand-new Outcome-type KPI — for "Quick Create Outcome KPI" when no existing KPI fits.
 * strategy_kpises has only two required fields (statecode, strategy_newcolumn); everything else,
 * including strategy_Function, is optional context.
 */
export async function createOutcomeKpi(name: string, functionId?: string): Promise<PickerOption> {
  const created = resultOrThrow(
    await Strategy_kpisesService.create({
      statecode: 0,
      strategy_newcolumn: name,
      strategy_kpitype: OUTCOME_KPI_TYPE,
      ...(functionId ? { "strategy_Function@odata.bind": bindRef("hrFunction", functionId) } : {}),
    }),
    "Create Outcome KPI"
  );
  return { id: created.strategy_kpisid, label: created.strategy_newcolumn };
}

/**
 * Links an existing KPI to a Financial Model as a zero-effect Relation Factor — purely so
 * getKpisReachableFromModel finds it (satisfying the Outcome-KPI gate) without changing anything
 * the model actually calculates. pm_inputpct: 0 means evalRelation's own guard
 * (`if (!factor.kpiId || !factor.inputPct) return;`) skips this row entirely. Never touches the
 * model's existing result binding, which may already point at something else.
 */
export async function linkKpiToModelAsOutcome(modelId: string, kpiId: string, kpiName: string): Promise<void> {
  resultOrThrow(
    await Pm_relationfactorsService.create({
      statecode: 0,
      pm_name: `Outcome link — ${kpiName}`,
      "pm_model@odata.bind": bindRef("model", modelId),
      "pm_factorkpi@odata.bind": bindRef("kpi", kpiId),
      pm_inputpct: 0,
      pm_resultpct: 0,
    }),
    "Link Outcome KPI to Financial Model"
  );
}

/**
 * Financial Models related to a set of KPIs — a Model qualifies directly (its own Calculated KPI
 * is one of the given KPIs) or indirectly, via one of its Model Terms or one of its Relation
 * Factors referencing one of the given KPIs (each always belongs to exactly one Model via its own
 * pm_Model lookup). Deduped: a Model matching through more than one of these still appears once.
 */
export async function listFinancialModelsForKpis(kpiIds: string[]): Promise<PickerOption[]> {
  const ids = Array.from(new Set(kpiIds.filter(Boolean)));
  if (ids.length === 0) return [];

  // pm_modeltype is selected explicitly (not left to a full-entity fetch) — same as
  // ModelService.getAllModels — because its formatted-value shadow field (pm_modeltypename,
  // read below) only reliably comes back when the base picklist field is named in `select`.
  const MODEL_SELECT = ["pm_modelid", "pm_name", "pm_modeltype"];

  const [directResult, termsResult, factorsResult] = await Promise.all([
    Pm_modelsService.getAll({ select: MODEL_SELECT, filter: kpiOrFilter("_pm_calculatedkpi_value", ids) }),
    Pm_modeltermsService.getAll({ filter: kpiOrFilter("_pm_kpi_value", ids) }),
    Pm_relationfactorsService.getAll({ filter: kpiOrFilter("_pm_factorkpi_value", ids) }),
  ]);
  const directModels = resultOrThrow(directResult, "List models by calculated KPI");
  const terms = resultOrThrow(termsResult, "List model terms by KPI");
  const factors = resultOrThrow(factorsResult, "List relation factors by KPI");

  const indirectModelIds = Array.from(
    new Set([...terms.map((t) => t._pm_model_value), ...factors.map((f) => f._pm_model_value)].filter((id): id is string => !!id))
  );
  const indirectModels = indirectModelIds.length
    ? resultOrThrow(
        await Pm_modelsService.getAll({
          select: MODEL_SELECT,
          filter: indirectModelIds.map((id) => `pm_modelid eq '${id}'`).join(" or "),
        }),
        "List models referenced by term/factor KPI"
      )
    : [];

  const byId = new Map<string, PickerOption>();
  for (const m of [...directModels, ...indirectModels]) {
    // Surface the model's lifecycle status (pm_modeltype: Draft/Under Review/Sealed/Approved By
    // Finance) right in the picker label — the same list feeds both the Tactic and POC Impact
    // dialogs' "Link Financial Model" dropdown, so a user linking a model can tell at a glance
    // whether it's still a Draft or already Sealed/Approved without opening it.
    //
    // Read from the raw numeric pm_modeltype, not the pm_modeltypename shadow annotation — that
    // formatted-value annotation isn't reliably populated in this environment (same issue already
    // seen on pm_modelterms' pm_termtype/pm_termtypename pair, see ModelService.toTermType), so a
    // model's status silently never showed. pm_modeltypename is kept only as a fallback in case the
    // numeric value itself is ever missing.
    const status = (m.pm_modeltype != null ? Pm_modelspm_modeltype[m.pm_modeltype] : undefined) ?? m.pm_modeltypename;
    const label = status ? `${m.pm_name} — ${status}` : m.pm_name;
    byId.set(m.pm_modelid, { id: m.pm_modelid, label });
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}
