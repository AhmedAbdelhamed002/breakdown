import type { Stf_strategypocs } from "@generated/models/Stf_strategypocsModel";

export interface Poc {
  id: string;
  strategyKpiId: string;
  strategyKpiName?: string;
  /** Direct KPI lookup — set only on Bottom-Up-created items, at creation time, and cleared once clustered into a Strategy (spec §6.19) — mutually exclusive with `strategyKpiId`. Read via `strategyKpiId`'s junction once clustered, not this field. */
  kpiId?: string;
  kpiName?: string;
  name?: string;
  description?: string;
  experimentScope?: string;
  kpiTargetValue?: number;
  successDueDate?: string;
  killCondition?: string;
  from?: string;
  to?: string;
  neededBudget?: number;
  status: number;
  statusName?: string;
  categoryId?: string;
  categoryName?: string;
  regionId?: string;
  regionName?: string;
  specialtyId?: string;
  specialtyName?: string;
  projectId?: string;
  projectName?: string;
  /** Stale for any POC created after the pm_Model-write fix — pocService.ts no longer writes this
   * column (see its own note), so it only ever reflects a value set before that change. Never
   * trusted for display/logic in PocImpactDialog, which always re-derives the current Financial
   * Model from the POC's own pm_pocimpacts rows via getPocImpactConfigForPoc instead. */
  financialModelId?: string;
  financialModelName?: string;
  serviceExecutionMode?: number;
  /** Stale for the same reason as financialModelId above — pm_startmonth is no longer written. */
  startMonth?: number;
}

export interface PocDraft {
  name: string;
  description: string;
  strategyKpiId: string;
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
  serviceExecutionMode?: number;
  projectId?: string;
}

/** Dataverse returns these as full ISO datetimes (e.g. "2026-08-22T00:00:00Z") — `<input type="date">` requires the bare "YYYY-MM-DD" it expects back on write. */
function toDateOnly(value: string | undefined): string | undefined {
  return value ? value.slice(0, 10) : value;
}

export function toPoc(row: Stf_strategypocs): Poc {
  return {
    id: row.stf_strategypocid,
    strategyKpiId: row._stf_strategykpi_value ?? "",
    strategyKpiName: row.stf_strategykpiname,
    kpiId: row._stf_kpi_value,
    kpiName: row.stf_kpiname,
    name: row.stf_pocname,
    description: row.stf_pocdescription,
    experimentScope: row.stf_experimentscope,
    kpiTargetValue: row.stf_kpitargetvalue,
    successDueDate: toDateOnly(row.stf_successduedate),
    killCondition: row.stf_killcondition,
    from: toDateOnly(row.stf_from),
    to: toDateOnly(row.stf_to),
    neededBudget: row.stf_neededbudget,
    status: row.stf_pocstatus ?? 1,
    statusName: row.stf_pocstatusname,
    categoryId: row._stf_poccategory_value,
    categoryName: row.stf_poccategoryname,
    regionId: row._stf_region_value,
    regionName: row.stf_regionname,
    specialtyId: row._stf_specialty_value,
    specialtyName: row.stf_specialtyname,
    projectId: row._stf_project_value,
    projectName: row.stf_projectname,
    financialModelId: row._pm_model_value,
    financialModelName: row.pm_modelname,
    serviceExecutionMode: row.stf_serviceexecutionmode,
    startMonth: row.pm_startmonth,
  };
}
