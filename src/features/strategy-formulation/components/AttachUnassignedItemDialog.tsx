import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Loading } from "@shared/components/Loading/Loading";
import { useAsync } from "@shared/hooks/useAsync";
import { fetchUnassignedItems } from "../services/bottomUpItemService";
import { UnassignedItemsTable } from "./UnassignedItemsTable";
import type { UnassignedItem } from "../models/unassignedItem";

interface Props {
  departmentId?: string;
  functionId?: string;
  onAttach: (item: UnassignedItem) => Promise<void>;
  onClose: () => void;
}

/**
 * The reverse of Unassigned Tactics & POCs' own Cluster flow — that one starts from the item
 * (select items → pick a strategy). This starts from the strategy: only unassigned items sharing
 * this strategy's own Department + Function are offered, matching the same invariant the Cluster
 * flow enforces when selecting multiple items at once.
 */
export function AttachUnassignedItemDialog({ departmentId, functionId, onAttach, onClose }: Props) {
  const { data: allItems, loading, error: loadError } = useAsync(() => fetchUnassignedItems(), []);
  const [selected, setSelected] = useState<UnassignedItem[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const matching = (allItems ?? []).filter((i) => i.departmentId === departmentId && i.functionId === functionId);

  function toggle(item: UnassignedItem) {
    setSelected((prev) => (prev.some((i) => i.id === item.id) ? prev.filter((i) => i.id !== item.id) : [...prev, item]));
  }

  async function handleAttach() {
    setAttaching(true);
    setAttachError(null);
    try {
      for (const item of selected) {
        await onAttach(item);
      }
      onClose();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "Failed to attach");
    } finally {
      setAttaching(false);
    }
  }

  return (
    <Modal
      title="Attach Existing Unassigned Item"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={selected.length === 0 || attaching} onClick={() => void handleAttach()}>
            {attaching ? "Attaching…" : `Attach ${selected.length || ""} selected`}
          </Button>
        </>
      }
    >
      {!departmentId || !functionId ? (
        <div className="alert alert-warn">This strategy needs a Department and Function before existing items can be attached.</div>
      ) : loading ? (
        <Loading label="Loading unassigned items…" />
      ) : loadError ? (
        <div className="alert alert-warn">{loadError}</div>
      ) : matching.length === 0 ? (
        <div className="empty-state">
          <h4>No unassigned Tactics/POCs match this strategy's Department &amp; Function</h4>
        </div>
      ) : (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>
            Only unassigned items in the same Department &amp; Function as this strategy are shown.
          </div>
          <UnassignedItemsTable items={matching} selected={selected} onToggle={toggle} />
        </>
      )}
      {attachError && <div className="alert alert-warn" style={{ marginTop: 10 }}>{attachError}</div>}
    </Modal>
  );
}
