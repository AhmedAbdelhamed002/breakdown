import { useAsync } from "@shared/hooks/useAsync";
import { getAlignmentSession, markAlignmentSessionDone, cancelAlignmentSession } from "../services/alignmentSessionService";
import { listAlignmentStakeholders, addAlignmentStakeholder } from "../services/alignmentStakeholderService";
import type { AlignmentSession } from "../models/alignmentSession";
import type { AlignmentStakeholder } from "../models/alignmentStakeholder";

export interface AlignmentSessionDetail {
  session: AlignmentSession;
  stakeholders: AlignmentStakeholder[];
}

export function useAlignmentSession(id: string) {
  const { data, loading, error, reload } = useAsync<AlignmentSessionDetail>(async () => {
    const [session, stakeholders] = await Promise.all([getAlignmentSession(id), listAlignmentStakeholders(id)]);
    return { session, stakeholders };
  }, [id]);

  async function markDone() {
    await markAlignmentSessionDone(id);
    await reload();
  }

  async function cancel() {
    await cancelAlignmentSession(id);
    await reload();
  }

  async function addStakeholder(stakeholderId: string, stakeholderName: string, departmentId?: string) {
    await addAlignmentStakeholder(id, stakeholderId, stakeholderName, departmentId);
    await reload();
  }

  return { data, loading, error, reload, markDone, cancel, addStakeholder };
}
