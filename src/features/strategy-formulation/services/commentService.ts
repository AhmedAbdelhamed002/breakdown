import { Stf_revisioncommentsService } from "@generated/services/Stf_revisioncommentsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toComment, type Comment, type CommentType } from "../models/comment";

export async function listComments(strategyId: string): Promise<Comment[]> {
  const rows = resultOrThrow(
    await Stf_revisioncommentsService.getAll({
      filter: `_stf_parentstrategy_value eq '${strategyId}'`,
      orderBy: ["createdon desc"],
    }),
    "List comments"
  );
  return rows.map(toComment);
}

export interface AddCommentOptions {
  /** Real FK attach target (live schema) — set one at most, tying the comment/CR to a specific Tactic or POC. */
  attachedTacticId?: string;
  attachedPocId?: string;
}

export async function addComment(
  strategyId: string,
  text: string,
  type: CommentType,
  authorId: string,
  options?: AddCommentOptions
): Promise<Comment> {
  const attachLevel = options?.attachedTacticId ? 2 : options?.attachedPocId ? 3 : 1;
  const row = resultOrThrow(
    await Stf_revisioncommentsService.create({
      statecode: 0,
      stf_name: "Comment",
      stf_type: type === "ChangeRequest" ? 2 : 1,
      stf_attachlevel: attachLevel,
      stf_text: text,
      stf_status: 1,
      "stf_ParentStrategy@odata.bind": bindRef("strategy", strategyId),
      "stf_Author@odata.bind": bindRef("user", authorId),
      ...(options?.attachedTacticId ? { "stf_AttachedTactic@odata.bind": bindRef("strategyTactic", options.attachedTacticId) } : {}),
      ...(options?.attachedPocId ? { "stf_AttachedPOC@odata.bind": bindRef("strategyPoc", options.attachedPocId) } : {}),
    }),
    "Add comment"
  );
  return toComment(row);
}
