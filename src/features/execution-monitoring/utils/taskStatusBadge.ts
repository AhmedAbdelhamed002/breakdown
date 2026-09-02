import { Hx_taskseshx_status, Hx_taskseshx_priority } from "@generated/models/Hx_tasksesModel";

/** Maps each hx_status option to one of the app's existing badge color classes (see components.css) —
 * shared by TaskTree's read-only status badge and TaskDetailsDialog so both agree on one look. */
const STATUS_BADGE_CLASS: Record<number, string> = {
  123200004: "st-draft", // New
  100000001: "st-sealed", // In Progress
  123200005: "st-submitted", // Submitted
  100000005: "st-changes", // On Hold
  123200002: "st-approved", // Closed
  123200003: "st-superseded", // Cancelled
  931940001: "st-returned", // Rejected
};

const PRIORITY_BADGE_CLASS: Record<number, string> = {
  123200000: "st-draft", // Low
  123200001: "st-submitted", // Medium
  123200002: "st-changes", // High
  931940001: "st-returned", // Critical
};

/** hx_statusname/hx_priorityname (Dataverse's own shadow columns) aren't reliably populated by the
 * Code Apps SDK — status/priority are local choice fields though, so the label is just looked up
 * client-side from the numeric value instead of trusted from the row (see taskService.ts's
 * enrichExecTasks for the analogous fix on actual lookup — not choice — fields). */
export function statusLabel(status: number, fallback?: string): string {
  return (status in Hx_taskseshx_status ? Hx_taskseshx_status[status as Hx_taskseshx_status] : fallback) ?? "—";
}

export function statusBadgeClass(status: number): string {
  return STATUS_BADGE_CLASS[status] ?? "st-draft";
}

export function priorityLabel(priority: number | undefined, fallback?: string): string {
  if (priority == null) return fallback ?? "—";
  return (priority in Hx_taskseshx_priority ? Hx_taskseshx_priority[priority as Hx_taskseshx_priority] : fallback) ?? "—";
}

export function priorityBadgeClass(priority: number | undefined): string {
  return (priority != null && PRIORITY_BADGE_CLASS[priority]) || "st-draft";
}
