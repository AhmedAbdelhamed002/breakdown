import { Stf_revisioncommentsService } from "@generated/services/Stf_revisioncommentsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toComment, type Comment } from "../models/comment";
import { logDecision } from "./workflowService";

const CHANGE_REQUEST_TYPE = 2;
const STATUS_OPEN = 1;
const STATUS_RESOLVED = 2;
const DECISION_ACTION_CR_RESOLVED = 3;
const DECISION_ACTION_CR_REOPENED = 7;

/**
 * Cross-strategy Change Requests view. Unlike the legacy source (which reads
 * every Strategy/ObjectiveDepartment/Objective row to resolve context), this
 * lists Change Requests directly — Department/Function/Objective context per
 * row is left to the caller to resolve from the already-loaded Strategy list
 * (`listStrategies()`) rather than a second full-table join here.
 */
export async function listChangeRequests(): Promise<Comment[]> {
  const rows = resultOrThrow(
    await Stf_revisioncommentsService.getAll({
      filter: `stf_type eq ${CHANGE_REQUEST_TYPE}`,
      orderBy: ["createdon desc"],
    }),
    "List change requests"
  );
  return rows.map(toComment);
}

export async function resolveChangeRequest(id: string, strategyId: string, resolvedById: string, actorId: string, response?: string): Promise<void> {
  resultOrThrow(
    await Stf_revisioncommentsService.update(id, {
      stf_status: STATUS_RESOLVED,
      stf_resolvedon: new Date().toISOString(),
      stf_response: response,
      "stf_ResolvedBy@odata.bind": bindRef("user", resolvedById),
    }),
    "Resolve change request"
  );
  await logDecision(strategyId, DECISION_ACTION_CR_RESOLVED, actorId, "Change request resolved");
}

/** Reopening intentionally leaves the prior resolver/response in place as an audit trail rather than clearing them. */
export async function reopenChangeRequest(id: string, strategyId: string, actorId: string): Promise<void> {
  resultOrThrow(await Stf_revisioncommentsService.update(id, { stf_status: STATUS_OPEN }), "Reopen change request");
  await logDecision(strategyId, DECISION_ACTION_CR_REOPENED, actorId, "Change request reopened");
}
