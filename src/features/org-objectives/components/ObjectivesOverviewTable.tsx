import { Card, CardHead, CardBody } from "@shared/components/Card/Card";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { useObjectivesOverview, type ObjectiveOverviewRow } from "../hooks/useObjectivesOverview";

const columns: Column<ObjectiveOverviewRow>[] = [
  { key: "title", header: "Objective", render: (r) => <strong>{r.title}</strong> },
  { key: "outcome", header: "Outcome", render: (r) => r.outcomeName ?? "—" },
  { key: "output", header: "Output", render: (r) => r.outputName ?? "—" },
  { key: "departments", header: "Departments", render: (r) => (r.departmentNames.length ? r.departmentNames.join(", ") : "—") },
  { key: "year", header: "Year", render: (r) => r.year ?? "—" },
];

/** The full "shared store" of Objectives written from this cascade (and from anywhere else an
 * Objective is created) — also visible from the Strategy tree, hence the card's own title. */
export function ObjectivesOverviewTable() {
  const { data, loading, error } = useObjectivesOverview();

  return (
    <Card>
      <CardHead title="Objectives (shared with Strategy tree)" />
      <CardBody>
        {loading ? (
          <Loading label="Loading objectives…" />
        ) : error ? (
          <div className="alert alert-warn">{error}</div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="No objectives yet" description="Create one from an Org Output above." />
        ) : (
          <DataTable columns={columns} rows={data} rowKey={(r) => r.id} />
        )}
      </CardBody>
    </Card>
  );
}
