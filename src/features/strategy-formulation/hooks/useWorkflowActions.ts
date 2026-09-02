import { useState } from "react";
import { resolveCurrentUserId } from "@infrastructure/authentication/currentUser";
import {
  submitForReview as submitForReviewService,
  approveStrategy as approveStrategyService,
  requestChanges as requestChangesService,
  rejectStrategy as rejectStrategyService,
  reopenStrategy as reopenStrategyService,
} from "../services/workflowService";
import type { Strategy } from "../models/strategy";

export function useWorkflowActions(strategyId: string | undefined, onChanged: (strategy: Strategy) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: (id: string, actor: string) => Promise<Strategy>) {
    const actorId = await resolveCurrentUserId();
    if (!strategyId || !actorId) {
      setError("Cannot determine the signed-in user. This action requires the Power Platform host context.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn(strategyId, actorId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    error,
    submit: () => run(submitForReviewService),
    approve: () => run(approveStrategyService),
    requestChanges: (note: string) => run((id, actor) => requestChangesService(id, actor, note)),
    reject: (rationale: string) => run((id, actor) => rejectStrategyService(id, actor, rationale)),
    reopen: (note: string) => run((id, actor) => reopenStrategyService(id, actor, note)),
  };
}
