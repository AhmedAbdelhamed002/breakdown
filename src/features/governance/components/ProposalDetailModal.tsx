import { useEffect } from 'react';
import type { Proposal } from '@features/financial';
import { FM_COLORS, FM_FONT, FM_RADIUS, FM_SHADOW, MONTH_NAMES } from '@features/financial';
import { entityName } from '../hooks/useGovernance';

interface ProposalDetailModalProps {
  proposal: Proposal;
  liveTarget: number | null;
  onClose: () => void;
}

function sourceLabel(source: Proposal['pm_source']): string {
  if (source === 'TopDownMonthly') return 'Top-down monthly';
  if (source === 'Breakdown') return 'Breakdown';
  if (source === 'BottomUp') return 'Bottom-up';
  if (source === 'FinancialModeler') return 'Financial modeler';
  return 'Forecast';
}

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return String(Math.round(n * 100) / 100);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '8px 0', borderBottom: `1px solid ${FM_COLORS.borderLight}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: FM_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: FM_COLORS.textPrimary, wordBreak: 'break-word' }}>{value || '—'}</div>
    </div>
  );
}

export function ProposalDetailModal({ proposal, liveTarget, onClose }: ProposalDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const period = `${MONTH_NAMES[proposal.pm_month - 1] || proposal.pm_month} ${proposal.pm_year}`;

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.4)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-detail-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: FM_COLORS.cardBg,
          borderRadius: FM_RADIUS.lg,
          boxShadow: FM_SHADOW.elevated,
          fontFamily: FM_FONT.family,
          padding: 22,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div>
            <div id="proposal-detail-title" style={{ fontSize: 16, fontWeight: 700 }}>
              {entityName(proposal)}
            </div>
            <div style={{ fontSize: 12, color: FM_COLORS.textMuted, marginTop: 4 }}>
              {proposal.pm_name || 'Proposal details'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: FM_COLORS.textMuted,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <Row label="Status" value={proposal.statuscode} />
        <Row label="Entity kind" value={proposal.pm_entitykind} />
        <Row label="Entity" value={entityName(proposal)} />
        <Row label="Business unit" value={proposal.pm_businessunitname || proposal.pm_businessunit} />
        <Row label="Period" value={period} />
        <Row label="Proposed value" value={fmt(proposal.pm_proposedvalue)} />
        <Row label="Live target" value={liveTarget == null ? '0 (no record)' : fmt(liveTarget)} />
        <Row label="Has conflict" value={proposal.pm_hasconflict} />
        <Row label="Source" value={sourceLabel(proposal.pm_source)} />
        <Row label="Source model" value={proposal.pm_sourcemodelname || proposal.pm_sourcemodel || '—'} />
        <Row label="Dept · Function" value={proposal.pm_deptfunction || '—'} />
        <Row label="Created by" value={proposal.createdbyname || '—'} />
        <Row
          label="Created on"
          value={
            proposal.createdon && !Number.isNaN(new Date(proposal.createdon).getTime())
              ? new Date(proposal.createdon).toLocaleString()
              : '—'
          }
        />
      </div>
    </div>
  );
}
