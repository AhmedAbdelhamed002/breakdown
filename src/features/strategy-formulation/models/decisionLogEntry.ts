import type { Stf_decisionlogs, Stf_decisionlogsstf_action } from "@generated/models/Stf_decisionlogsModel";

export interface DecisionLogEntry {
  id: string;
  strategyId: string;
  action: Stf_decisionlogsstf_action;
  actionName?: string;
  note?: string;
  actorId?: string;
  actorName?: string;
  timestamp?: string;
}

export function toDecisionLogEntry(row: Stf_decisionlogs): DecisionLogEntry {
  return {
    id: row.stf_decisionlogid,
    strategyId: row._stf_parentstrategy_value ?? "",
    action: row.stf_action,
    actionName: row.stf_actionname,
    note: row.stf_note,
    actorId: row._stf_actor_value,
    actorName: row.stf_actorname,
    timestamp: row.stf_timestamp,
  };
}
