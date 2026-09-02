import type { Strategy_strategies } from "@generated/models/Strategy_strategiesModel";
import { REVISION_STATUS_BY_CODE, REVISION_STATUS_CODE, type RevisionStatus } from "../constants/revisionStatus";
import { TRACK_OPERATIONAL, TRACK_SERVICE } from "../constants/optionSets";

export type StrategyTrack = "Operational" | "Service";

export interface Strategy {
  id: string;
  name: string;
  description?: string;
  track: StrategyTrack;
  revisionStatus: RevisionStatus;
  strategyType: number;
  strategyTypeName?: string;
  strategyLevel: number;
  complexity: number;
  implementationConfidence?: number;
  companyId?: string;
  departmentId?: string;
  departmentName?: string;
  functionId?: string;
  functionName?: string;
  regionId?: string;
  regionName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
  processId?: string;
  subProcessId?: string;
  objectiveDepartmentId?: string;
  primaryKpiId?: string;
  kpiCurrent?: number;
  kpiTarget?: number;
  specialty?: string;
  startDate?: string;
  endDate?: string;
  supportiveFunctionId?: string;
  supportedStrategyId?: string;
  supportedStrategyName?: string;
  supportedDepartmentId?: string;
  approvedOn?: string;
  approvedById?: string;
}

/** Input captured by the wizard, used to build create/update payloads. */
export interface StrategyDraft {
  name: string;
  description?: string;
  track: number;
  strategyType: number;
  strategyLevel: number;
  complexity: number;
  implementationConfidence: number;
  companyId: string;
  departmentId: string;
  functionId: string;
  regionId: string;
  businessUnitId?: string;
  processId?: string;
  subProcessId?: string;
  objectiveDepartmentId?: string;
  primaryKpiId: string;
  kpiCurrent?: number;
  kpiTarget?: number;
  specialty?: string;
  startDate: string;
  endDate: string;
  supportiveFunctionId?: string;
  supportedStrategyId?: string;
  supportedDepartmentId?: string;
}

/** Dataverse returns these as full ISO datetimes (e.g. "2026-08-22T00:00:00Z") — `<input type="date">` requires the bare "YYYY-MM-DD" it expects back on write. The generated type claims this column is always a string, but Dataverse actually sends `null` for an unset date. */
function toDateOnly(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export function toStrategy(row: Strategy_strategies): Strategy {
  return {
    id: row.strategy_strategyid,
    name: row.strategy_newcolumn,
    description: row.strategy_strategydescription,
    track: row.stf_strategytrack === TRACK_SERVICE ? "Service" : "Operational",
    revisionStatus: REVISION_STATUS_BY_CODE[row.stf_revisionstatus ?? 1] ?? "Draft",
    strategyType: row.strategy_strategytype,
    strategyTypeName: row.strategy_strategytypename,
    strategyLevel: row.strategy_strategylevel,
    complexity: row.strategy_complexity,
    implementationConfidence: row.strategy_implementationconfidence,
    companyId: row._strategy_company_value,
    departmentId: row._cr18c_department_value,
    departmentName: row.cr18c_departmentname,
    functionId: row._strategy_function_value,
    functionName: row.strategy_functionname,
    regionId: row._strategy_region_value,
    regionName: row.strategy_regionname,
    businessUnitId: row._cr18c_businessunit_value,
    businessUnitName: row.cr18c_businessunitname,
    processId: row._cr18c_process_value,
    subProcessId: row._cr18c_subprocess_value,
    objectiveDepartmentId: row._stf_objectivedepartment_value,
    primaryKpiId: row._strategy_kpi_value,
    kpiCurrent: row.strategy_kpiactual,
    kpiTarget: row.strategy_kpitarget,
    specialty: row.cr18c_specialty,
    startDate: toDateOnly(row.strategy_startdate),
    endDate: toDateOnly(row.strategy_enddate),
    supportiveFunctionId: row._stf_supportivefunction_value,
    supportedStrategyId: row._stf_supportedstrategy_value,
    supportedStrategyName: row.stf_supportedstrategyname,
    supportedDepartmentId: row._stf_supporteddepartment_value,
    approvedOn: row.stf_approvedon,
    approvedById: row._stf_approvedby_value,
  };
}

export function revisionStatusCode(status: RevisionStatus): number {
  return REVISION_STATUS_CODE[status];
}

export { TRACK_OPERATIONAL, TRACK_SERVICE };
