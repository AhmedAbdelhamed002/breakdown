import type { Stf_revisioncomments } from "@generated/models/Stf_revisioncommentsModel";

export type CommentType = "Comment" | "ChangeRequest";
export type CommentStatus = "Open" | "Resolved";

export interface Comment {
  id: string;
  strategyId: string;
  strategyName?: string;
  type: CommentType;
  text: string;
  status: CommentStatus;
  authorId?: string;
  authorName?: string;
  createdOn?: string;
  /** Real FK attach target — the live schema resolves the legacy's label-only "attach level" gap. */
  attachedTacticId?: string;
  attachedTacticName?: string;
  attachedPocId?: string;
  attachedPocName?: string;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedOn?: string;
  response?: string;
}

export function toComment(row: Stf_revisioncomments): Comment {
  return {
    id: row.stf_revisioncommentid,
    strategyId: row._stf_parentstrategy_value ?? "",
    strategyName: row.stf_parentstrategyname,
    type: row.stf_type === 2 ? "ChangeRequest" : "Comment",
    text: row.stf_text,
    status: row.stf_status === 2 ? "Resolved" : "Open",
    authorId: row._stf_author_value,
    authorName: row.stf_authorname,
    createdOn: row.createdon,
    attachedTacticId: row._stf_attachedtactic_value,
    attachedTacticName: row.stf_attachedtacticname,
    attachedPocId: row._stf_attachedpoc_value,
    attachedPocName: row.stf_attachedpocname,
    resolvedById: row._stf_resolvedby_value,
    resolvedByName: row.stf_resolvedbyname,
    resolvedOn: row.stf_resolvedon,
    response: row.stf_response,
  };
}
