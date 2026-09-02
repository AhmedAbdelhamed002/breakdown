import { useState } from 'react';
import { Modal } from '@shared/components/Modal/Modal';
import { Button } from '@shared/components/Button/Button';
import { LookupField } from '@shared/components/LookupField/LookupField';
import {
  searchStrategiesForCluster,
  CreateStrategyDialog,
  type Strategy,
} from '@features/strategy-formulation';

interface Props {
  title: string;
  hint: string;
  departmentId?: string;
  functionId?: string;
  onPicked: (strategyId: string) => void;
  onClose: () => void;
}

/**
 * "Pick or create the Strategy this belongs to" — the one new concept this flow adds to Top-down
 * Annual (which otherwise has none), needed only because Strategy Formulation's Create Tactic/POC
 * and Impact dialogs require a real Strategy. Reuses the exact same search + create mechanism
 * Unassigned Items already uses for clustering (`ClusterPanel.tsx`).
 */
export function StrategyPickerStep({ title, hint, departmentId, functionId, onPicked, onClose }: Props) {
  const [strategyId, setStrategyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);

  async function onSearch(term: string) {
    setSearching(true);
    try {
      const strategies = await searchStrategiesForCluster(departmentId, functionId);
      const filtered = term ? strategies.filter((s) => s.name.toLowerCase().includes(term.toLowerCase())) : strategies;
      return filtered.map((s) => ({ id: s.id, label: `${s.name} (${s.track})` }));
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!strategyId} onClick={() => onPicked(strategyId)}>
              Continue →
            </Button>
          </>
        }
      >
        <div className="hint" style={{ marginBottom: 12 }}>
          {hint}
        </div>
        <LookupField
          value={strategyId}
          onChange={setStrategyId}
          onSearch={onSearch}
          placeholder={searching ? 'Searching…' : 'Search existing strategies…'}
        />
        <div className="btn-row" style={{ marginTop: 12 }}>
          <Button onClick={() => setCreating(true)}>+ Create New Strategy</Button>
        </div>
      </Modal>

      {creating && (
        <CreateStrategyDialog
          departmentId={departmentId}
          functionId={functionId}
          onCreated={(strategy: Strategy) => {
            setCreating(false);
            onPicked(strategy.id);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
