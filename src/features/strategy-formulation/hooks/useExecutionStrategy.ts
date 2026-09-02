import { useAsync } from "@shared/hooks/useAsync";
import { loadExecutionData, type ExecStrategyData } from "../services/execTrackingService";

export function useExecutionStrategy(strategyId: string) {
  const { data, loading, error, reload } = useAsync<ExecStrategyData[]>(() => loadExecutionData(), []);
  const strategyData = data?.find((d) => d.strategy.id === strategyId) ?? null;
  return { data: strategyData, loading, error, reload };
}
