import { Cr603_chklst_departmentsesService } from "@generated/services/Cr603_chklst_departmentsesService";
import { BusinessunitsService } from "@generated/services/BusinessunitsService";
import { Crd04_regionsesService } from "@generated/services/Crd04_regionsesService";
import { Crd04_specialtiesesService } from "@generated/services/Crd04_specialtiesesService";
import { Cr603_entitiesesService } from "@generated/services/Cr603_entitiesesService";
import { Hr_functionsService } from "@generated/services/Hr_functionsService";
import { Strategy_processesService } from "@generated/services/Strategy_processesService";
import { And_companiesService } from "@generated/services/And_companiesService";
import { SystemusersService } from "@generated/services/SystemusersService";
import { Strategy_kpisesService } from "@generated/services/Strategy_kpisesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import type { PickerOption } from "../models/reference";

export async function listBusinessUnits(regionId?: string): Promise<PickerOption[]> {
  const filter = regionId ? `_cr603_region_value eq '${regionId}'` : undefined;
  const rows = resultOrThrow(await BusinessunitsService.getAll({ filter, orderBy: ["name asc"] }), "List business units");
  return rows.map((r) => ({ id: r.businessunitid, label: r.name }));
}

export async function listDepartments(): Promise<PickerOption[]> {
  const rows = resultOrThrow(
    await Cr603_chklst_departmentsesService.getAll({ orderBy: ["cr603_department asc"] }),
    "List departments"
  );
  return rows.map((r) => ({ id: r.cr603_chklst_departmentsid, label: r.cr603_department }));
}

export async function listRegions(): Promise<PickerOption[]> {
  const rows = resultOrThrow(await Crd04_regionsesService.getAll({ orderBy: ["crd04_id asc"] }), "List regions");
  return rows.map((r) => ({ id: r.crd04_regionsid, label: r.crd04_id }));
}

/**
 * POC/Objective's own "Specialty" scope — stf_strategypocs.stf_Specialty actually targets
 * crd04_specialties, confirmed live (writing a cr301_specialtyksa_service_hubs id there 404s with
 * "Entity 'crd04_Specialties' ... Does Not Exist"). Not to be confused with
 * cr301_specialtyksa_service_hubs, a different table used only for the KPI breakdown dimension's own
 * "Specialty" lookup (see BreakdownDimensionService.ts) — same display name, unrelated relationship.
 */
export async function listSpecialties(): Promise<PickerOption[]> {
  const rows = resultOrThrow(
    await Crd04_specialtiesesService.getAll({ orderBy: ["crd04_title asc"] }),
    "List specialties"
  );
  return rows.map((r) => ({ id: r.crd04_specialtiesid, label: r.crd04_title }));
}

/** cr603_projectses.cr603_Entity's target — the Project create form's "Entity" lookup. */
export async function listProjectEntities(): Promise<PickerOption[]> {
  const rows = resultOrThrow(
    await Cr603_entitiesesService.getAll({ orderBy: ["cr603_newcolumn asc"] }),
    "List entities"
  );
  return rows.map((r) => ({ id: r.cr603_entitiesid, label: r.cr603_newcolumn }));
}

export async function listFunctionsByDepartment(departmentId?: string): Promise<PickerOption[]> {
  const filter = departmentId ? `_hr_department_value eq '${departmentId}'` : undefined;
  const rows = resultOrThrow(await Hr_functionsService.getAll({ filter, orderBy: ["hr_name asc"] }), "List functions");
  return rows.map((r) => ({ id: r.hr_functionid, label: r.hr_name }));
}

export async function listMainProcessesByDepartment(departmentId?: string): Promise<PickerOption[]> {
  const filters = ["strategy_processtype eq 620930000"];
  if (departmentId) filters.push(`_strategy_department_value eq '${departmentId}'`);
  const rows = resultOrThrow(
    await Strategy_processesService.getAll({ filter: filters.join(" and "), orderBy: ["strategy_newcolumn asc"] }),
    "List processes"
  );
  return rows.map((r) => ({ id: r.strategy_processid, label: r.strategy_newcolumn }));
}

export async function listSubProcesses(mainProcessId: string): Promise<PickerOption[]> {
  const rows = resultOrThrow(
    await Strategy_processesService.getAll({
      filter: `strategy_processtype eq 620930001 and _strategy_mainprocess_value eq '${mainProcessId}'`,
      orderBy: ["strategy_newcolumn asc"],
    }),
    "List sub-processes"
  );
  return rows.map((r) => ({ id: r.strategy_processid, label: r.strategy_newcolumn }));
}

export async function listCompanies(): Promise<PickerOption[]> {
  const rows = resultOrThrow(await And_companiesService.getAll({ orderBy: ["and_name asc"] }), "List companies");
  return rows.map((r) => ({ id: r.and_companyid, label: r.and_name }));
}

export async function searchUsers(term: string): Promise<PickerOption[]> {
  const filter = term ? `contains(fullname,'${term.replace(/'/g, "''")}')` : undefined;
  const rows = resultOrThrow(
    await SystemusersService.getAll({ filter, top: 25, orderBy: ["fullname asc"] }),
    "Search users"
  );
  return rows.filter((r) => !r.isdisabled).map((r) => ({ id: r.systemuserid, label: r.fullname ?? r.domainname }));
}

/**
 * A single user's display name by id — a live-search LookupField (no
 * preloaded options list) has no other way to show a pre-selected user's
 * name, and the row's own denormalized `*name` shadow field the caller might
 * have isn't reliably populated by the Code Apps SDK.
 */
export async function getUserLabel(userId: string): Promise<PickerOption | undefined> {
  const row = resultOrThrow(await SystemusersService.get(userId), "Get user");
  return row ? { id: row.systemuserid, label: row.fullname ?? row.domainname } : undefined;
}

/** A user's own manager (systemusers' parentsystemuserid) — used to suggest Direct Manager once an
 * Assignee is picked on a task form, so the user isn't required to look that up separately. */
export async function getUserManager(userId: string): Promise<PickerOption | undefined> {
  const row = resultOrThrow(
    await SystemusersService.get(userId, { select: ["_parentsystemuserid_value"] }),
    "Get user's manager"
  );
  const managerId = row?._parentsystemuserid_value;
  return managerId ? getUserLabel(managerId) : undefined;
}

export async function searchKpis(term: string, departmentId?: string, functionId?: string): Promise<PickerOption[]> {
  const filters: string[] = [];
  if (term) filters.push(`contains(strategy_newcolumn,'${term.replace(/'/g, "''")}')`);
  if (departmentId) filters.push(`_strategy_department_value eq '${departmentId}'`);
  if (functionId) filters.push(`_strategy_function_value eq '${functionId}'`);
  const rows = resultOrThrow(
    await Strategy_kpisesService.getAll({ filter: filters.length ? filters.join(" and ") : undefined, top: 25 }),
    "Search KPIs"
  );
  return rows.map((r) => ({ id: r.strategy_kpisid, label: r.strategy_newcolumn }));
}
