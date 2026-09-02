import { Strategy_strategiesService } from "@generated/services/Strategy_strategiesService";
import type { Strategy_strategiesBase } from "@generated/models/Strategy_strategiesModel";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toStrategy, type Strategy, type StrategyDraft } from "../models/strategy";

export type { Strategy, StrategyDraft };
import { INITIAL_STRATEGY_STATUS, TRACK_SERVICE, STRATEGY_TYPE_SERVICE } from "../constants/optionSets";
import { REVISION_STATUS_CODE } from "../constants/revisionStatus";

type CreatePayload = Omit<Strategy_strategiesBase, "strategy_strategyid">;

function buildCreatePayload(draft: StrategyDraft, description: string): CreatePayload {
  const payload: CreatePayload = {
    statecode: 0,
    stf_strategytrack: draft.track as CreatePayload["stf_strategytrack"],
    stf_revisionstatus: REVISION_STATUS_CODE.Draft as CreatePayload["stf_revisionstatus"],
    "strategy_Company@odata.bind": bindRef("company", draft.companyId),
    "cr18c_Department@odata.bind": bindRef("department", draft.departmentId),
    "strategy_Function@odata.bind": bindRef("hrFunction", draft.functionId),
    "strategy_Region@odata.bind": bindRef("region", draft.regionId),
    "strategy_KPI@odata.bind": bindRef("kpi", draft.primaryKpiId),
    strategy_complexity: draft.complexity as CreatePayload["strategy_complexity"],
    strategy_implementationconfidence: draft.implementationConfidence,
    strategy_newcolumn: draft.name,
    strategy_strategydescription: description,
    strategy_strategylevel: draft.strategyLevel as CreatePayload["strategy_strategylevel"],
    strategy_strategystatus: INITIAL_STRATEGY_STATUS as CreatePayload["strategy_strategystatus"],
    strategy_strategytype: draft.strategyType as CreatePayload["strategy_strategytype"],
    strategy_startdate: draft.startDate,
    strategy_enddate: draft.endDate,
    strategy_kpiactual: draft.kpiCurrent,
    strategy_kpitarget: draft.kpiTarget,
    cr18c_specialty: draft.specialty,
  };
  if (draft.businessUnitId) payload["cr18c_BusinessUnit@odata.bind"] = bindRef("businessUnit", draft.businessUnitId);
  if (draft.processId) payload["cr18c_Process@odata.bind"] = bindRef("process", draft.processId);
  if (draft.subProcessId) payload["cr18c_Subprocess@odata.bind"] = bindRef("process", draft.subProcessId);
  if (draft.objectiveDepartmentId) payload["stf_ObjectiveDepartment@odata.bind"] = bindRef("objectiveDepartment", draft.objectiveDepartmentId);
  if (draft.supportiveFunctionId) payload["stf_SupportiveFunction@odata.bind"] = bindRef("hrFunction", draft.supportiveFunctionId);
  if (draft.supportedStrategyId) payload["stf_SupportedStrategy@odata.bind"] = bindRef("strategy", draft.supportedStrategyId);
  if (draft.supportedDepartmentId) payload["stf_SupportedDepartment@odata.bind"] = bindRef("department", draft.supportedDepartmentId);
  return payload;
}

export async function createStrategy(draft: StrategyDraft, description: string): Promise<Strategy> {
  const row = resultOrThrow(await Strategy_strategiesService.create(buildCreatePayload(draft, description)), "Create strategy");
  return toStrategy(row);
}

/**
 * Fields legitimately editable after creation. Objective/Department/BU/
 * Region/Function bind keys are deliberately excluded — those are
 * create-only per docs/strategy-formulation-spec.md §2 (defense in depth
 * on top of the UI's own per-field lock, §6.4).
 */
export interface StrategyUpdatePatch {
  description?: string;
  complexity?: number;
  implementationConfidence?: number;
  kpiCurrent?: number;
  kpiTarget?: number;
  specialty?: string;
  startDate?: string;
  endDate?: string;
  processId?: string;
  subProcessId?: string;
}

export async function updateStrategy(id: string, patch: StrategyUpdatePatch): Promise<Strategy> {
  const payload: Partial<CreatePayload> = {
    strategy_strategydescription: patch.description,
    strategy_complexity: patch.complexity as CreatePayload["strategy_complexity"],
    strategy_implementationconfidence: patch.implementationConfidence,
    strategy_kpiactual: patch.kpiCurrent,
    strategy_kpitarget: patch.kpiTarget,
    cr18c_specialty: patch.specialty,
    strategy_startdate: patch.startDate,
    strategy_enddate: patch.endDate,
  };
  if (patch.processId) payload["cr18c_Process@odata.bind"] = bindRef("process", patch.processId);
  if (patch.subProcessId) payload["cr18c_Subprocess@odata.bind"] = bindRef("process", patch.subProcessId);
  const row = resultOrThrow(await Strategy_strategiesService.update(id, payload), "Update strategy");
  return toStrategy(row);
}

export async function updateRevisionStatus(id: string, statusCode: number, extra?: { approvedOn?: string; approvedById?: string }): Promise<Strategy> {
  const payload: Partial<CreatePayload> = { stf_revisionstatus: statusCode as CreatePayload["stf_revisionstatus"] };
  if (extra?.approvedOn) payload.stf_approvedon = extra.approvedOn;
  if (extra?.approvedById) payload["stf_ApprovedBy@odata.bind"] = bindRef("user", extra.approvedById);
  const row = resultOrThrow(await Strategy_strategiesService.update(id, payload), "Update strategy status");
  return toStrategy(row);
}

