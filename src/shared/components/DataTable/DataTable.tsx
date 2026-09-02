import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Aligns both the header and every data cell in this column — a numeric column whose header
   * stays left-aligned while its own values sit right-aligned reads as crooked/misaligned, since
   * they anchor to opposite edges of the same column width. Defaults to left. */
  align?: "left" | "right";
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick }: Props<T>) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.align === "right" ? "tright" : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className={onRowClick ? "clickable" : undefined} onClick={() => onRowClick?.(row)}>
            {columns.map((c) => (
              <td key={c.key} className={c.align === "right" ? "tright" : undefined}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
