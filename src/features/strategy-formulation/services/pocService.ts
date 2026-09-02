import { Stf_strategypocsService } from "@generated/services/Stf_strategypocsService";
import type { Stf_strategypocs, Stf_strategypocsBase } from "@generated/models/Stf_strategypocsModel";
import { Strategy_kpisesService } from "@generated/services/Strategy_kpisesService";
import { Stf_strategykpisService } from "@generated/services/Stf_strategykpisService";
import { Crd04_regionsesService } from "@generated/services/Crd04_regionsesService";
import { Crd04_specialtiesesService } from "@generated/services/Crd04_specialtiesesService";
import { Cr603_projectsesService } from "@generated/services/Cr603_projectsesService";
import { Pm_modelsService } from "@generated/services/Pm_modelsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toPoc, type Poc, type PocDraft } from "../models/poc";
import { orFilter } from "../utils/odataFilters";

function uniqueIds(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((id): id is string => !!id)));
}

/**
 * The Code Apps data connection doesn't populate Dataverse's auto lookup-name
 * shadow columns (stf_kpiname/stf_strategykpiname/stf_regionname/
 * stf_specialtyname/stf_projectname come back empty even though the
 * relationships are set — same finding as strategyKpiService.ts's
 * getKpiDetail) — so those names are resolved here with one batched lookup
 * per related entity instead of trusted from the row.
 */
async function enrichPocs(rows: Stf_strategypocs[]): Promise<Poc[]> {
  const pocs = rows.map(toPoc);
  const kpiIds = uniqueIds(pocs.map((p) => p.kpiId));
  const strategyKpiIds = uniqueIds(pocs.map((p) => p.strategyKpiId));
  const regionIds = uniqueIds(pocs.map((p) => p.regionId));
  const specialtyIds = uniqueIds(pocs.map((p) => p.specialtyId));
  const projectIds = uniqueIds(pocs.map((p) => p.projectId));
  const financialModelIds = uniqueIds(pocs.map((p) => p.financialModelId));

  const [kpis, strategyKpis, regions, specialties, projects, financialModels] = await Promise.all([
    kpiIds.length ? resultOrThrow(await Strategy_kpisesService.getAll({ filter: orFilter("strategy_kpisid", kpiIds) }), "List KPIs for POCs") : [],
    strategyKpiIds.length ? resultOrThrow(await Stf_strategykpisService.getAll({ filter: orFilter("stf_strategykpiid", strategyKpiIds) }), "List strategy KPIs for POCs") : [],
    regionIds.length ? resultOrThrow(await Crd04_regionsesService.getAll({ filter: orFilter("crd04_regionsid", regionIds) }), "List regions for POCs") : [],
    specialtyIds.length
      ? resultOrThrow(await Crd04_specialtiesesService.getAll({ filter: orFilter("crd04_specialtiesid", specialtyIds) }), "List specialties for POCs")
      : [],
    projectIds.length ? resultOrThrow(await Cr603_projectsesService.getAll({ filter: orFilter("cr603_projectsid", projectIds) }), "List projects for POCs") : [],
    financialModelIds.length ? resultOrThrow(await Pm_modelsService.getAll({ filter: orFilter("pm_modelid", financialModelIds) }), "List financial models for POCs") : [],
  ]);
  const kpiNameById = new Map(kpis.map((k) => [k.strategy_kpisid, k.strategy_newcolumn]));
  const strategyKpiNameById = new Map(strategyKpis.map((k) => [k.stf_strategykpiid, k.stf_name]));
  const regionNameById = new Map(regions.map((r) => [r.crd04_regionsid, r.crd04_id]));
  const specialtyNameById = new Map(specialties.map((s) => [s.crd04_specialtiesid, s.crd04_title]));
  const projectNameById = new Map(projects.map((p) => [p.cr603_projectsid, p.cr603_projectname]));
  const financialModelNameById = new Map(financialModels.map((m) => [m.pm_modelid, m.pm_name]));

  return pocs.map((p) => ({
    ...p,
    kpiName: (p.kpiId && kpiNameById.get(p.kpiId)) || p.kpiName,
    strategyKpiName: strategyKpiNameById.get(p.strategyKpiId) || p.strategyKpiName,
    regionName: (p.regionId && regionNameById.get(p.regionId)) || p.regionName,
    specialtyName: (p.specialtyId && specialtyNameById.get(p.specialtyId)) || p.specialtyName,
    projectName: (p.projectId && projectNameById.get(p.projectId)) || p.projectName,
    financialModelName: (p.financialModelId && financialModelNameById.get(p.financialModelId)) || p.financialModelName,
  }));
}

