import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/Button/Button";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { useUnassignedItems } from "../hooks/useUnassignedItems";
import { listDepartments, listFunctionsByDepartment } from "../services/referenceDataService";
import { createBottomUpTactic, createBottomUpPoc, type BottomUpTacticDraft, type BottomUpPocDraft } from "../services/bottomUpItemService";
import { UnassignedItemsTable } from "../components/UnassignedItemsTable";
import { ClusterPanel } from "../components/ClusterPanel";
import { BottomUpItemDialog } from "../components/BottomUpItemDialog";

export function UnassignedItemsPage() {
  const navigate = useNavigate();
  const { items, loading, error, reload, selected, toggleSelect, selectError, assignSelectedToStrategy } = useUnassignedItems();
  const [departmentId, setDepartmentId] = useState("");
  const [functionId, setFunctionId] = useState("");
  const [addingKind, setAddingKind] = useState<"Tactic" | "Poc" | null>(null);

  const departments = useOptions(listDepartments, []);
  const functions = useOptions(() => listFunctionsByDepartment(departmentId), [departmentId]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((i) => {
      if (departmentId && i.departmentId !== departmentId) return false;
      if (functionId && i.functionId !== functionId) return false;
      return true;
    });
  }, [items, departmentId, functionId]);

  async function handleSave(draft: BottomUpTacticDraft | BottomUpPocDraft) {
    if (addingKind === "Tactic") await createBottomUpTactic(draft as BottomUpTacticDraft);
    else await createBottomUpPoc(draft as BottomUpPocDraft);
    await reload();
  }

  if (loading) return <Loading label="Loading unassigned items…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <h3>Unassigned Tactics &amp; POCs</h3>
          <div style={{ flex: 1 }} />
          <div className="btn-row">
            <Button onClick={() => navigate("/strategy-formulation/tree")}>→ Strategy Tree</Button>
            <Button onClick={() => setAddingKind("Tactic")}>+ Add Tactic</Button>
            <Button variant="accent" onClick={() => setAddingKind("Poc")}>
              + Add POC
            </Button>
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
              placeholder="All departments…"
            />
            <LookupField value={functionId} onChange={setFunctionId} options={functions} disabled={!departmentId} placeholder="All functions…" />
          </div>

          {selectError && <div className="alert alert-warn">{selectError}</div>}

          {filtered.length === 0 ? (
            <EmptyState title="No unassigned items" description="Every Tactic/POC is already linked to a strategy." />
          ) : (
            <UnassignedItemsTable items={filtered} selected={selected} onToggle={toggleSelect} />
          )}

          <ClusterPanel selected={selected} onAssign={assignSelectedToStrategy} />
        </div>
      </div>

      {addingKind && <BottomUpItemDialog kind={addingKind} onSave={handleSave} onClose={() => setAddingKind(null)} />}
    </div>
  );
}
