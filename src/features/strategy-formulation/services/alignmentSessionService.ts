import { Stf_alignmentsessionsService } from "@generated/services/Stf_alignmentsessionsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toAlignmentSession, type AlignmentSession, type AlignmentSessionDraft } from "../models/alignmentSession";

const SESSION_STATE_NOT_STARTED = 1;
const SESSION_STATE_DONE = 2;

export async function listAlignmentSessions(): Promise<AlignmentSession[]> {
  const rows = resultOrThrow(await Stf_alignmentsessionsService.getAll({ orderBy: ["createdon desc"] }), "List alignment sessions");
  return rows.map(toAlignmentSession);
}

export async function getAlignmentSession(id: string): Promise<AlignmentSession> {
  const row = resultOrThrow(await Stf_alignmentsessionsService.get(id), "Get alignment session");
  return toAlignmentSession(row);
}

export async function requestAlignmentSession(draft: AlignmentSessionDraft): Promise<AlignmentSession> {
  const row = resultOrThrow(
    await Stf_alignmentsessionsService.create({
      statecode: 0,
      stf_reason: draft.reason as Parameters<typeof Stf_alignmentsessionsService.create>[0]["stf_reason"],
      stf_sessionstate: SESSION_STATE_NOT_STARTED as Parameters<typeof Stf_alignmentsessionsService.create>[0]["stf_sessionstate"],
      stf_cycle: draft.cycle as Parameters<typeof Stf_alignmentsessionsService.create>[0]["stf_cycle"],
      stf_fiscalyear: draft.fiscalYear,
      "stf_ParentStrategy@odata.bind": bindRef("strategy", draft.strategyId),
    }),
    "Request alignment session"
  );
  return toAlignmentSession(row);
}

/** Mark Done is allowed from either Not Started or Cancelled — no re-open guard (matches the legacy source, not a bug). */
export async function markAlignmentSessionDone(id: string): Promise<AlignmentSession> {
  const row = resultOrThrow(
    await Stf_alignmentsessionsService.update(id, {
      stf_sessionstate: SESSION_STATE_DONE as Parameters<typeof Stf_alignmentsessionsService.update>[1]["stf_sessionstate"],
    }),
    "Mark alignment session done"
  );
  return toAlignmentSession(row);
}

export async function cancelAlignmentSession(id: string): Promise<AlignmentSession> {
  const CANCELLED = 3;
  const row = resultOrThrow(
    await Stf_alignmentsessionsService.update(id, {
      stf_sessionstate: CANCELLED as Parameters<typeof Stf_alignmentsessionsService.update>[1]["stf_sessionstate"],
    }),
    "Cancel alignment session"
  );
  return toAlignmentSession(row);
}
