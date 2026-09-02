import React from 'react';
import { RollUpRow } from '../../services/RollUpService';

interface RollUpSectionProps {
  rows: RollUpRow[];
  loading?: boolean;
  entityName?: string;
  entityKind?: 'outcome' | 'output' | 'kpi';
  businessUnitLabel?: string;
}

export const RollUpSection: React.FC<RollUpSectionProps> = ({ rows, loading, entityName, entityKind, businessUnitLabel }) => {
  if (rows.length === 0 && !loading) {
    // Only KPIs roll up to Org Outputs/Outcomes — an empty result for a selected KPI means
    // it has no contribution link yet, which is worth flagging rather than staying silent.
    if (entityKind === 'kpi' && entityName && businessUnitLabel) {
      return (
        <div className="alert alert-warn" style={{ marginTop: '10px' }}>
          ⚠ {entityName} is not linked to an Org Output for {businessUnitLabel} — link it on Org Linkage to see roll-up.
        </div>
      );
    }
    return null;
  }

  const hasAnyConflict = rows.some(r => r.hasConflict);

  return (
    <div style={{ marginTop: '24px' }}>
      <div className="section-label">Roll-up to organization (per-BU weight)</div>
      {loading ? (
        <div className="muted" style={{ padding: '12px' }}>Loading roll-up data...</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>LEVEL</th>
                <th>ENTITY</th>
                <th>LINK</th>
                <th className="tright">CURRENT</th>
                <th className="tright">PROJECTED</th>
                <th>EXISTING TARGET</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.level}-${row.entityId}-${i}`}>
                  <td>{row.level}</td>
                  <td><b>{row.entityName}</b></td>
                  <td className="muted">{row.link}</td>
                  <td className="tright mono">
                    {row.current.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                  </td>
                  <td className="tright mono">
                    {row.projected > row.current ? '▲ ' : row.projected < row.current ? '▼ ' : ''}
                    {row.projected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td>
                    {row.existingTarget !== null ? (
                      <>
                        <span className="mono">
                          {row.existingTarget.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        {row.hasConflict && <span className="pill pill-red" style={{ marginLeft: '6px' }}>conflict</span>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasAnyConflict && (
            <div className="alert alert-warn" style={{ marginTop: '8px' }}>
              ⚠ Projected roll-up disagrees with an existing org target — saving will raise a conflict for review.
            </div>
          )}
        </>
      )}
    </div>
  );
};
