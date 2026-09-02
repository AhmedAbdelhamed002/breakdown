import { useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { searchStrategiesForCluster } from "../services/strategyService";
import { CreateStrategyDialog } from "./CreateStrategyDialog";
import type { UnassignedItem } from "../models/unassignedItem";
import type { Strategy } from "../models/strategy";

interface Props {
  selected: UnassignedItem[];
  onAssign: (strategyId: string) => Promise<void>;
}

/** Appears once at least one item is selected — search an existing strategy or create a new one, then cluster the selection into it. */
export function ClusterPanel({ selected, onAssign }: Props) {
  const first = selected[0];
  const [creating, setCreating] = useState(false);
  const [strategyId, setStrategyId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strategies = useOptions(() => searchStrategiesForCluster(first?.departmentId, first?.functionId), [first?.departmentId, first?.functionId]);
  const strategyOptions = strategies.map((s) => ({ id: s.id, label: `${s.name} (${s.track})` }));

  if (!first) return null;

  async function handleAssign(id: string) {
    setAssigning(true);
    setError(null);
    try {
      await onAssign(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>Cluster {selected.length} selected item(s)</h3>
      </div>
      <div className="card-body">
        <div className="grid-2">
          <LookupField value={strategyId} onChange={setStrategyId} options={strategyOptions} placeholder="Search existing strategies…" />
          <Button variant="primary" disabled={!strategyId || assigning} onClick={() => handleAssign(strategyId)}>
            {assigning ? "Assigning…" : "Assign selected to Strategy →"}
          </Button>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <Button onClick={() => setCreating(true)}>+ Create New Strategy</Button>
        </div>
        {error && <div className="alert alert-warn">{error}</div>}
      </div>
      {creating && (
        <CreateStrategyDialog
          departmentId={first.departmentId}
          functionId={first.functionId}
          lockDeptFn
          onCreated={(strategy: Strategy) => {
            setCreating(false);
            handleAssign(strategy.id);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
