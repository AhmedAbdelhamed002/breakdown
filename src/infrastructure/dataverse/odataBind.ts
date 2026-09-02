/**
 * Entity set names for every generated data source used across features.
 * Dataverse `@odata.bind` values require the plural entity-set path, not the
 * singular logical name — keeping this list here (matching each generated
 * service's own `dataSourceName`) avoids hardcoding/guessing entity-set
 * names ad hoc per feature, which caused silent 404s in the legacy source
 * (see docs/strategy-formulation-spec.md §6.11).
 */
export const ENTITY_SETS = {
  strategy: "strategy_strategies",
  kpi: "strategy_kpises",
  process: "strategy_processes",
  organizationalObjective: "stf_organizationalobjectives",
  objectiveDepartment: "stf_objectivedepartments",
  strategyKpi: "stf_strategykpis",
  strategyTactic: "stf_strategytactics",
  strategyPoc: "stf_strategypocs",
  executionCategory: "stf_executioncategories",
  revisionComment: "stf_revisioncomments",
  decisionLog: "stf_decisionlogs",
  businessUnit: "businessunits",
  user: "systemusers",
  hrFunction: "hr_functions",
  department: "cr603_chklst_departmentses",
  region: "crd04_regionses",
  // stf_strategypocs.stf_Specialty targets crd04_specialties, confirmed live — not
  // cr301_specialtyksa_service_hubs, a different table with an unrelated relationship of the same
  // display name, used only for the KPI breakdown dimension's own "Specialty" lookup.
  specialty: "crd04_specialtieses",
  projectEntity: "cr603_entitieses",
  company: "and_companies",
  theme: "stf_themes",
  alignmentSession: "stf_alignmentsessions",
  alignmentStakeholder: "stf_alignmentstakeholders",
  task: "hx_taskses",
  project: "cr603_projectses",
  model: "pm_models",
  modelTerm: "pm_modelterms",
  orgOutput: "pm_orgoutputs",
  tacticImpact: "pm_tacticimpacts",
  kpiAchievement: "pm_kpiachievments",
} as const;

export type EntitySetKey = keyof typeof ENTITY_SETS;

/** Builds an `@odata.bind` target, e.g. bindRef("strategy", id) -> "/strategy_strategies(id)". */
export function bindRef(entity: EntitySetKey, id: string): string {
  return `/${ENTITY_SETS[entity]}(${id})`;
}
