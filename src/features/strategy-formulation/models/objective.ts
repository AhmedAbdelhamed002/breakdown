import type { Stf_organizationalobjectives } from "@generated/models/Stf_organizationalobjectivesModel";

export const OBJECTIVE_TYPE_CROSS_DEPARTMENTAL = 1;
export const OBJECTIVE_TYPE_DEPARTMENTAL = 2;

export interface Objective {
  id: string;
  title: string;
  description?: string;
  type: number;
  status: number;
  year?: string;
  departmentId?: string;
  departmentName?: string;
  functionId?: string;
  functionName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
  regionId?: string;
  regionName?: string;
  parentThemeId?: string;
  parentThemeName?: string;
  ownerId?: string;
  ownerName?: string;
  primaryKpiId?: string;
  primaryKpiName?: string;
  currentValue?: number;
  targetValue?: number;
  startDate?: string;
  endDate?: string;
  /** Org Output this objective was created against (`pm_orgoutputkpi` lookup — despite the name, it points at `pm_orgoutput`, not a KPI table). At most one objective may exist per Org Output. */
  orgOutputId?: string;
}

/** Input captured by the Create/Edit Objective dialog. */
export interface ObjectiveDraft {
  title: string;
  type: number;
  departmentId: string;
  functionId?: string;
  businessUnitId?: string;
  regionId: string;
  parentThemeId?: string;
  ownerId: string;
  primaryKpiId: string;
  currentValue: number;
  targetValue: number;
  startDate: string;
  endDate: string;
  year?: string;
  orgOutputId?: string;
}

/** Dataverse returns these as full ISO datetimes (e.g. "2026-08-18T00:00:00Z") — `<input type="date">` requires the bare "YYYY-MM-DD" it expects back on write. */
function toDateOnly(value: string | undefined): string | undefined {
  return value ? value.slice(0, 10) : value;
}

export function toObjective(row: Stf_organizationalobjectives): Objective {
  return {
    id: row.stf_organizationalobjectiveid,
    title: row.stf_title ?? "(untitled objective)",
    description: row.stf_objectivedescription,
    type: row.stf_objectivetype ?? OBJECTIVE_TYPE_CROSS_DEPARTMENTAL,
    status: row.stf_objectivestatus ?? 1,
    year: row.stf_year,
    departmentId: row._stf_department_value,
    departmentName: row.stf_departmentname,
    functionId: row._stf_function_value,
    functionName: row.stf_functionname,
    businessUnitId: row._stf_bu_value,
    businessUnitName: row.stf_buname,
    regionId: row._stf_region_value,
    regionName: row.stf_regionname,
    parentThemeId: row._stf_parenttheme_value,
    parentThemeName: row.stf_parentthemename,
    ownerId: row._stf_owner_value,
    ownerName: row.stf_ownername,
    primaryKpiId: row._stf_primarykpi_value,
    primaryKpiName: row.stf_primarykpiname,
    currentValue: row.stf_currentvalue,
    targetValue: row.stf_targetvalue,
    startDate: toDateOnly(row.stf_startdate),
    endDate: toDateOnly(row.stf_enddate),
    orgOutputId: row._pm_orgoutputkpi_value,
  };
}
