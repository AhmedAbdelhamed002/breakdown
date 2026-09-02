import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useStrategyList } from "../hooks/useStrategyList";
import { useOptions } from "../hooks/useOptions";
import { listDepartments, listFunctionsByDepartment } from "../services/referenceDataService";
import { StatusBadge } from "./StatusBadge";
import type { Strategy } from "../models/strategy";

export function StrategyList() {
  const { data, loading, error, reload } = useStrategyList();
  const navigate = useNavigate();
  const [departmentId, setDepartmentId] = useState("");
  const [functionId, setFunctionId] = useState("");
  const departments = useOptions(listDepartments, []);
  const functions = useOptions(() => listFunctionsByDepartment(departmentId), [departmentId]);

  const filtered = (data ?? []).filter(
    (s) => (!departmentId || s.departmentId === departmentId) && (!functionId || s.functionId === functionId)
  );

  const columns: Column<Strategy>[] = [
    { key: "name", header: "Strategy", render: (s) => s.name },
    { key: "track", header: "Track", render: (s) => <span className={`badge ${s.track === "Service" ? "track-sv" : "track-op"}`}>{s.track}</span> },
    { key: "department", header: "Department", render: (s) => s.departmentName ?? "—" },
    { key: "function", header: "Function", render: (s) => s.functionName ?? "—" },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.revisionStatus} /> },
    { key: "dates", header: "Dates", render: (s) => (s.startDate ? `${s.startDate} → ${s.endDate}` : "—") },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <h3>Strategies</h3>
        <div style={{ flex: 1 }} />
      </div>
      <div className="card-body">
        <div className="filter-bar">
          <Field label="Department">
            <LookupField
              value={departmentId}
              onChange={(id) => {
                setDepartmentId(id);
                setFunctionId(""); // a Function belongs to a Department, so the old pick can't survive the change
              }}
              options={departments}
              placeholder="All Departments"
            />
          </Field>
          <Field label="Function">
            <LookupField value={functionId} onChange={setFunctionId} options={functions} placeholder="All Functions" />
          </Field>
        </div>
        {loading ? (
          <Loading label="Loading strategies…" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No strategies yet" description="Create the first strategy to get started." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No strategies match this filter" description="Try a different Department or Function." />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/strategy-formulation/${s.id}`)} />
        )}
      </div>
    </div>
  );
}
