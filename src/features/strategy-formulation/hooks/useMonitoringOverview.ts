import { useAsync } from "@shared/hooks/useAsync";
import { listMonitoringSnapshots } from "../services/strategyMonitoringService";

export function useMonitoringOverview() {
  return useAsync(() => listMonitoringSnapshots(), []);
}
