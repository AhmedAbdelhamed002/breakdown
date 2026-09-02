import { Stf_alignmentstakeholdersService } from "@generated/services/Stf_alignmentstakeholdersService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toAlignmentStakeholder, type AlignmentStakeholder } from "../models/alignmentStakeholder";

export async function listAlignmentStakeholders(sessionId: string): Promise<AlignmentStakeholder[]> {
  const rows = resultOrThrow(
    await Stf_alignmentstakeholdersService.getAll({
      filter: `_stf_alignmentsession_value eq '${sessionId}'`,
      orderBy: ["createdon asc"],
    }),
    "List alignment stakeholders"
  );
  return rows.map(toAlignmentStakeholder);
}

/**
 * Re-checks for a duplicate right before writing (not just against the
 * already-loaded list) — a real guard against two people adding the same
 * stakeholder concurrently in different tabs, not a redundant check.
 */
export async function addAlignmentStakeholder(sessionId: string, stakeholderId: string, stakeholderName: string, departmentId?: string): Promise<AlignmentStakeholder> {
  const dupe = resultOrThrow(
    await Stf_alignmentstakeholdersService.getAll({
      filter: `_stf_alignmentsession_value eq '${sessionId}' and _stf_stakeholder_value eq '${stakeholderId}'`,
      top: 1,
    }),
    "Check existing stakeholder"
  );
  if (dupe.length > 0) return toAlignmentStakeholder(dupe[0]);

  const row = resultOrThrow(
    await Stf_alignmentstakeholdersService.create({
      statecode: 0,
      stf_name: stakeholderName,
      "stf_AlignmentSession@odata.bind": bindRef("alignmentSession", sessionId),
      "stf_Stakeholder@odata.bind": bindRef("user", stakeholderId),
      ...(departmentId ? { "stf_Department@odata.bind": bindRef("department", departmentId) } : {}),
    }),
    "Add stakeholder"
  );
  return toAlignmentStakeholder(row);
}
