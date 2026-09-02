import { useAsync } from "@shared/hooks/useAsync";
import { loadExecutionData } from "../services/execTrackingService";

export function useExecutionOverview() {
  return useAsync(() => loadExecutionData(), []);
}
