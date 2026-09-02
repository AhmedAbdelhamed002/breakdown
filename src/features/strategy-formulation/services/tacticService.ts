import { Stf_strategytacticsService } from "@generated/services/Stf_strategytacticsService";
import type { Stf_strategytactics, Stf_strategytacticsBase } from "@generated/models/Stf_strategytacticsModel";
import { Strategy_kpisesService } from "@generated/services/Strategy_kpisesService";
import { Stf_strategykpisService } from "@generated/services/Stf_strategykpisService";
import { Strategy_processesService } from "@generated/services/Strategy_processesService";
import { Crd04_regionsesService } from "@generated/services/Crd04_regionsesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toTactic, type Tactic, type TacticDraft } from "../models/tactic";
import { orFilter } from "../utils/odataFilters";

function uniqueIds(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((id): id is string => !!id)));
}

/**
 * The Code Apps data connection doesn't populate Dataverse's auto lookup-name
 * shadow columns (stf_kpiname/stf_strategykpiname/stf_processname come back
 * empty even though the relationships are set — same finding as
 * strategyKpiService.ts's getKpiDetail) — so KPI/Strategy KPI/Process names
 * are resolved here with one batched lookup per related entity instead of
 * trusted from the row.
 */
async function enrichTactics(rows: Stf_strategytactics[]): Promise<Tactic[]> {
  const tactics = rows.map(toTactic);
  const kpiIds = uniqueIds(tactics.map((t) => t.kpiId));
  const strategyKpiIds = uniqueIds(tactics.map((t) => t.strategyKpiId));
  const processIds = uniqueIds(tactics.map((t) => t.processId));
  const regionIds = uniqueIds(tactics.map((t) => t.regionId));

  const [kpis, strategyKpis, processes, regions] = await Promise.all([
    kpiIds.length ? resultOrThrow(await Strategy_kpisesService.getAll({ filter: orFilter("strategy_kpisid", kpiIds) }), "List KPIs for tactics") : [],
    strategyKpiIds.length ? resultOrThrow(await Stf_strategykpisService.getAll({ filter: orFilter("stf_strategykpiid", strategyKpiIds) }), "List strategy KPIs for tactics") : [],
    processIds.length ? resultOrThrow(await Strategy_processesService.getAll({ filter: orFilter("strategy_processid", processIds) }), "List processes for tactics") : [],
    regionIds.length ? resultOrThrow(await Crd04_regionsesService.getAll({ filter: orFilter("crd04_regionsid", regionIds) }), "List regions for tactics") : [],
  ]);
  const kpiNameById = new Map(kpis.map((k) => [k.strategy_kpisid, k.strategy_newcolumn]));
  const strategyKpiNameById = new Map(strategyKpis.map((k) => [k.stf_strategykpiid, k.stf_name]));
  const processNameById = new Map(processes.map((p) => [p.strategy_processid, p.strategy_newcolumn]));
  const regionNameById = new Map(regions.map((r) => [r.crd04_regionsid, r.crd04_id]));

  return tactics.map((t) => ({
    ...t,
    kpiName: (t.kpiId && kpiNameById.get(t.kpiId)) || t.kpiName,
    strategyKpiName: strategyKpiNameById.get(t.strategyKpiId) || t.strategyKpiName,
    processName: (t.processId && processNameById.get(t.processId)) || t.processName,
    regionName: (t.regionId && regionNameById.get(t.regionId)) || t.regionName,
  }));
}

export async function listTacticsByStrategyKpis(strategyKpiIds: string[]): Promise<Tactic[]> {
  if (strategyKpiIds.length === 0) return [];
  const rows = resultOrThrow(
    await Stf_strategytacticsService.getAll({ filter: orFilter("_stf_strategykpi_value", strategyKpiIds) }),
    "List tactics"
  );
  return enrichTactics(rows);
}

/** By the Tactic's own id rather than its Related KPI junction — mirrors listPocsByIds, feeding the
 * same "found via its Impact rows, not its Related KPI" lookup for Tactics. */
export async function listTacticsByIds(ids: string[]): Promise<Tactic[]> {
  if (ids.length === 0) return [];
  const rows = resultOrThrow(
    await Stf_strategytacticsService.getAll({ filter: orFilter("stf_strategytacticid", ids) }),
    "List tactics by id"
  );
  return enrichTactics(rows);
}

/** Org-wide listing (no strategy-KPI filter) — feeds Execution Tracking's cross-strategy join. */
export async function listAllTactics(): Promise<Tactic[]> {
  const rows = resultOrThrow(await Stf_strategytacticsService.getAll({}), "List all tactics");
  return enrichTactics(rows);
}

export async function createTactic(draft: TacticDraft): Promise<Tactic> {
  const payload: Omit<Stf_strategytacticsBase, "stf_strategytacticid"> = {
    statecode: 0,
    stf_tacticname: draft.name,
    stf_tacticdescription: draft.description,
    "stf_StrategyKPI@odata.bind": bindRef("strategyKpi", draft.strategyKpiId),
    "stf_TacticCategory@odata.bind": bindRef("executionCategory", draft.categoryId),
    "stf_Assignee@odata.bind": bindRef("user", draft.assigneeId),
    stf_target: draft.target,
    stf_deadline: draft.deadline,
    stf_currentbaseline: draft.currentBaseline,
    stf_neededbudget: draft.neededBudget,
    stf_serviceexecutionmode: draft.serviceExecutionMode as Stf_strategytacticsBase["stf_serviceexecutionmode"],
    stf_tacticstatus: 1,
  };
  if (draft.processId) payload["stf_Process@odata.bind"] = bindRef("process", draft.processId);
  if (draft.regionId) payload["pm_Region@odata.bind"] = bindRef("region", draft.regionId);
  const row = resultOrThrow(await Stf_strategytacticsService.create(payload), "Create tactic");
  return (await enrichTactics([row]))[0];
}

export async function updateTactic(id: string, draft: Partial<TacticDraft> & { status?: number }): Promise<Tactic> {
  const payload: Partial<Omit<Stf_strategytacticsBase, "stf_strategytacticid">> = {
    stf_tacticname: draft.name,
    stf_tacticdescription: draft.description,
    stf_target: draft.target,
    stf_deadline: draft.deadline,
    stf_currentbaseline: draft.currentBaseline,
    stf_neededbudget: draft.neededBudget,
    stf_tacticstatus: draft.status as Stf_strategytacticsBase["stf_tacticstatus"],
  };
  if (draft.categoryId) payload["stf_TacticCategory@odata.bind"] = bindRef("executionCategory", draft.categoryId);
  if (draft.assigneeId) payload["stf_Assignee@odata.bind"] = bindRef("user", draft.assigneeId);
  if (draft.processId) payload["stf_Process@odata.bind"] = bindRef("process", draft.processId);
  if (draft.driverKpiId) payload["pm_DriverKPI@odata.bind"] = bindRef("kpi", draft.driverKpiId);
  const row = resultOrThrow(await Stf_strategytacticsService.update(id, payload), "Update tactic");
  return (await enrichTactics([row]))[0];
}

export async function deleteTactic(id: string): Promise<void> {
  await Stf_strategytacticsService.delete(id);
}
