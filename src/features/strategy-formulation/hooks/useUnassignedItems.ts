import { useState } from "react";
import { useAsync } from "@shared/hooks/useAsync";
import { fetchUnassignedItems, assignItemToStrategy } from "../services/bottomUpItemService";
import type { UnassignedItem } from "../models/unassignedItem";

export function useUnassignedItems() {
  const { data, loading, error, reload } = useAsync(() => fetchUnassignedItems(), []);
  const [selected, setSelected] = useState<UnassignedItem[]>([]);
  const [selectError, setSelectError] = useState<string | null>(null);

  /** Enforces that every selected item shares one Department + Function — a hard invariant, independent of any display filter. */
  function toggleSelect(item: UnassignedItem) {
    setSelectError(null);
    setSelected((prev) => {
      const already = prev.some((i) => i.id === item.id);
      if (already) return prev.filter((i) => i.id !== item.id);
      const first = prev[0];
      if (first && (first.departmentId !== item.departmentId || first.functionId !== item.functionId)) {
        setSelectError("Selected items must share the same Department & Function.");
        return prev;
      }
      return [...prev, item];
    });
  }

  function clearSelection() {
    setSelected([]);
    setSelectError(null);
  }

  async function assignSelectedToStrategy(strategyId: string) {
    for (const item of selected) {
      await assignItemToStrategy(item, strategyId);
    }
    clearSelection();
    await reload();
  }

  return { items: data, loading, error, reload, selected, toggleSelect, clearSelection, selectError, assignSelectedToStrategy };
}
