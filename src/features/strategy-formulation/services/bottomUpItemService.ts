import { Stf_strategytacticsService } from "@generated/services/Stf_strategytacticsService";
import type { Stf_strategytacticsBase } from "@generated/models/Stf_strategytacticsModel";
import { Stf_strategypocsService } from "@generated/services/Stf_strategypocsService";
import type { Stf_strategypocsBase } from "@generated/models/Stf_strategypocsModel";
import { Strategy_kpisesService } from "@generated/services/Strategy_kpisesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toTactic, type Tactic } from "../models/tactic";
import { toPoc, type Poc } from "../models/poc";
import type { UnassignedItem } from "../models/unassignedItem";
import { findOrCreateStrategyKpi } from "./strategyKpiService";

const TACTIC_STATUS_ACTIVE = 1;
const POC_STATUS_ACTIVE = 1;

export interface BottomUpTacticDraft {
  name: string;
  description?: string;
  kpiId: string;
  /** Display-only — not sent to Dataverse, just carried along for the staged-items table/review screen. */
  kpiLabel?: string;
  categoryId: string;
  assigneeId: string;
  target: number;
  deadline: string;
  currentBaseline?: number;
  neededBudget?: number;
  processId?: string;
}

export interface BottomUpPocDraft {
  name: string;
  description?: string;
  kpiId: string;
  /** Display-only — not sent to Dataverse, just carried along for the staged-items table/review screen. */
  kpiLabel?: string;
  categoryId: string;
  experimentScope: string;
  regionId?: string;
  specialtyId?: string;
  kpiTargetValue: number;
  successDueDate: string;
  killCondition: string;
  from: string;
  to: string;
  neededBudget?: number;
  projectId?: string;
}

/**
 * Created without a Strategy — binds the direct `stf_kpi` lookup (never
 * `stf_StrategyKPI`, which only exists once clustered). `stf_kpi` and
 * `stf_strategykpi` are mutually exclusive: this is the "not yet assigned"
 * state (`stf_kpi` set, `stf_strategykpi` null) — assignItemToStrategy below
 * flips it to "assigned" by clearing `stf_kpi` once `stf_strategykpi` is set.
 */
export async function createBottomUpTactic(draft: BottomUpTacticDraft): Promise<Tactic> {
  const row = resultOrThrow(
    await Stf_strategytacticsService.create({
      statecode: 0,
      stf_tacticname: draft.name,
      stf_tacticdescription: draft.description,
      "stf_KPI@odata.bind": bindRef("kpi", draft.kpiId),
      "stf_TacticCategory@odata.bind": bindRef("executionCategory", draft.categoryId),
      "stf_Assignee@odata.bind": bindRef("user", draft.assigneeId),
      stf_target: draft.target,
      stf_deadline: draft.deadline,
      stf_currentbaseline: draft.currentBaseline,
      stf_neededbudget: draft.neededBudget,
      stf_tacticstatus: TACTIC_STATUS_ACTIVE,
      ...(draft.processId ? { "stf_Process@odata.bind": bindRef("process", draft.processId) } : {}),
    }),
    "Create tactic (bottom-up)"
  );
  return toTactic(row);
}

export async function createBottomUpPoc(draft: BottomUpPocDraft): Promise<Poc> {
  const row = resultOrThrow(
    await Stf_strategypocsService.create({
      statecode: 0,
      stf_pocname: draft.name,
      stf_pocdescription: draft.description,
      "stf_KPI@odata.bind": bindRef("kpi", draft.kpiId),
      "stf_POCCategory@odata.bind": bindRef("executionCategory", draft.categoryId),
      stf_experimentscope: draft.experimentScope,
      stf_kpitargetvalue: draft.kpiTargetValue,
      stf_successduedate: draft.successDueDate,
      stf_killcondition: draft.killCondition,
      stf_from: draft.from,
      stf_to: draft.to,
      stf_neededbudget: draft.neededBudget,
      stf_pocstatus: POC_STATUS_ACTIVE,
      ...(draft.regionId ? { "stf_Region@odata.bind": bindRef("region", draft.regionId) } : {}),
      ...(draft.specialtyId ? { "stf_Specialty@odata.bind": bindRef("specialty", draft.specialtyId) } : {}),
      ...(draft.projectId ? { "stf_Project@odata.bind": bindRef("project", draft.projectId) } : {}),
    }),
    "Create POC (bottom-up)"
  );
  return toPoc(row);
}

