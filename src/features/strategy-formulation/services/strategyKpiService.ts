import { Stf_strategykpisService } from "@generated/services/Stf_strategykpisService";
import { Strategy_kpisesService } from "@generated/services/Strategy_kpisesService";
import { Strategy_processesService } from "@generated/services/Strategy_processesService";
import { Btm_kpidriverbindingsService } from "@generated/services/Btm_kpidriverbindingsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { logger } from "@infrastructure/logging/logger";
import { toStrategyKpi, type StrategyKpi } from "../models/strategyKpi";
import { kpiRoleFromType } from "../constants/optionSets";

export async function listStrategyKpis(strategyId: string): Promise<StrategyKpi[]> {
  const junctions = resultOrThrow(
    await Stf_strategykpisService.getAll({ filter: `_stf_strategy_value eq '${strategyId}'` }),
    "List strategy KPIs"
  );
  if (junctions.length === 0) return [];

  const kpiIds = Array.from(new Set(junctions.map((j) => j._stf_kpi_value).filter((id): id is string => !!id)));
  const kpiFilter = kpiIds.map((id) => `strategy_kpisid eq '${id}'`).join(" or ");
  const kpis = kpiIds.length ? resultOrThrow(await Strategy_kpisesService.getAll({ filter: kpiFilter }), "List KPIs") : [];
  const kpiById = new Map(kpis.map((k) => [k.strategy_kpisid, k]));

  return junctions.map((j) => toStrategyKpi(j, j._stf_kpi_value ? kpiById.get(j._stf_kpi_value) : undefined));
}

/**
 * Every Strategy KPI, org-wide, grouped by Strategy id — one bulk read instead of calling
 * listStrategyKpis(strategyId) once per strategy (each of which is itself 2 round trips). Feeds
 * Monitoring's org-wide Outcome-KPI lookup, which needs every strategy's KPI roles at once.
 */
export async function listAllStrategyKpisGrouped(): Promise<Map<string, StrategyKpi[]>> {
  const junctions = resultOrThrow(await Stf_strategykpisService.getAll({}), "List all strategy KPIs");
  const kpiIds = Array.from(new Set(junctions.map((j) => j._stf_kpi_value).filter((id): id is string => !!id)));
  const kpiFilter = kpiIds.map((id) => `strategy_kpisid eq '${id}'`).join(" or ");
  const kpis = kpiIds.length ? resultOrThrow(await Strategy_kpisesService.getAll({ filter: kpiFilter }), "List KPIs for all strategy KPIs") : [];
  const kpiById = new Map(kpis.map((k) => [k.strategy_kpisid, k]));

  const byStrategy = new Map<string, StrategyKpi[]>();
  for (const j of junctions) {
    const strategyId = j._stf_strategy_value;
    if (!strategyId) continue;
    const list = byStrategy.get(strategyId) ?? [];
    list.push(toStrategyKpi(j, j._stf_kpi_value ? kpiById.get(j._stf_kpi_value) : undefined));
    byStrategy.set(strategyId, list);
  }
  return byStrategy;
}

export interface StrategyKpiRef {
  id: string;
  strategyId: string;
  kpiId?: string;
}

async function getKpiForJunction(kpiId: string) {
  return resultOrThrow(await Strategy_kpisesService.get(kpiId), "Get strategy KPI detail");
}

/**
 * One Strategy-KPI junction by its own id, with the underlying KPI resolved alongside it. Needed
 * whenever a caller only has a `strategyKpiId` (e.g. a Poc/Tactic's own Related KPI link) and a
 * `strategyKpis` list that isn't guaranteed to contain that exact junction — e.g. Top-down Annual's
 * "+ POC / Tactic" flow builds its `strategyKpis` array around the page's own selected/filtered KPI,
 * not the item's Related KPI, so `.find(k => k.id === strategyKpiId)` silently misses and callers
 * used to fall back to the (cleared, mutually-exclusive) `kpiId` field, resolving to "" — see
 * PocImpactDialog's initialDriverKpiId.
 */
export async function getStrategyKpiById(id: string): Promise<StrategyKpi | undefined> {
  if (!id) return undefined;
  const junction = resultOrThrow(await Stf_strategykpisService.get(id), "Get strategy KPI by id");
  const kpi = junction._stf_kpi_value ? await getKpiForJunction(junction._stf_kpi_value) : undefined;
  return toStrategyKpi(junction, kpi);
}

/** Minimal, org-wide junction listing — feeds joins that need only the Strategy/KPI a Tactic/POC ultimately belongs to (e.g. Execution Tracking). */
export async function listAllStrategyKpiRefs(): Promise<StrategyKpiRef[]> {
  const rows = resultOrThrow(await Stf_strategykpisService.getAll({}), "List strategy KPI refs");
  return rows.filter((r) => r._stf_strategy_value).map((r) => ({ id: r.stf_strategykpiid, strategyId: r._stf_strategy_value!, kpiId: r._stf_kpi_value }));
}

