import type { Conflict, ConflictType, TargetSource } from '@features/financial';
import { FM_COLORS, FM_FONT, FM_RADIUS, MONTH_NAMES } from '@features/financial';
import { entityName } from '../hooks/useGovernance';

interface ConflictsViewProps {
  rows: Conflict[];
  onOpenProposal: (proposalId?: string) => void;
}

function typeLabel(type: ConflictType): string {
  if (type === 'ForecastVsMonthly') return 'Forecast vs monthly';
  if (type === 'ChildrenVsParent') return 'Breakdown / children vs parent';
  if (type === 'BottomUpBelowApproved') return 'Bottom-up below approved';
  return 'Model vs org KPI';
}

function sourceLabel(source: TargetSource): string {
  if (source === 'TopDownMonthly') return 'Top-down monthly';
  if (source === 'Breakdown') return 'Breakdown';
  if (source === 'BottomUp') return 'Bottom-up';
  if (source === 'FinancialModeler') return 'Financial modeler';
  return 'Forecast';
}

export function ConflictsView({
  rows,
  onOpenProposal,
}: ConflictsViewProps) {
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
        All rows from <code>pm_conflict</code> (no filters).
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Conflicts</h3>
        <span
          style={{
            background: FM_COLORS.border,
            borderRadius: 999,
            padding: '2px 10px',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 28, color: FM_COLORS.positive, fontWeight: 600 }}>No conflicts. ✓</div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: `1px solid ${FM_COLORS.border}`,
            borderRadius: FM_RADIUS.lg,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: FM_COLORS.tableHeaderBg, textAlign: 'left' }}>
                {['Type', 'Entity', 'Detail', 'Existing source', 'Proposed source', 'Proposal', ''].map(
                  (h) => (
                    <th
                      key={h}
                      style={{ padding: '10px 12px', fontWeight: 600, color: FM_COLORS.textSecondary }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.pm_conflictid} style={{ borderTop: `1px solid ${FM_COLORS.borderLight}` }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: FM_COLORS.warningBannerBg,
                        color: FM_COLORS.warningBannerText,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {typeLabel(row.pm_conflicttype)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{entityName(row)}</td>
                  <td style={{ padding: '10px 12px', color: FM_COLORS.textMuted }}>
                    proposed {row.pm_proposedvalue} vs live target {row.pm_existingvalue}
                    <div style={{ fontSize: 11 }}>
                      {row.pm_businessunitname || '—'} · {MONTH_NAMES[row.pm_month - 1]} {row.pm_year}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{sourceLabel(row.pm_existingsource)}</td>
                  <td style={{ padding: '10px 12px' }}>{sourceLabel(row.pm_proposedsource)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: FM_COLORS.textMuted }}>
                    {row.pm_proposal ? row.pm_proposal.slice(0, 8) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {row.pm_proposal ? (
                      <button
                        type="button"
                        onClick={() => onOpenProposal(row.pm_proposal)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: `1px solid ${FM_COLORS.border}`,
                          background: '#fff',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        View proposal
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
