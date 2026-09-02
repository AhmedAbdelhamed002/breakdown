import { useEffect, useMemo, useState } from 'react';
import type { Proposal, StrategyKpi } from '@features/financial';
import { FM_COLORS, FM_FONT, FM_RADIUS, MONTH_NAMES } from '@features/financial';
import type { ProposalFilter } from '../hooks/useGovernance';
import { entityName } from '../hooks/useGovernance';
import { ProposalDetailModal } from './ProposalDetailModal';

interface ProposalsViewProps {
  rows: Proposal[];
  kpis: StrategyKpi[];
  openProposalId?: string | null;
  filter: ProposalFilter;
  onFilterChange: (f: ProposalFilter) => void;
  liveTarget: (row: Proposal) => number | null;
  canApprove: boolean;
  isActing: boolean;
  onApprove: (row: Proposal) => void;
  onReject: (row: Proposal) => void;
}

type CreatedSort = 'newer' | 'older';
type ProposalSort = CreatedSort | 'kpiCategory';

const CATEGORY_ORDER = ['Org Outcome', 'Org Output', 'Outcome KPI', 'Output KPI', 'Process KPI', 'KPI'];

function proposalCategory(row: Proposal, kpis: StrategyKpi[]): string {
  if (row.pm_entitykind === 'OrgOutcome') return 'Org Outcome';
  if (row.pm_entitykind === 'OrgOutput') return 'Org Output';
  const type = kpis.find((kpi) => kpi.strategy_kpisid === row.pm_kpi)?.strategy_kpitype;
  const label = String(type ?? '').toLowerCase();
  if (label.includes('outcome')) return 'Outcome KPI';
  if (label.includes('output')) return 'Output KPI';
  if (label.includes('process')) return 'Process KPI';
  return 'KPI';
}

