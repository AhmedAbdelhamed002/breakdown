import { useState } from 'react';
import { Modal } from '@shared/components/Modal/Modal';
import { Button } from '@shared/components/Button/Button';
import type { EligibleCandidate } from '../../hooks/useKpiPocTacticImpacts';

interface Props {
  eligible: EligibleCandidate[];
  loading: boolean;
  onPick: (candidate: EligibleCandidate) => void;
  onClose: () => void;
}

function rowLabel(c: EligibleCandidate): { name: string; kpiName?: string; note: string } {
  if (c.source === 'clustered') {
    const item = c.item;
    return {
      name: item.name || '(unnamed)',
      kpiName: item.strategyKpiName ?? item.kpiName,
      note: 'Related Strategy',
    };
  }
  return { name: c.item.name || '(unnamed)', kpiName: c.item.kpiName, note: 'Unassigned — no Strategy yet' };
}

/**
 * "Use existing POC/Tactic" — POC/Tactic type toggle, then every item eligible for the KPI
 * selected on Top-down Annual: related to it directly, or through a Strategy, and not already
 * carrying a Financial Model/Impact (those already show up in "POCs / Tactics" instead).
 */
export function ExistingPocTacticPicker({ eligible, loading, onPick, onClose }: Props) {
  const [kind, setKind] = useState<'Poc' | 'Tactic'>('Poc');
  const filtered = eligible.filter((c) => c.kind === kind);

  return (
    <Modal title="Use existing POC/Tactic" onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="flex" style={{ gap: 6, marginBottom: 14 }}>
        <Button size="sm" variant={kind === 'Poc' ? 'accent' : 'default'} onClick={() => setKind('Poc')}>
          POC
        </Button>
        <Button size="sm" variant={kind === 'Tactic' ? 'accent' : 'default'} onClick={() => setKind('Tactic')}>
          Tactic
        </Button>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h4>No eligible {kind === 'Poc' ? 'POCs' : 'Tactics'}</h4>
          <p>Every {kind} related to this KPI already has a Financial Model or Impact, or none exist yet.</p>
        </div>
      ) : (
        filtered.map((c) => {
          const { name, kpiName, note } = rowLabel(c);
          return (
            <div className="item" key={c.item.id} style={{ cursor: 'pointer' }} onClick={() => onPick(c)}>
              <div className="item-head">
                <span className="title">{name}</span>
                <span className={`impact-status ${c.source === 'clustered' ? 'linked' : 'unlinked'}`}>{note}</span>
              </div>
              <div className="meta">
                <span>
                  KPI: <b>{kpiName ?? '—'}</b>
                </span>
              </div>
            </div>
          );
        })
      )}
    </Modal>
  );
}
