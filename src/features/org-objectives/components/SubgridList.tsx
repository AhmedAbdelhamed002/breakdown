import { Card, CardHead, CardBody } from "@shared/components/Card/Card";
import { Loading } from "@shared/components/Loading/Loading";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import type { PickerRow } from "../hooks/useOrgOutcomeCascade";

interface Props {
  title: string;
  rows: PickerRow[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  emptyTitle: string;
  emptyDescription?: string;
}

/** A single-select "subgrid": click a row to select it, same visual language as the rest of the app's cards/lists. */
export function SubgridList({ title, rows, loading, selectedId, onSelect, emptyTitle, emptyDescription }: Props) {
  return (
    <Card>
      <CardHead title={title} />
      <CardBody>
        {loading ? (
          <Loading label="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="subgrid-list">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`subgrid-row${row.id === selectedId ? " selected" : ""}`}
                onClick={() => onSelect(row.id)}
              >
                {row.label}
              </button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