export async function listPocsByStrategyKpis(strategyKpiIds: string[]): Promise<Poc[]> {
  if (strategyKpiIds.length === 0) return [];
  const rows = resultOrThrow(
    await Stf_strategypocsService.getAll({ filter: orFilter("_stf_strategykpi_value", strategyKpiIds) }),
    "List POCs"
  );
  return enrichPocs(rows);
}

/** By the POC's own id rather than its Related KPI junction — feeds a caller (Top-down Annual's own
 * KPI/impact lookup) that finds POCs a different way, e.g. by which KPI their Impact rows actually
 * touch, which can differ from the POC's own Related KPI (see findPocIdsWithImpactOnKpi). */
export async function listPocsByIds(ids: string[]): Promise<Poc[]> {
  if (ids.length === 0) return [];
  const rows = resultOrThrow(
    await Stf_strategypocsService.getAll({ filter: orFilter("stf_strategypocid", ids) }),
    "List POCs by id"
  );
  return enrichPocs(rows);
}

/** Org-wide listing (no strategy-KPI filter) — feeds Execution Tracking's cross-strategy join. */
export async function listAllPocs(): Promise<Poc[]> {
  const rows = resultOrThrow(await Stf_strategypocsService.getAll({}), "List all POCs");
  return enrichPocs(rows);
}

export async function createPoc(draft: PocDraft): Promise<Poc> {
  const payload: Omit<Stf_strategypocsBase, "stf_strategypocid"> = {
    statecode: 0,
    stf_pocname: draft.name,
    stf_pocdescription: draft.description,
    "stf_StrategyKPI@odata.bind": bindRef("strategyKpi", draft.strategyKpiId),
    "stf_POCCategory@odata.bind": bindRef("executionCategory", draft.categoryId),
    stf_experimentscope: draft.experimentScope,
    stf_kpitargetvalue: draft.kpiTargetValue,
    stf_successduedate: draft.successDueDate,
    stf_killcondition: draft.killCondition,
    stf_from: draft.from,
    stf_to: draft.to,
    stf_neededbudget: draft.neededBudget,
    stf_serviceexecutionmode: draft.serviceExecutionMode as Stf_strategypocsBase["stf_serviceexecutionmode"],
    stf_pocstatus: 1,
  };
  if (draft.regionId) payload["stf_Region@odata.bind"] = bindRef("region", draft.regionId);
  if (draft.specialtyId) payload["stf_Specialty@odata.bind"] = bindRef("specialty", draft.specialtyId);
  if (draft.projectId) payload["stf_Project@odata.bind"] = bindRef("project", draft.projectId);
  // pm_Model/pm_startmonth are intentionally never written here — a Dataverse plugin/workflow
  // registered on stf_strategypocs references a deleted pm_modelterm record whenever the Financial
  // Model lookup is set, on either Create or Update (unidentified after extensive searching; a
  // server-side fix, not something client-side call ordering can work around). Financial Model /
  // Start Month are recorded only on pm_pocimpacts rows instead, and read back via
  // getPocImpactConfigForPoc (pocImpactService.ts) rather than a column on the POC.
  const row = resultOrThrow(await Stf_strategypocsService.create(payload), "Create POC");
  return (await enrichPocs([row]))[0];
}

export async function updatePoc(id: string, draft: Partial<PocDraft> & { status?: number }): Promise<Poc> {
  const payload: Partial<Omit<Stf_strategypocsBase, "stf_strategypocid">> = {
    stf_pocname: draft.name,
    stf_pocdescription: draft.description,
    stf_experimentscope: draft.experimentScope,
    stf_kpitargetvalue: draft.kpiTargetValue,
    stf_successduedate: draft.successDueDate,
    stf_killcondition: draft.killCondition,
    stf_from: draft.from,
    stf_to: draft.to,
    stf_neededbudget: draft.neededBudget,
    stf_pocstatus: draft.status as Stf_strategypocsBase["stf_pocstatus"],
  };
  if (draft.categoryId) payload["stf_POCCategory@odata.bind"] = bindRef("executionCategory", draft.categoryId);
  if (draft.regionId) payload["stf_Region@odata.bind"] = bindRef("region", draft.regionId);
  if (draft.specialtyId) payload["stf_Specialty@odata.bind"] = bindRef("specialty", draft.specialtyId);
  if (draft.projectId) payload["stf_Project@odata.bind"] = bindRef("project", draft.projectId);
  // pm_Model/pm_startmonth intentionally never written — see the note in createPoc above.
  const row = resultOrThrow(await Stf_strategypocsService.update(id, payload), "Update POC");
  return (await enrichPocs([row]))[0];
}

export async function deletePoc(id: string): Promise<void> {
  await Stf_strategypocsService.delete(id);
}