function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  return String(Math.round(n * 100) / 100);
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function searchHaystack(row: Proposal): string {
  const period = `${MONTH_NAMES[row.pm_month - 1] || row.pm_month} ${row.pm_year}`;
  return [
    entityName(row),
    row.pm_entitykind,
    row.pm_deptfunction,
    row.pm_businessunitname,
    row.pm_name,
    row.statuscode,
    row.pm_hasconflict === 'Yes' ? 'conflict' : '',
    row.createdbyname,
    fmtDate(row.createdon),
    period,
    String(row.pm_proposedvalue),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function ProposalsView({
  rows,
  kpis,
  openProposalId,
  filter,
  onFilterChange,
  liveTarget,
  canApprove,
  isActing,
  onApprove,
  onReject,
}: ProposalsViewProps) {
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [query, setQuery] = useState('');
  const [proposalSort, setProposalSort] = useState<ProposalSort>('kpiCategory');
  const creators = Array.from(new Set(rows.map((row) => row.createdbyname).filter(Boolean))).sort();
  const [createdBy, setCreatedBy] = useState('');

  useEffect(() => {
    if (!openProposalId) return;
    const proposal = rows.find((row) => row.pm_proposalid.toLowerCase() === openProposalId.toLowerCase());
    if (proposal) setSelected(proposal);
  }, [openProposalId, rows]);

  const tabs: { key: ProposalFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'approved', label: 'Approved' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'conflicts', label: 'Conflicts' },
  ];

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => (!createdBy || row.createdbyname === createdBy) && (!q || searchHaystack(row).includes(q)));
    const dir = proposalSort === 'older' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (proposalSort === 'kpiCategory') {
        const categoryDiff = CATEGORY_ORDER.indexOf(proposalCategory(a, kpis)) - CATEGORY_ORDER.indexOf(proposalCategory(b, kpis));
        if (categoryDiff !== 0) return categoryDiff;
      }
      const ta = a.createdon ? new Date(a.createdon).getTime() : 0;
      const tb = b.createdon ? new Date(b.createdon).getTime() : 0;
      if (ta !== tb) return (ta - tb) * dir;
      return a.pm_proposalid.localeCompare(b.pm_proposalid) * dir;
    });
  }, [createdBy, kpis, proposalSort, query, rows]);

  const headers = [
    'Entity',
    'BU',
    'Period',
    'Proposed',
    'Live target',
    'Conflict',
    'Status',
    'Created by',
    'Created on',
    '',
  ];

  return (
    <div>
      <div
        style={{
          background: FM_COLORS.infoBannerBg,
          color: FM_COLORS.infoBannerText,
          padding: '12px 14px',
          borderRadius: FM_RADIUS.md,
          fontSize: FM_FONT.sizeSm,
          marginBottom: 16,
        }}
      >
        Every proposal is compared to the live target of the same entity / BU / month / year.
        Approve replaces that target and keeps the proposal on the Approved tab (no actions).
        Reject sets the proposal to Inactive and keeps it on the Inactive tab (no actions).
        The Conflicts tab lists proposals that raised a conflict.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onFilterChange(t.key)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: `1px solid ${filter === t.key ? FM_COLORS.accent : FM_COLORS.border}`,
              background: filter === t.key ? FM_COLORS.accent : '#fff',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entity, BU, dept/function, status, created by…"
          style={{
            flex: 1,
            minWidth: 220,
            padding: '8px 12px',
            borderRadius: FM_RADIUS.md,
            border: `1px solid ${FM_COLORS.border}`,
            fontSize: FM_FONT.sizeMd,
            background: '#fff',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: FM_COLORS.textSecondary }}>
          Sort
          <select
            value={proposalSort}
            onChange={(e) => setProposalSort(e.target.value as ProposalSort)}
            style={{
              padding: '8px 12px',
              borderRadius: FM_RADIUS.md,
              border: `1px solid ${FM_COLORS.border}`,
              background: '#fff',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <option value="newer">Newer first</option>
            <option value="older">Older first</option>
            <option value="kpiCategory">KPI category</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: FM_COLORS.textSecondary }}>
          Created by
          <select
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: FM_RADIUS.md, border: `1px solid ${FM_COLORS.border}`, background: '#fff', fontSize: 12, fontWeight: 600 }}
          >
            <option value="">All creators</option>
            {creators.map((creator) => <option key={creator} value={creator}>{creator}</option>)}
          </select>
        </label>
      </div>

      <div
        style={{
          background: '#fff',
          border: `1px solid ${FM_COLORS.border}`,
          borderRadius: FM_RADIUS.lg,
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 980 }}>
          <thead>
            <tr style={{ background: FM_COLORS.tableHeaderBg, textAlign: 'left' }}>
              {headers.map((h) => (
                <th key={h || 'actions'} style={{ padding: '10px 12px', fontWeight: 600, color: FM_COLORS.textSecondary }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} style={{ padding: 24, color: FM_COLORS.textMuted }}>
                  {query.trim() ? 'No proposals match this search.' : 'No proposals in this filter.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const live = liveTarget(row);
                const open = row.statuscode === 'Active';
                return (
                  <tr
                    key={row.pm_proposalid}
                    onClick={() => setSelected(row)}
                    style={{
                      borderTop: `1px solid ${FM_COLORS.borderLight}`,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = FM_COLORS.tableRowHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{entityName(row)}</div>
                      <div style={{ fontSize: 11, color: FM_COLORS.textMuted }}>
                        {row.pm_entitykind}
                        {row.pm_deptfunction ? ` · ${row.pm_deptfunction}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: FM_COLORS.accent, fontWeight: 600 }}>
                        {proposalCategory(row, kpis)}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{row.pm_businessunitname || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {MONTH_NAMES[row.pm_month - 1] || row.pm_month} {row.pm_year}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(row.pm_proposedvalue)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {live == null ? (
                        <span style={{ color: FM_COLORS.textMuted }}>0 (no record)</span>
                      ) : (
                        fmt(live)
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {row.pm_hasconflict === 'Yes' ? (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: FM_COLORS.noOrgLinkBg,
                            color: FM_COLORS.noOrgLink,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          Conflict
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{row.statuscode}</td>
                    <td style={{ padding: '10px 12px' }}>{row.createdbyname || '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(row.createdon)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {open && (
                        <>
                          <button
                            type="button"
                            disabled={!canApprove || isActing}
                            title={canApprove ? 'Approve' : 'Finance approves proposals.'}
                            onClick={() => onApprove(row)}
                            style={{
                              marginRight: 6,
                              padding: '5px 10px',
                              borderRadius: 8,
                              border: 'none',
                              background: canApprove ? FM_COLORS.roleFinance : FM_COLORS.border,
                              color: '#fff',
                              cursor: canApprove ? 'pointer' : 'not-allowed',
                              opacity: canApprove ? 1 : 0.5,
                              fontWeight: 600,
                              fontSize: 12,
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={!canApprove || isActing}
                            title={canApprove ? 'Reject' : 'Finance approves proposals.'}
                            onClick={() => onReject(row)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 8,
                              border: `1px solid ${FM_COLORS.border}`,
                              background: '#fff',
                              cursor: canApprove ? 'pointer' : 'not-allowed',
                              opacity: canApprove ? 1 : 0.5,
                              fontWeight: 600,
                              fontSize: 12,
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <ProposalDetailModal
          proposal={selected}
          liveTarget={liveTarget(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
