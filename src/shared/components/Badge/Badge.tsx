import type { ReactNode } from "react";

export type BadgeStatus =
  | "draft"
  | "submitted"
  | "review"
  | "approved"
  | "rejected"
  | "changes"
  | "auto"
  | "manual"
  | "sealed"
  | "returned"
  | "superseded"
  | "retired";

const STATUS_CLASS: Record<BadgeStatus, string> = {
  draft: "st-draft",
  submitted: "st-submitted",
  review: "st-review",
  approved: "st-approved",
  rejected: "st-rejected",
  changes: "st-changes",
  auto: "auto",
  manual: "manual",
  sealed: "st-sealed",
  returned: "st-returned",
  superseded: "st-superseded",
  retired: "st-retired",
};

export function Badge({ status, children }: { status: BadgeStatus; children: ReactNode }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{children}</span>;
}
