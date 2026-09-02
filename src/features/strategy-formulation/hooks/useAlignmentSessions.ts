import { useAsync } from "@shared/hooks/useAsync";
import { listAlignmentSessions } from "../services/alignmentSessionService";

export function useAlignmentSessions() {
  return useAsync(() => listAlignmentSessions(), []);
}
