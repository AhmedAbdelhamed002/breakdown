import { Stf_organizationalobjectivesService } from "@generated/services/Stf_organizationalobjectivesService";
import type { Stf_organizationalobjectivesBase } from "@generated/models/Stf_organizationalobjectivesModel";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { formatDate } from "@shared/utils/format";
import { toObjective, type Objective, type ObjectiveDraft } from "../models/objective";

type CreatePayload = Omit<Stf_organizationalobjectivesBase, "stf_organizationalobjectiveid">;

const OBJECTIVE_STATUS_ACTIVE = 1;
const DESCRIPTION_MAX_LENGTH = 2000;

export async function listObjectives(): Promise<Objective[]> {
  const rows = resultOrThrow(await Stf_organizationalobjectivesService.getAll({ orderBy: ["createdon desc"] }), "List objectives");
  return rows.map(toObjective);
}

export async function getObjective(id: string): Promise<Objective> {
  const row = resultOrThrow(await Stf_organizationalobjectivesService.get(id), "Get objective");
  return toObjective(row);
}

/** The one objective already created for this Org Output, if any — enforces the one-objective-per-Org-Output rule. */
export async function getObjectiveByOrgOutput(orgOutputId: string): Promise<Objective | undefined> {
  const rows = resultOrThrow(
    await Stf_organizationalobjectivesService.getAll({
      filter: `_pm_orgoutputkpi_value eq '${orgOutputId}' and statecode eq 0`,
      top: 1,
    }),
    "Get objective by Org Output"
  );
  return rows[0] ? toObjective(rows[0]) : undefined;
}

export interface CreateObjectiveResult {
  objective: Objective;
  /** Set if the measurable/time-bound follow-up write failed — the objective itself still saved (spec: two-phase write). */
  measurableFieldsError?: string;
}

/**
 * Two-phase create, matching the legacy source: core fields first, then
 * measurable/time-bound fields as a follow-up update whose failure doesn't
 * roll back the objective itself.
 */
export async function createObjective(draft: ObjectiveDraft, description: string): Promise<CreateObjectiveResult> {
  const payload: CreatePayload = {
    statecode: 0,
    stf_title: draft.title,
    stf_objectivetype: draft.type as CreatePayload["stf_objectivetype"],
    stf_objectivestatus: OBJECTIVE_STATUS_ACTIVE as CreatePayload["stf_objectivestatus"],
    stf_objectivedescription: description,
    stf_year: draft.year,
    "stf_Department@odata.bind": bindRef("department", draft.departmentId),
    "stf_Region@odata.bind": bindRef("region", draft.regionId),
    "stf_Owner@odata.bind": bindRef("user", draft.ownerId),
  };
  if (draft.functionId) payload["stf_Function@odata.bind"] = bindRef("hrFunction", draft.functionId);
  if (draft.businessUnitId) payload["stf_BU@odata.bind"] = bindRef("businessUnit", draft.businessUnitId);
  if (draft.parentThemeId) payload["stf_ParentTheme@odata.bind"] = bindRef("theme", draft.parentThemeId);
  if (draft.orgOutputId) payload["pm_OrgOutputKPI@odata.bind"] = bindRef("orgOutput", draft.orgOutputId);

  const created = resultOrThrow(await Stf_organizationalobjectivesService.create(payload), "Create objective");

  try {
    const updated = resultOrThrow(
      await Stf_organizationalobjectivesService.update(created.stf_organizationalobjectiveid, {
        stf_currentvalue: draft.currentValue,
        stf_targetvalue: draft.targetValue,
        stf_startdate: draft.startDate,
        stf_enddate: draft.endDate,
        "stf_PrimaryKPI@odata.bind": bindRef("kpi", draft.primaryKpiId),
      }),
      "Save objective measurable fields"
    );
    return { objective: toObjective(updated) };
  } catch (e) {
    return {
      objective: toObjective(created),
      measurableFieldsError: e instanceof Error ? e.message : "Failed to save measurable/time-bound fields",
    };
  }
}

/**
 * Fields legitimately editable after creation. Title, Type, and every
 * lookup (Department/Function/BU/Region/Theme/Owner) are deliberately
 * excluded — those are create-only, same pattern as `StrategyUpdatePatch`
 * in strategyService.ts (defense in depth on top of the dialog's own
 * per-field lock).
 */
export interface ObjectiveUpdatePatch {
  description?: string;
  currentValue?: number;
  targetValue?: number;
  startDate?: string;
  endDate?: string;
}

export async function updateObjective(id: string, patch: ObjectiveUpdatePatch): Promise<Objective> {
  const row = resultOrThrow(
    await Stf_organizationalobjectivesService.update(id, {
      stf_objectivedescription: patch.description,
      stf_currentvalue: patch.currentValue,
      stf_targetvalue: patch.targetValue,
      stf_startdate: patch.startDate,
      stf_enddate: patch.endDate,
    }),
    "Update objective"
  );
  return toObjective(row);
}

export interface DescriptionInput {
  kpiName: string;
  departmentName?: string;
  functionName?: string;
  businessUnitName?: string;
  regionName?: string;
  current?: number;
  target?: number;
  startDate?: string;
  endDate?: string;
}

/** Objective's SMART description — always machine-composed, same rule as the Strategy's own composer. */
export function composeObjectiveDescription(input: DescriptionInput): string {
  const verb = input.target !== undefined && input.current !== undefined && input.target < input.current ? "Decrease" : "Increase";
  const scope = [input.departmentName, input.functionName].filter(Boolean).join("-");
  const location = input.businessUnitName && input.regionName
    ? ` at ${input.businessUnitName} (${input.regionName})`
    : input.businessUnitName
    ? ` at ${input.businessUnitName}`
    : input.regionName
    ? ` at ${input.regionName}`
    : "";
  const parts = [
    `${verb} ${input.kpiName}`,
    scope && `for ${scope}`,
    location,
    input.current !== undefined && input.target !== undefined && `from ${input.current} to ${input.target}`,
    input.startDate && input.endDate && `between ${formatDate(input.startDate)} and ${formatDate(input.endDate)}`,
  ];
  return parts.filter(Boolean).join(" ");
}

/** Hard 2,000-character cap on the Objective description, enforced at save time (spec §6.5). */
export function findObjectiveDescriptionError(description: string): string | undefined {
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return `Description is ${description.length} characters — the limit is ${DESCRIPTION_MAX_LENGTH}.`;
  }
  return undefined;
}

export interface MissingObjectiveFieldCheck {
  draft: Partial<ObjectiveDraft>;
}

export function findMissingObjectiveFields({ draft }: MissingObjectiveFieldCheck): string[] {
  const missing: string[] = [];
  if (!draft.title) missing.push("Title");
  if (!draft.regionId) missing.push("Region");
  if (!draft.departmentId) missing.push("Lead Department");
  if (!draft.functionId) missing.push("Function");
  if (!draft.ownerId) missing.push("Owner");
  if (!draft.primaryKpiId) missing.push("Primary KPI");
  if (draft.currentValue === undefined) missing.push("Current value");
  if (draft.targetValue === undefined) missing.push("Target value");
  if (!draft.startDate) missing.push("Start Date");
  if (!draft.endDate) missing.push("End Date");
  return missing;
}