export async function getStrategy(id: string): Promise<Strategy> {
  const row = resultOrThrow(await Strategy_strategiesService.get(id), "Get strategy");
  return toStrategy(row);
}

export async function listStrategies(): Promise<Strategy[]> {
  const rows = resultOrThrow(await Strategy_strategiesService.getAll({ orderBy: ["createdon desc"] }), "List strategies");
  return rows.map(toStrategy);
}

/** Operational strategies — the Support Link step's single-select picker (spec: "supports exactly one operational strategy"). */
export async function listOperationalStrategies(): Promise<Strategy[]> {
  const rows = resultOrThrow(
    await Strategy_strategiesService.getAll({ filter: "stf_strategytrack eq 1", orderBy: ["strategy_newcolumn asc"] }),
    "List operational strategies"
  );
  return rows.map(toStrategy);
}

/**
 * Cluster-target search for Bottom-Up/Unassigned: matches a Strategy either
 * by its own Operational dept/fn or by the Service-track equivalent
 * (Supported Department/Supportive Function) — without the OR, Service
 * strategies would silently never appear as cluster targets. Rejected
 * strategies are always excluded (a dead end, never offered).
 */
export async function searchStrategiesForCluster(departmentId?: string, functionId?: string): Promise<Strategy[]> {
  const filters = ["stf_revisionstatus ne 6"];
  if (departmentId) filters.push(`(_cr18c_department_value eq '${departmentId}' or _stf_supporteddepartment_value eq '${departmentId}')`);
  if (functionId) filters.push(`(_strategy_function_value eq '${functionId}' or _stf_supportivefunction_value eq '${functionId}')`);
  const rows = resultOrThrow(
    await Strategy_strategiesService.getAll({ filter: filters.join(" and "), orderBy: ["createdon desc"] }),
    "Search strategies"
  );
  return rows.map(toStrategy);
}

/**
 * A strategy's own scoping Department/Function, regardless of track —
 * Operational strategies carry these directly; Service strategies carry the
 * equivalent Supported Department/Supportive Function pair instead (same
 * dual-track distinction searchStrategiesForCluster above matches against).
 * Feeds anything that needs "this strategy's Department/Function" to compare
 * against an unassigned item's own KPI-derived Department/Function — e.g.
 * Attach Existing Unassigned Item — without silently coming back empty for
 * Service strategies.
 */
export function strategyScope(s: Pick<Strategy, "track" | "departmentId" | "functionId" | "supportedDepartmentId" | "supportiveFunctionId">): {
  departmentId?: string;
  functionId?: string;
} {
  return s.track === "Service"
    ? { departmentId: s.supportedDepartmentId, functionId: s.supportiveFunctionId }
    : { departmentId: s.departmentId, functionId: s.functionId };
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

/**
 * Descriptions are always machine-composed, never free-typed
 * (docs/strategy-formulation-spec.md §6.5). Re-derive on every relevant
 * field change rather than letting the user edit it directly.
 */
export function composeStrategyDescription(input: DescriptionInput): string {
  const verb = input.target !== undefined && input.current !== undefined && input.target < input.current ? "Decrease" : "Increase";
  const scope = [input.departmentName, input.functionName].filter(Boolean).join("-");
  const extra = [input.businessUnitName, input.regionName].filter(Boolean).join(" / ");
  const parts = [
    `${verb} ${input.kpiName}`,
    scope && `for ${scope}`,
    extra && `(${extra})`,
    input.current !== undefined && input.target !== undefined && `from ${input.current} to ${input.target}`,
    input.startDate && input.endDate && `between ${input.startDate} and ${input.endDate}`,
  ];
  return parts.filter(Boolean).join(" ");
}

/** Region "Group" disables/clears Business Unit — a case-insensitive label match, not a flag column (spec §6.2). */
export function isGroupRegion(regionLabel: string | undefined): boolean {
  return (regionLabel ?? "").trim().toLowerCase() === "group";
}

export interface MissingFieldCheck {
  draft: Partial<StrategyDraft>;
  isServiceTrack: boolean;
  regionLabel?: string;
}

/**
 * The single shared validator used both by the Objective & Strategy step's
 * own Continue button and by Submit-for-Review (spec §2 closing note) — do
 * not duplicate this logic per call site.
 */
export function findMissingRequiredFields({ draft, isServiceTrack, regionLabel }: MissingFieldCheck): string[] {
  const missing: string[] = [];
  if (!draft.name) missing.push("Strategy Name");
  if (!isServiceTrack && !draft.objectiveDepartmentId) missing.push("Parent Objective");
  if (!draft.departmentId) missing.push("Department");
  if (!draft.functionId) missing.push("Function");
  if (!draft.regionId) missing.push("Region");
  if (!isGroupRegion(regionLabel) && !draft.businessUnitId) missing.push("Business Unit");
  if (!draft.primaryKpiId) missing.push("Primary KPI");
  if (draft.strategyType === undefined) missing.push("Strategy Type");
  if (draft.strategyType === 989230002 && !draft.specialty) missing.push("Specialty");
  if (!draft.startDate) missing.push("Start Date");
  if (!draft.endDate) missing.push("End Date");
  if (draft.companyId === undefined) missing.push("Company");
  if (draft.complexity === undefined) missing.push("Complexity");
  if (draft.implementationConfidence === undefined) missing.push("Implementation Confidence");
  if (isServiceTrack && !draft.supportedStrategyId) missing.push("Supported Operational Strategy");
  return missing;
}

export { TRACK_SERVICE, STRATEGY_TYPE_SERVICE };
