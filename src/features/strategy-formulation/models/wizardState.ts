import type { StrategyDraft } from "./strategy";
import type { StrategyKpi } from "./strategyKpi";
import type { Tactic } from "./tactic";
import type { Poc } from "./poc";
import type { RevisionStatus } from "../constants/revisionStatus";
import { TRACK_OPERATIONAL, TRACK_SERVICE, STRATEGY_LEVEL_NEW } from "../constants/optionSets";

export type WizardStepKey =
  | "track"
  | "objectiveStrategy"
  | "supportLink"
  | "serviceObjective"
  | "process"
  | "kpis"
  | "tacticsPocs"
  | "review";

export const OPERATIONAL_STEPS: WizardStepKey[] = ["track", "objectiveStrategy", "process", "kpis", "tacticsPocs", "review"];
export const SERVICE_STEPS: WizardStepKey[] = ["track", "supportLink", "serviceObjective", "kpis", "tacticsPocs", "review"];

export function stepsFor(track: number): WizardStepKey[] {
  return track === TRACK_SERVICE ? SERVICE_STEPS : OPERATIONAL_STEPS;
}

export interface WizardState {
  strategyId?: string;
  revisionStatus: RevisionStatus;
  stepIndex: number;
  core: Partial<StrategyDraft> & { track: number };
  kpis: StrategyKpi[];
  tactics: Tactic[];
  pocs: Poc[];
}

export function newWizardState(): WizardState {
  return {
    revisionStatus: "Draft",
    stepIndex: 0,
    core: { track: TRACK_OPERATIONAL, strategyLevel: STRATEGY_LEVEL_NEW },
    kpis: [],
    tactics: [],
    pocs: [],
  };
}
