import {
  Strategy_strategiesstf_strategytrack,
  Strategy_strategiesstrategy_strategytype,
  Strategy_strategiesstrategy_strategylevel,
  Strategy_strategiesstrategy_complexity,
} from "@generated/models/Strategy_strategiesModel";
import { Strategy_kpisesstrategy_kpitype } from "@generated/models/Strategy_kpisesModel";
import { Stf_strategytacticsstf_tacticstatus } from "@generated/models/Stf_strategytacticsModel";
import { Stf_strategypocsstf_pocstatus } from "@generated/models/Stf_strategypocsModel";

export interface Option {
  value: number;
  label: string;
}

function toOptions(map: Record<number, string>): Option[] {
  return Object.entries(map).map(([value, label]) => ({ value: Number(value), label }));
}

export const TRACK_OPTIONS = toOptions(Strategy_strategiesstf_strategytrack);
export const STRATEGY_TYPE_OPTIONS = toOptions(Strategy_strategiesstrategy_strategytype);
export const STRATEGY_LEVEL_OPTIONS = toOptions(Strategy_strategiesstrategy_strategylevel);
export const COMPLEXITY_OPTIONS = toOptions(Strategy_strategiesstrategy_complexity);
export const KPI_TYPE_OPTIONS = toOptions(Strategy_kpisesstrategy_kpitype);
export const TACTIC_STATUS_OPTIONS = toOptions(Stf_strategytacticsstf_tacticstatus);
export const POC_STATUS_OPTIONS = toOptions(Stf_strategypocsstf_pocstatus);

export const TRACK_OPERATIONAL = 1;
export const TRACK_SERVICE = 2;
export const STRATEGY_TYPE_DEPARTMENT = 989230000;
export const STRATEGY_TYPE_MARKET = 989230001;
export const STRATEGY_TYPE_SPECIALTY = 989230002;
export const STRATEGY_TYPE_SERVICE = 989230003;
export const STRATEGY_LEVEL_NEW = 620930000;

/** KPI "role" — always derived from the KPI record, never chosen by the user (spec §2). */
export type KpiRole = "Outcome" | "Output" | "Process" | "Other";

export function kpiRoleFromType(kpiType: number | undefined): KpiRole {
  switch (kpiType) {
    case 620930000: // OutCome
    case 620930002: // Sub Outcome
      return "Outcome";
    case 620930001: // OutPut
    case 620930003: // Sub Output
      return "Output";
    case 620930004: // Process
    case 620930005: // Sub Process
      return "Process";
    default:
      return "Other";
  }
}

/** A KPI is "automated" (manual target entry disabled) unless its data source is Manual (spec §6.9). */
export function isKpiAutomated(dataSource: number | undefined): boolean {
  return dataSource !== undefined && dataSource !== 2;
}

/** Fixed initial value for the new (schema-drift) strategy_strategystatus field — "Strategy Design Check". */
export const INITIAL_STRATEGY_STATUS = 620930000;