/**
 * Every Strategy-KPI junction (across every Strategy) for one raw KPI id — the reverse direction
 * of listStrategyKpis (which takes a strategy id, not a KPI id). Server-filtered, unlike
 * listAllStrategyKpiRefs which reads everything and would need client-side filtering. Feeds "which
 * Strategies (and so which of their Tactics/POCs) are already linked to this KPI" lookups, e.g.
 * Top-down Annual's own Tactic/POC eligibility.
 */
export async function listStrategyKpisByKpi(kpiId: string): Promise<StrategyKpi[]> {
  if (!kpiId) return [];
  const junctions = resultOrThrow(
    await Stf_strategykpisService.getAll({ filter: `_stf_kpi_value eq '${kpiId}'` }),
    "List strategy KPIs by KPI"
  );
  if (junctions.length === 0) return [];
  const kpi = await getKpiForJunction(kpiId);
  return junctions.map((j) => toStrategyKpi(j, kpi));
}

/** Never creates a duplicate junction row for the same Strategy+KPI pair — used by every clustering path (Bottom-Up, Unassigned). */
export async function findOrCreateStrategyKpi(strategyId: string, kpiId: string, kpiName: string): Promise<StrategyKpi> {
  const existing = resultOrThrow(
    await Stf_strategykpisService.getAll({ filter: `_stf_strategy_value eq '${strategyId}' and _stf_kpi_value eq '${kpiId}'`, top: 1 }),
    "Check existing strategy KPI"
  );
  const kpi = await getKpiForJunction(kpiId);
  if (existing.length > 0) return toStrategyKpi(existing[0], kpi);
  return addStrategyKpi(strategyId, kpiId, kpiName);
}

export async function addStrategyKpi(strategyId: string, kpiId: string, kpiName: string): Promise<StrategyKpi> {
  const row = resultOrThrow(
    await Stf_strategykpisService.create({
      statecode: 0,
      stf_name: kpiName,
      "stf_Strategy@odata.bind": bindRef("strategy", strategyId),
      "stf_KPI@odata.bind": bindRef("kpi", kpiId),
    }),
    "Add strategy KPI"
  );
  const kpi = await getKpiForJunction(kpiId);
  return toStrategyKpi(row, kpi);
}

/**
 * Operational strategies must carry exactly one Outcome-role KPI; Service
 * strategies have no such constraint (docs/strategy-formulation-spec.md
 * §6.1). Enforced here as well as at the UI/submit layers — all three must
 * agree.
 */
export function countOutcomeKpis(kpis: StrategyKpi[]): number {
  return kpis.filter((k) => k.role === "Outcome").length;
}

const OUTPUT_KPI_TYPE = 620930001;

export interface OutputKpiRef {
  id: string;
  name: string;
  functionId?: string;
}

/** Every Output-type KPI owned by a Department — feeds the Strategy Tree's per-Department KPI coverage list. */
export async function listOutputKpisByDepartment(departmentId: string): Promise<OutputKpiRef[]> {
  const rows = resultOrThrow(
    await Strategy_kpisesService.getAll({
      filter: `_strategy_department_value eq '${departmentId}' and strategy_kpitype eq ${OUTPUT_KPI_TYPE}`,
      orderBy: ["strategy_newcolumn asc"],
    }),
    "List output KPIs"
  );
  return rows.map((r) => ({ id: r.strategy_kpisid, name: r.strategy_newcolumn, functionId: r._strategy_function_value }));
}

const OUTCOME_KPI_TYPE = 620930000;

export interface KpiDetail {
  id: string;
  name: string;
  processId?: string;
  processName?: string;
  kpiType?: number;
  outcomeKpiId?: string;
  outcomeKpiName?: string;
  departmentId?: string;
  functionId?: string;
  regionId?: string;
}

export async function resolveProcessName(processId: string | undefined): Promise<string | undefined> {
  if (!processId) return undefined;
  const process = resultOrThrow(await Strategy_processesService.get(processId), "Get KPI's process");
  return process.strategy_newcolumn;
}

/** Only accepted as the bound Outcome if its own type is actually OutCome — direction alone isn't enough. */
async function resolveOutcomeCandidate(kpiId: string | undefined): Promise<{ id: string; name: string } | undefined> {
  if (!kpiId) return undefined;
  const kpi = resultOrThrow(await Strategy_kpisesService.get(kpiId), "Get candidate outcome KPI");
  if (kpi.strategy_kpitype !== OUTCOME_KPI_TYPE) return undefined;
  return { id: kpi.strategy_kpisid, name: kpi.strategy_newcolumn };
}

/**
 * KPI parent/child now comes from btm_kpidriverbindings (btm_KPI = parent, btm_DriverKPI = child)
 * instead of strategy_kpises' own process_parentkpi self-relation — the self-relation field is no
 * longer read for this anywhere in the app. Every KPI-relation lookup below goes through this table.
 */
const KPI_DRIVER_BINDING_ACTIVE_FILTER = "statecode eq 0";

