import { Badge } from "@shared/components/Badge/Badge";
import { REVISION_STATUS_BADGE, REVISION_STATUS_LABEL, type RevisionStatus } from "../constants/revisionStatus";

export function StatusBadge({ status }: { status: RevisionStatus }) {
  return <Badge status={REVISION_STATUS_BADGE[status]}>{REVISION_STATUS_LABEL[status]}</Badge>;
}
