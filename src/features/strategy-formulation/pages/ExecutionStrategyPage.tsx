import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@shared/components/Button/Button";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { useAsync } from "@shared/hooks/useAsync";
import { useExecutionStrategy } from "../hooks/useExecutionStrategy";
import { StatusBadge } from "../components/StatusBadge";
import { AddExecItemDialog } from "../components/AddExecItemDialog";
import { AttachUnassignedItemDialog } from "../components/AttachUnassignedItemDialog";
import { TaskBreakdownDialog } from "../components/TaskBreakdownDialog";
import { TaskEditorDialog } from "../components/TaskEditorDialog";
import { StrategyMonitoringCard } from "../components/StrategyMonitoringCard";
import { StrategyImpactPanel } from "../components/StrategyImpactPanel";
import { assignItemToStrategy } from "../services/bottomUpItemService";
import { strategyScope } from "../services/strategyService";
import { getStrategyMonitoringSnapshot, listStrategyImpactRecords } from "../services/strategyMonitoringService";
import type { ExecItem } from "../services/execTrackingService";
import type { ExecTask } from "../models/execTask";

export function ExecutionStrategyPage() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useExecutionStrategy(strategyId!);
  const [addingItem, setAddingItem] = useState(false);
  const [attachingItem, setAttachingItem] = useState(false);
  const [breakingDown, setBreakingDown] = useState<ExecItem | null>(null);
  const [editingTask, setEditingTask] = useState<ExecTask | null>(null);

  const { data: monitoring } = useAsync(async () => {
    if (!data) return null;
    const [snapshot, impactRows] = await Promise.all([
      getStrategyMonitoringSnapshot(data.strategy, data.items),
      listStrategyImpactRecords(data.items),
    ]);
    return { snapshot, impactRows };
  }, [data]);

  if (loading) return <Loading label="Loading strategy execution…" />;
  if (error || !data) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;

  const { strategy, items } = data;
  const allTasks = items.flatMap((i) => i.tasks.map((t) => ({ task: t, source: i })));

  const itemColumns: Column<ExecItem>[] = [
    { key: "kind", header: "Type", render: (i) => <span className={`badge ${i.kind === "Tactic" ? "track-op" : "track-sv"}`}>{i.kind}</span> },
    { key: "name", header: "Name", render: (i) => i.name ?? "—" },
    { key: "kpi", header: "KPI", render: (i) => i.kpiName ?? "—" },
    { key: "tasks", header: "Tasks", render: (i) => (i.tasks.length === 0 ? <span className="badge">0</span> : i.tasks.length) },
    {
      key: "actions",
      header: "",
      render: (i) => (
        <Button size="sm" onClick={() => setBreakingDown(i)}>
          + Break down into task
        </Button>
      ),
    },
  ];

  const taskColumns: Column<(typeof allTasks)[number]>[] = [
    { key: "source", header: "Tactic/POC", render: (r) => r.source.name ?? "—" },
    {
      key: "task",
      header: "Task",
      render: (r) => (
        <div>
          <div>{r.task.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.task.priorityName}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <span className="badge">{r.task.statusName ?? r.task.status}</span> },
    { key: "assignee", header: "Assignee", render: (r) => r.task.assigneeName ?? "—" },
    { key: "start", header: "Start", render: (r) => r.task.startDate ?? "—" },
    { key: "due", header: "Due", render: (r) => r.task.dueDate ?? "—" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h3 style={{ margin: 0 }}>{strategy.name}</h3>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {strategy.departmentName ?? "—"} · {strategy.track}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <StatusBadge status={strategy.revisionStatus} />
        </div>
        <div className="card-body">
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <Button onClick={() => navigate("/strategy-formulation/execution")}>← All strategies</Button>
            <Button variant="primary" onClick={() => setAddingItem(true)}>
              + Add Tactic / POC
            </Button>
            <Button onClick={() => setAttachingItem(true)}>Attach Existing…</Button>
          </div>

          {items.length === 0 ? (
            <div className="hint">No Tactics/POCs yet — add one above or from the strategy's own wizard.</div>
          ) : (
            <>
              <DataTable columns={itemColumns} rows={items} rowKey={(i) => i.id} />
              <div className="section-label">All tasks</div>
              {allTasks.length === 0 ? (
                <div className="hint">No tasks yet.</div>
              ) : (
                <DataTable columns={taskColumns} rows={allTasks} rowKey={(r) => r.task.id} onRowClick={(r) => setEditingTask(r.task)} />
              )}
            </>
          )}
        </div>
      </div>

      {monitoring && (
        <div style={{ marginTop: 20 }}>
          <StrategyMonitoringCard snapshot={monitoring.snapshot} />
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <h3>Impact</h3>
        </div>
        <div className="card-body">{monitoring ? <StrategyImpactPanel rows={monitoring.impactRows} /> : <Loading label="Loading impact…" />}</div>
      </div>

      {addingItem && (
        <AddExecItemDialog
          strategy={strategy}
          onCreated={() => {
            reload();
          }}
          onClose={() => setAddingItem(false)}
        />
      )}
      {attachingItem && (
        <AttachUnassignedItemDialog
          departmentId={strategyScope(strategy).departmentId}
          functionId={strategyScope(strategy).functionId}
          onAttach={(item) => assignItemToStrategy(item, strategy.id)}
          onClose={() => {
            setAttachingItem(false);
            reload();
          }}
        />
      )}
      {breakingDown && (
        <TaskBreakdownDialog item={breakingDown} strategyId={strategy.id} onCreated={reload} onClose={() => setBreakingDown(null)} />
      )}
      {editingTask && <TaskEditorDialog task={editingTask} onSaved={reload} onClose={() => setEditingTask(null)} />}
    </div>
  );
}
