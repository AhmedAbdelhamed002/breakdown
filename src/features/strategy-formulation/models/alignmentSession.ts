import type { Stf_alignmentsessions } from "@generated/models/Stf_alignmentsessionsModel";

export const ALIGNMENT_REASON_OPTIONS = [
  { value: 1, label: "Insufficient Tactics or POCs" },
  { value: 2, label: "KPI Deficit" },
  { value: 3, label: "Cross Departmental Alignment" },
];

export const ALIGNMENT_CYCLE_OPTIONS = [
  { value: 1, label: "Annual" },
  { value: 2, label: "Q1" },
  { value: 3, label: "Q2" },
  { value: 4, label: "Q3" },
  { value: 5, label: "Q4" },
];

/** The 3-value set actually wired to any UI action — the schema's separate 5-value `stf_status` field is not driven by this module (spec §6.13). */
export type SessionState = "NotStarted" | "Done" | "Cancelled";

export const SESSION_STATE_BY_CODE: Record<number, SessionState> = { 1: "NotStarted", 2: "Done", 3: "Cancelled" };
export const SESSION_STATE_CODE: Record<SessionState, number> = { NotStarted: 1, Done: 2, Cancelled: 3 };
export const SESSION_STATE_LABEL: Record<SessionState, string> = { NotStarted: "Not Started", Done: "Done", Cancelled: "Cancelled" };

export interface AlignmentSession {
  id: string;
  name?: string;
  reason: number;
  reasonLabel?: string;
  state: SessionState;
  fiscalYear: number;
  cycle: number;
  cycleLabel?: string;
  strategyId?: string;
  strategyName?: string;
  departmentId?: string;
  departmentName?: string;
  regionId?: string;
  regionName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
  chairId?: string;
  chairName?: string;
  facilitatorId?: string;
  facilitatorName?: string;
  decisionNote?: string;
  sessionDate?: string;
  createdOn?: string;
  createdById?: string;
  createdByName?: string;
}

export interface AlignmentSessionDraft {
  strategyId: string;
  reason: number;
  cycle: number;
  fiscalYear: number;
}

export function toAlignmentSession(row: Stf_alignmentsessions): AlignmentSession {
  return {
    id: row.stf_alignmentsessionid,
    name: row.stf_name,
    reason: row.stf_reason,
    reasonLabel: row.stf_reasonname,
    state: SESSION_STATE_BY_CODE[row.stf_sessionstate ?? 1] ?? "NotStarted",
    fiscalYear: row.stf_fiscalyear,
    cycle: row.stf_cycle,
    cycleLabel: row.stf_cyclename,
    strategyId: row._stf_parentstrategy_value,
    strategyName: row.stf_parentstrategyname,
    departmentId: row._stf_department_value,
    departmentName: row.stf_departmentname,
    regionId: row._stf_region_value,
    regionName: row.stf_regionname,
    businessUnitId: row._stf_businessunit_value,
    businessUnitName: row.stf_businessunitname,
    chairId: row._stf_chair_value,
    chairName: row.stf_chairname,
    facilitatorId: row._stf_facilitator_value,
    facilitatorName: row.stf_facilitatorname,
    decisionNote: row.stf_decisionnote,
    sessionDate: row.stf_sessiondate,
    createdOn: row.createdon,
    createdById: row._createdby_value,
    createdByName: row.createdbyname,
  };
}
