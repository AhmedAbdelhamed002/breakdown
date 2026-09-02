import { useAsync } from "@shared/hooks/useAsync";
import { listStrategies } from "../services/strategyService";

export function useStrategyList() {
  return useAsync(() => listStrategies(), []);
}
