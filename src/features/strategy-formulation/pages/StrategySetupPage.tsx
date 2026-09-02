import { useState } from "react";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useStrategySetup } from "../hooks/useStrategySetup";
import { STRATEGY_TYPE_FLAGS, STRATEGY_TYPE_LABELS, countRequiredTypes, type StrategySetup } from "../models/strategySetup";
import type { PickerOption } from "../models/reference";

interface FunctionSetupRow {
  fn: PickerOption;
  setup?: StrategySetup;
}

export function StrategySetupPage() {
  const [departmentId, setDepartmentId] = useState("");
  const [functionId, setFunctionId] = useState("");
  const { departments, functions, setups, loading, error, reload, toggle } = useStrategySetup(departmentId || undefined);

  const selectedDept = departments.find((d) => d.id === departmentId);
  const visibleFunctions = functionId ? functions.filter((f) => f.id === functionId) : functions;
  const rows: FunctionSetupRow[] = visibleFunctions.map((fn) => ({ fn, setup: setups.find((s) => s.functionId === fn.id) }));

  const columns: Column<FunctionSetupRow>[] = [
    {
      key: "function",
      header: "Function",
      render: (r) => (
        <div>
          <b>{r.fn.label}</b>
          {selectedDept && (
            <div className="muted" style={{ fontSize: 10.5 }}>
              {selectedDept.label}
            </div>
          )}
        </div>
      ),
    },
    ...STRATEGY_TYPE_FLAGS.map(
      (flag): Column<FunctionSetupRow> => ({
        key: flag,
        header: STRATEGY_TYPE_LABELS[flag],
        render: (r) => (
          <input
            type="checkbox"
            checked={!!r.setup?.[flag]}
            onChange={(e) => void toggle(r.fn, flag, e.target.checked)}
          />
        ),
      })
    ),
    {
      key: "setup",
      header: "Setup",
      render: (r) => <span className="pill">{countRequiredTypes(r.setup)} required</span>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Strategy Setup</h3>
            <div className="sub">Which strategy types each function must submit</div>
          </div>
        </div>
        <div className="card-body">
          <div className="filter-grid">
            <LookupField
              value={departmentId}
              onChange={(id) => {
                setDepartmentId(id);
                setFunctionId("");
              }}
              options={departments}
              placeholder="Select department…"
            />
            <LookupField
              value={functionId}
              onChange={setFunctionId}
              options={functions}
              disabled={!departmentId}
              placeholder={departmentId ? "All functions…" : "Pick a department first…"}
            />
          </div>

          {!departmentId ? (
            <EmptyState
              title="Pick a department"
              description="Select a department to set which strategy types each of its functions must submit."
            />
          ) : loading ? (
            <Loading label="Loading strategy setup…" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : rows.length === 0 ? (
            <EmptyState title="No functions" description="This department has no functions yet." />
          ) : (
            <>
              <div className="alert alert-info">
                Tick every strategy type a function is responsible for. Each checkbox saves immediately to that Department + Function's setup record.
              </div>
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.fn.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
