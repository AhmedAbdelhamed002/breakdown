import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import type { UnassignedItem } from "../models/unassignedItem";

interface Props {
  items: UnassignedItem[];
  selected: UnassignedItem[];
  onToggle: (item: UnassignedItem) => void;
}

export function UnassignedItemsTable({ items, selected, onToggle }: Props) {
  const selectedIds = new Set(selected.map((i) => i.id));

  const columns: Column<UnassignedItem>[] = [
    {
      key: "select",
      header: "",
      render: (i) => <input type="checkbox" checked={selectedIds.has(i.id)} onChange={() => onToggle(i)} />,
    },
    { key: "kind", header: "Type", render: (i) => <span className={`badge ${i.kind === "Tactic" ? "track-op" : "track-sv"}`}>{i.kind}</span> },
    { key: "name", header: "Name", render: (i) => i.name ?? "—" },
    { key: "kpi", header: "KPI", render: (i) => i.kpiName ?? "—" },
    { key: "values", header: "Current → Target", render: (i) => `${i.current ?? "—"} → ${i.target ?? "—"}` },
  ];

  return <DataTable columns={columns} rows={items} rowKey={(i) => i.id} />;
}