/** "Unassigned" = a Tactic/POC with no Strategy-KPI junction at all — the sole definition (spec addendum §2.1). */
export async function fetchUnassignedItems(): Promise<UnassignedItem[]> {
  const [tacticRows, pocRows] = await Promise.all([
    resultOrThrow(await Stf_strategytacticsService.getAll({ filter: "_stf_strategykpi_value eq null" }), "List unassigned tactics"),
    resultOrThrow(await Stf_strategypocsService.getAll({ filter: "_stf_strategykpi_value eq null" }), "List unassigned POCs"),
  ]);

  const kpiIds = Array.from(
    new Set([...tacticRows.map((r) => r._stf_kpi_value), ...pocRows.map((r) => r._stf_kpi_value)].filter((id): id is string => !!id))
  );
  const kpiFilter = kpiIds.map((id) => `strategy_kpisid eq '${id}'`).join(" or ");
  const kpis = kpiIds.length ? resultOrThrow(await Strategy_kpisesService.getAll({ filter: kpiFilter }), "List KPIs for unassigned items") : [];
  const kpiById = new Map(kpis.map((k) => [k.strategy_kpisid, k]));

  const tactics: UnassignedItem[] = tacticRows.map((r) => {
    const kpi = r._stf_kpi_value ? kpiById.get(r._stf_kpi_value) : undefined;
    return {
      id: r.stf_strategytacticid,
      kind: "Tactic",
      name: r.stf_tacticname,
      current: r.stf_currentbaseline,
      target: r.stf_target,
      kpiId: r._stf_kpi_value,
      kpiName: r.stf_kpiname,
      departmentId: kpi?._strategy_department_value,
      functionId: kpi?._strategy_function_value,
    };
  });
  const pocs: UnassignedItem[] = pocRows.map((r) => {
    const kpi = r._stf_kpi_value ? kpiById.get(r._stf_kpi_value) : undefined;
    return {
      id: r.stf_strategypocid,
      kind: "Poc",
      name: r.stf_pocname,
      current: undefined,
      target: r.stf_kpitargetvalue,
      kpiId: r._stf_kpi_value,
      kpiName: r.stf_kpiname,
      departmentId: kpi?._strategy_department_value,
      functionId: kpi?._strategy_function_value,
    };
  });
  return [...tactics, ...pocs];
}

/**
 * The clustering primitive: find-or-create the Strategy-KPI junction, bind
 * `stf_StrategyKPI` to it, and clear the item's direct `stf_kpi` lookup in
 * the same update. `stf_strategykpi` and `stf_kpi` are mutually exclusive —
 * once assigned, the KPI is reachable only through the junction.
 */
export async function assignItemToStrategy(item: UnassignedItem, strategyId: string): Promise<void> {
  const strategyKpi = await findOrCreateStrategyKpi(strategyId, item.kpiId ?? "", item.kpiName ?? "Strategy KPI");
  if (item.kind === "Tactic") {
    resultOrThrow(
      await Stf_strategytacticsService.update(item.id, {
        "stf_StrategyKPI@odata.bind": bindRef("strategyKpi", strategyKpi.id),
        "stf_KPI@odata.bind": null,
      } as unknown as Partial<Omit<Stf_strategytacticsBase, "stf_strategytacticid">>),
      "Assign tactic to strategy"
    );
  } else {
    resultOrThrow(
      await Stf_strategypocsService.update(item.id, {
        "stf_StrategyKPI@odata.bind": bindRef("strategyKpi", strategyKpi.id),
        "stf_KPI@odata.bind": null,
      } as unknown as Partial<Omit<Stf_strategypocsBase, "stf_strategypocid">>),
      "Assign POC to strategy"
    );
  }
}
