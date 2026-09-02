import { Pm_strategysetupsService } from "@generated/services/Pm_strategysetupsService";
import type { Pm_strategysetupsstatecode } from "@generated/models/Pm_strategysetupsModel";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { toStrategySetup, type StrategySetup, type StrategyTypeFlag } from "../models/strategySetup";

const FLAG_FIELD: Record<StrategyTypeFlag, "pm_departmentstrategy" | "pm_marketstrategy" | "pm_specialtystrategy" | "pm_servicestrategy"> = {
  departmentStrategy: "pm_departmentstrategy",
  marketStrategy: "pm_marketstrategy",
  specialtyStrategy: "pm_specialtystrategy",
  serviceStrategy: "pm_servicestrategy",
};

export async function listStrategySetupsByDepartment(departmentId: string): Promise<StrategySetup[]> {
  const rows = resultOrThrow(
    await Pm_strategysetupsService.getAll({ filter: `_pm_department_value eq '${departmentId}'` }),
    "List strategy setups"
  );
  return rows.map(toStrategySetup);
}

/** Org-wide — feeds the Strategy Tree's per-KPI "which types apply" lookup (keyed by Department+Function). */
export async function listAllStrategySetups(): Promise<StrategySetup[]> {
  const rows = resultOrThrow(await Pm_strategysetupsService.getAll({}), "List all strategy setups");
  return rows.map(toStrategySetup);
}

/**
 * Flips a single strategy-type flag for a Department+Function pair, creating the
 * row on its first checked type. Never re-derives the other three flags from the
 * write response — an update only echoes the field(s) just sent, so trusting it
 * for the untouched flags would read them back as false.
 */
export async function setStrategyTypeFlag(params: {
  existing?: StrategySetup;
  departmentId: string;
  functionId: string;
  functionName: string;
  flag: StrategyTypeFlag;
  value: boolean;
}): Promise<StrategySetup> {
  const { existing, departmentId, functionId, functionName, flag, value } = params;
  const field = FLAG_FIELD[flag];

  if (existing) {
    resultOrThrow(await Pm_strategysetupsService.update(existing.id, { [field]: value }), "Update strategy setup");
    return { ...existing, [flag]: value };
  }

  const row = resultOrThrow(
    await Pm_strategysetupsService.create({
      pm_newcolumn: functionName,
      "pm_Department@odata.bind": bindRef("department", departmentId),
      "pm_Function@odata.bind": bindRef("hrFunction", functionId),
      statecode: 0 as Pm_strategysetupsstatecode,
      [field]: value,
    }),
    "Create strategy setup"
  );
  return toStrategySetup(row);
}
