import type { BadgeStatus } from "@shared/components/Badge/Badge";

export type RevisionStatus = "Draft" | "Submitted" | "UnderReview" | "ChangesRequested" | "Approved" | "Rejected" | "Reopened";

export const REVISION_STATUS_BY_CODE: Record<number, RevisionStatus> = {
  1: "Draft",
  2: "Submitted",
  3: "UnderReview",
  4: "ChangesRequested",
  5: "Approved",
  6: "Rejected",
  7: "Reopened",
};

export const REVISION_STATUS_CODE: Record<RevisionStatus, number> = {
  Draft: 1,
  Submitted: 2,
  UnderReview: 3,
  ChangesRequested: 4,
  Approved: 5,
  Rejected: 6,
  Reopened: 7,
};

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  Draft: "Draft",
  Submitted: "Submitted",
  UnderReview: "Under Review",
  ChangesRequested: "Changes Requested",
  Approved: "Approved (Locked)",
  Rejected: "Rejected",
  Reopened: "Reopened",
};

// Reopened intentionally reuses the "review" visual style — no distinct
// badge look in the legacy source (docs/strategy-formulation-spec.md §3).
export const REVISION_STATUS_BADGE: Record<RevisionStatus, BadgeStatus> = {
  Draft: "draft",
  Submitted: "submitted",
  UnderReview: "review",
  ChangesRequested: "changes",
  Approved: "approved",
  Rejected: "rejected",
  Reopened: "review",
};

/** submitted or under review: the whole strategy is locked read-only. */
export function isPendingReview(status: RevisionStatus): boolean {
  return status === "Submitted" || status === "UnderReview";
}

/** pending review or approved: core fields lock, but KPIs/Tactics/POCs can still be added. */
export function isLocked(status: RevisionStatus): boolean {
  return isPendingReview(status) || status === "Approved";
}
