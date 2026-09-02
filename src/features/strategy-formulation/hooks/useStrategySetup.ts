import { useCallback, useEffect, useState } from "react";
import { useOptions } from "./useOptions";
import { listDepartments, listFunctionsByDepartment } from "../services/referenceDataService";
import { listStrategySetupsByDepartment, setStrategyTypeFlag } from "../services/strategySetupService";
import type { PickerOption } from "../models/reference";
import type { StrategySetup, StrategyTypeFlag } from "../models/strategySetup";

/** Functions cascade from the selected Department; setups are fetched per-department and updated optimistically on toggle. */
export function useStrategySetup(departmentId: string | undefined) {
  const departments = useOptions(listDepartments, []);
  const functions = useOptions(() => (departmentId ? listFunctionsByDepartment(departmentId) : Promise.resolve([])), [departmentId]);

  const [setups, setSetups] = useState<StrategySetup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!departmentId) {
      setSetups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSetups(await listStrategySetupsByDepartment(departmentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load strategy setups");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggle(fn: PickerOption, flag: StrategyTypeFlag, value: boolean) {
    if (!departmentId) return;
    const existing = setups.find((s) => s.functionId === fn.id);
    const updated = await setStrategyTypeFlag({ existing, departmentId, functionId: fn.id, functionName: fn.label, flag, value });
    setSetups((prev) => (existing ? prev.map((s) => (s.id === updated.id ? updated : s)) : [...prev, updated]));
  }

  return { departments, functions, setups, loading, error, reload, toggle };
}