/** Every child (btm_DriverKPI) bound under the given KPI as parent (btm_KPI). */
async function findDriverKpiIdsOf(kpiId: string): Promise<string[]> {
  if (!kpiId) return [];
  const bindings = resultOrThrow(
    await Btm_kpidriverbindingsService.getAll({
      select: ["_btm_driverkpi_value"],
      filter: `_btm_kpi_value eq '${kpiId}' and ${KPI_DRIVER_BINDING_ACTIVE_FILTER}`,
    }),
    "Find KPI driver bindings for this KPI as parent"
  );
  return Array.from(new Set(bindings.map((b) => b._btm_driverkpi_value).filter((id): id is string => !!id)));
}

/** The one parent (btm_KPI) the given KPI is bound under as a child (btm_DriverKPI), if any. */
async function findParentKpiIdOf(kpiId: string): Promise<string | undefined> {
  if (!kpiId) return undefined;
  const bindings = resultOrThrow(
    await Btm_kpidriverbindingsService.getAll({
      select: ["_btm_kpi_value"],
      filter: `_btm_driverkpi_value eq '${kpiId}' and ${KPI_DRIVER_BINDING_ACTIVE_FILTER}`,
      top: 1,
    }),
    "Find this KPI's parent driver binding"
  );
  return bindings[0]?._btm_kpi_value;
}

/**
 * Finds the Outcome-type KPI bound under the given KPI as its child (btm_DriverKPI) — a child
 * rolling up to it, not the given KPI's own parent. Confirmed against live Dataverse rows where an
 * OutCome-typed KPI's bound parent (btm_KPI) held the Output KPI it rolls up to (the reverse of
 * findParentKpiIdOf, which reads the given KPI's *own* parent binding and can point to a
 * *different*, higher-level KPI unrelated to this Strategy's bound Outcome).
 */
async function findOutcomeChildOf(kpiId: string): Promise<{ id: string; name: string } | undefined> {
  const childIds = await findDriverKpiIdsOf(kpiId);
  if (childIds.length === 0) return undefined;
  const rows = resultOrThrow(
    await Strategy_kpisesService.getAll({
      filter: `strategy_kpitype eq ${OUTCOME_KPI_TYPE} and (${childIds.map((id) => `strategy_kpisid eq '${id}'`).join(" or ")})`,
      top: 1,
    }),
    "Find outcome KPI among this KPI's driver bindings"
  );
  const row = rows[0];
  return row ? { id: row.strategy_kpisid, name: row.strategy_newcolumn } : undefined;
}

/**
 * Resolves the bound Outcome two ways, in order, since real data has used both conventions: (1) an
 * OutCome-typed KPI bound under this KPI as its child in btm_kpidriverbindings (a child rolling up
 * to it — the common case), or failing that (2) the KPI this one is itself bound under as a child,
 * if that parent record is typed OutCome. Direction alone is never trusted without the type check —
 * a parent binding can point at an unrelated, higher-level KPI. Never lets a btm_kpidriverbindings
 * failure (e.g. the table not yet covered by a security role right after being added — a real
 * failure mode hit adding this table) propagate out of getKpiDetail: the Outcome binding is a nice-
 * to-have auto-population, not something that should block the KPI's own name/department/function/
 * region from resolving (confirmed live: an unguarded Promise.all here left the Main KPI field stuck
 * on "Loading…" forever whenever this lookup errored).
 */
async function resolveOutcomeForKpi(kpiId: string): Promise<{ id: string; name: string } | undefined> {
  try {
    return (await findOutcomeChildOf(kpiId)) ?? (await resolveOutcomeCandidate(await findParentKpiIdOf(kpiId)));
  } catch (e) {
    logger.warn("Could not resolve Outcome KPI via btm_kpidriverbindings — leaving it unset", {
      kpiId,
      error: e instanceof Error ? e.message : e,
    });
    return undefined;
  }
}

/**
 * A single KPI's own detail, including its own Process and its bound Outcome KPI (see
 * resolveOutcomeForKpi). The row's own `strategy_processname` shadow field comes back empty at
 * runtime (the Code Apps data connection doesn't populate it), so the Process display name is
 * resolved with an extra lookup instead of trusted from the row.
 */
export async function getKpiDetail(kpiId: string): Promise<KpiDetail> {
  const row = resultOrThrow(await Strategy_kpisesService.get(kpiId), "Get KPI");
  const processId = row._strategy_process_value;
  const [processName, outcome] = await Promise.all([resolveProcessName(processId), resolveOutcomeForKpi(kpiId)]);
  return {
    id: row.strategy_kpisid,
    name: row.strategy_newcolumn,
    processId,
    processName,
    kpiType: row.strategy_kpitype,
    outcomeKpiId: outcome?.id,
    outcomeKpiName: outcome?.name,
    departmentId: row._strategy_department_value,
    functionId: row._strategy_function_value,
    regionId: row._strategy_region_value,
  };
}

export { kpiRoleFromType };
