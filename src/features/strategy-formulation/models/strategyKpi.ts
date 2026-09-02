import type { Stf_strategykpis } from "@generated/models/Stf_strategykpisModel";
import { kpiRoleFromType, isKpiAutomated, type KpiRole } from "../constants/optionSets";
import type { Strategy_kpises } from "@generated/models/Strategy_kpisesModel";

export interface StrategyKpi {
  id: string;
  strategyId?: string;
  kpiId: string;
  kpiName: string;
  role: KpiRole;
  automated: boolean;
  isPrimary?: boolean;
}

export function toStrategyKpi(row: Stf_strategykpis, kpi?: Strategy_kpises): StrategyKpi {
  return {
    id: row.stf_strategykpiid,
    strategyId: row._stf_strategy_value,
    kpiId: row._stf_kpi_value ?? "",
    kpiName: row.stf_kpiname ?? kpi?.strategy_newcolumn ?? "",
    role: kpiRoleFromType(kpi?.strategy_kpitype),
    automated: isKpiAutomated(kpi?.process_datasource),
  };
}
