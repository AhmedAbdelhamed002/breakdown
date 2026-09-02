import { Stf_decisionlogsService } from "@generated/services/Stf_decisionlogsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toDecisionLogEntry, type DecisionLogEntry } from "../models/decisionLogEntry";
import { updateRevisionStatus } from "./strategyService";
import { findMissingRequiredFields, type MissingFieldCheck } from "./strategyService";
import { countOutcomeKpis } from "./strategyKpiService";
import type { StrategyKpi } from "../models/strategyKpi";
import { REVISION_STATUS_CODE } from "../constants/revisionStatus";
import type { Strategy } from "../models/strategy";

export interface SubmitCheckInput extends MissingFieldCheck {
  processId?: string;
  kpis: StrategyKpi[];
  tacticsCount: number;
  pocsCount: number;
}

/**
 * Everything Submit-for-Review re-checks, on top of the shared required-
 * fields validator (spec §2 closing note, §3). Returns the list of problems;
 * empty means clear to submit.
 */
export function validateForSubmit(input: SubmitCheckInput): string[] {
  const errors = findMissingRequiredFields(input);
  if (!input.isServiceTrack && !input.processId) errors.push("Main Process");
  if (!input.isServiceTrack && countOutcomeKpis(input.kpis) !== 1) errors.push("Exactly one Outcome KPI is required");
  if (input.tacticsCount + input.pocsCount === 0) errors.push("At least one Tactic or POC is required");
  return errors;
}

/** Shared by every screen that appends a Governance decision-log row (workflow actions, Change Requests). */
export async function logDecision(strategyId: string, action: number, actorId: string, note?: string): Promise<void> {
  resultOrThrow(
    await Stf_decisionlogsService.create({
      statecode: 0,
      stf_action: action as Parameters<typeof Stf_decisionlogsService.create>[0]["stf_action"],
      stf_timestamp: new Date().toISOString(),
      stf_note: note,
      "stf_ParentStrategy@odata.bind": bindRef("strategy", strategyId),
      "stf_Actor@odata.bind": bindRef("user", actorId),
    }),
    "Log decision"
  );
}

export async function submitForReview(strategyId: string, actorId: string): Promise<Strategy> {
  const strategy = await updateRevisionStatus(strategyId, REVISION_STATUS_CODE.UnderReview);
  await logDecision(strategyId, 1, actorId);
  return strategy;
}

export async function approveStrategy(strategyId: string, actorId: string): Promise<Strategy> {
  const strategy = await updateRevisionStatus(strategyId, REVISION_STATUS_CODE.Approved, {
    approvedOn: new Date().toISOString(),
    approvedById: actorId,
  });
  await logDecision(strategyId, 4, actorId);
  return strategy;
}

export async function requestChanges(strategyId: string, actorId: string, note: string): Promise<Strategy> {
  const strategy = await updateRevisionStatus(strategyId, REVISION_STATUS_CODE.ChangesRequested);
  await logDecision(strategyId, 2, actorId, note);
  return strategy;
}

/** Reject requires a rationale — hard block if empty (spec §3). */
export async function rejectStrategy(strategyId: string, actorId: string, rationale: string): Promise<Strategy> {
  if (!rationale.trim()) throw new Error("A rejection rationale is required");
  const strategy = await updateRevisionStatus(strategyId, REVISION_STATUS_CODE.Rejected);
  await logDecision(strategyId, 5, actorId, rationale);
  return strategy;
}

/**
 * Reopen an Approved or Rejected strategy for further changes. Implemented
 * in the legacy source but never wired to any UI button there (spec §6.14)
 * — added here with a real trigger since the backend logic and the other
 * four transitions already exist. Requires a scope note.
 */
export async function reopenStrategy(strategyId: string, actorId: string, note: string): Promise<Strategy> {
  if (!note.trim()) throw new Error("A note describing what needs to change is required");
  const strategy = await updateRevisionStatus(strategyId, REVISION_STATUS_CODE.Reopened);
  await logDecision(strategyId, 6, actorId, note);
  return strategy;
}

export async function listDecisionLog(strategyId: string): Promise<DecisionLogEntry[]> {
  const rows = resultOrThrow(
    await Stf_decisionlogsService.getAll({
      filter: `_stf_parentstrategy_value eq '${strategyId}'`,
      orderBy: ["createdon desc"],
    }),
    "List decision log"
  );
  return rows.map(toDecisionLogEntry);
}
