import { useAsync } from "@shared/hooks/useAsync";
import { listChangeRequests, resolveChangeRequest, reopenChangeRequest } from "../services/changeRequestService";
import { listStrategies } from "../services/strategyService";
import type { Comment } from "../models/comment";

export interface ChangeRequestRow extends Comment {
  departmentName?: string;
  functionName?: string;
}

export function useChangeRequests() {
  const { data, loading, error, reload } = useAsync<ChangeRequestRow[]>(async () => {
    const [comments, strategies] = await Promise.all([listChangeRequests(), listStrategies()]);
    const strategyById = new Map(strategies.map((s) => [s.id, s]));
    return comments.map((c) => {
      const strat = strategyById.get(c.strategyId);
      return { ...c, departmentName: strat?.departmentName, functionName: strat?.functionName };
    });
  }, []);

  async function resolve(id: string, strategyId: string, resolvedById: string, actorId: string, response?: string) {
    await resolveChangeRequest(id, strategyId, resolvedById, actorId, response);
    await reload();
  }

  async function reopen(id: string, strategyId: string, actorId: string) {
    await reopenChangeRequest(id, strategyId, actorId);
    await reload();
  }

  return { rows: data, loading, error, reload, resolve, reopen };
}
