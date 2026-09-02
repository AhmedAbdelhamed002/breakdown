import { useAsync } from "@shared/hooks/useAsync";
import { listThemes } from "../services/themeService";

export function useThemes() {
  return useAsync(() => listThemes(), []);
}
