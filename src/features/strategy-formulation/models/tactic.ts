import type { Stf_strategytactics } from "@generated/models/Stf_strategytacticsModel";

export interface Tactic {
  id: string;
  strategyKpiId: string;
  strategyKpiName?: string;
  /** Direct KPI lookup — set only on Bottom-Up-created items, at creation time, and cleared once clustered into a Strategy (spec §6.19) — mutually exclusive with `strategyKpiId`. Read via `strategyKpiId`'s junction once clustered, not this field. */
  kpiId?: string;
  kpiName?: string;
  name?: string;
  description?: string;
  target?: number;
  currentBaseline?: number;
  neededBudget?: number;
  deadline?: string;
  status: number;
  statusName?: string;
  categoryId?: string;
  categoryName?: string;
  assigneeId?: string;
  assigneeName?: string;
  processId?: string;
  processName?: string;
  serviceExecutionMode?: number;
  /** Direct lookup (pm_driverkpi) — set only via TacticImpactDialog, independent of strategyKpiId
   * (unlike POC, a Tactic's Driver KPI is stored directly rather than derived through a junction). */
  driverKpiId?: string;
  /** pm_region — same Region concept as POC's own stf_region (crd04_regions), used the same way to
   * decide Region = Group for TacticImpactDialog's multi-Business-Unit flow. */
  regionId?: string;
  regionName?: string;
}

export interface TacticDraft {
  name: string;
  description: string;
  strategyKpiId: string;
  categoryId: string;
  assigneeId: string;
  target: number;
  deadline: string;
  currentBaseline?: number;
  neededBudget?: number;
  processId?: string;
  serviceExecutionMode?: number;
  driverKpiId?: string;
  regionId?: string;
}

/** Dataverse returns this as a full ISO datetime (e.g. "2026-08-22T00:00:00Z") — `<input type="date">` requires the bare "YYYY-MM-DD" it expects back on write. */
function toDateOnly(value: string | undefined): string | undefined {
  return value ? value.slice(0, 10) : value;
}

export function toTactic(row: Stf_strategytactics): Tactic {
  return {
    id: row.stf_strategytacticid,
    strategyKpiId: row._stf_strategykpi_value ?? "",
    strategyKpiName: row.stf_strategykpiname,
    kpiId: row._stf_kpi_value,
    kpiName: row.stf_kpiname,
    name: row.stf_tacticname,
    description: row.stf_tacticdescription,
    target: row.stf_target,
    currentBaseline: row.stf_currentbaseline,
    neededBudget: row.stf_neededbudget,
    deadline: toDateOnly(row.stf_deadline),
    status: row.stf_tacticstatus ?? 1,
    statusName: row.stf_tacticstatusname,
    categoryId: row._stf_tacticcategory_value,
    categoryName: row.stf_tacticcategoryname,
    assigneeId: row._stf_assignee_value,
    assigneeName: row.stf_assigneename,
    processId: row._stf_process_value,
    processName: row.stf_processname,
    serviceExecutionMode: row.stf_serviceexecutionmode,
    driverKpiId: row._pm_driverkpi_value,
    regionId: row._pm_region_value,
    regionName: row.pm_regionname,
  };
}
