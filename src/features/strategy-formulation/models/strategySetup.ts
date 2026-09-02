import type { Pm_strategysetups } from "@generated/models/Pm_strategysetupsModel";

/** Which strategy tracks a Function must submit — always one row per Department+Function pair. */
export const STRATEGY_TYPE_FLAGS = ["departmentStrategy", "marketStrategy", "specialtyStrategy", "serviceStrategy"] as const;
export type StrategyTypeFlag = (typeof STRATEGY_TYPE_FLAGS)[number];

export const STRATEGY_TYPE_LABELS: Record<StrategyTypeFlag, string> = {
  departmentStrategy: "Department",
  marketStrategy: "Market",
  specialtyStrategy: "Specialty",
  serviceStrategy: "Service",
};

export interface StrategySetup {
  id: string;
  departmentId?: string;
  functionId?: string;
  departmentStrategy: boolean;
  marketStrategy: boolean;
  specialtyStrategy: boolean;
  serviceStrategy: boolean;
}

export function toStrategySetup(row: Pm_strategysetups): StrategySetup {
  return {
    id: row.pm_strategysetupid,
    departmentId: row._pm_department_value,
    functionId: row._pm_function_value,
    departmentStrategy: !!row.pm_departmentstrategy,
    marketStrategy: !!row.pm_marketstrategy,
    specialtyStrategy: !!row.pm_specialtystrategy,
    serviceStrategy: !!row.pm_servicestrategy,
  };
}

/** How many of the 4 types this function is set up to require — drives the "N required" badge. */
export function countRequiredTypes(setup: StrategySetup | undefined): number {
  if (!setup) return 0;
  return STRATEGY_TYPE_FLAGS.filter((flag) => setup[flag]).length;
}
