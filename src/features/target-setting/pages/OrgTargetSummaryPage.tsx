import React, { useState } from 'react';
import { useOrgTargetSummary, BuOrgSummary } from '../hooks/useOrgTargetSummary';
import { useBusinessUnits } from '@shared/hooks/useBusinessUnits';
import { ContextBar } from '../components/CalendarAdjustment/ContextBar';
import { MONTHS } from '../models/types';

const fmt = (value: number | null | undefined) =>
  value == null ? '0' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const OrgTargetSummaryPage: React.FC = () => {
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  /** Stack every region and its BUs, instead of only the one in the context bar. */
  const [allBUs, setAllBUs] = useState<boolean>(false);

  const { regions, loading, error } = useOrgTargetSummary(businessUnitId, year, month, allBUs);
  const { businessUnits } = useBusinessUnits();

  const monthName = MONTHS[month - 1];
  const selectedBu = businessUnits.find(bu => bu.id === businessUnitId);

  const buCard = (entry: BuOrgSummary, showRegion: boolean) => (
    <div className="card" key={entry.bu.id}>
      <div className="card-head between">
        <h3>{entry.bu.name}{showRegion && entry.bu.region ? ` · ${entry.bu.region}` : ''}</h3>
        {entry.missingCount > 0
          ? <span className="chip-flag chip-over">{entry.missingCount} without a target</span>
          : <span className="badge st-approved">all targeted</span>}
      </div>
      <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Org entity</th>
              <th>Kind</th>
              <th className="tright">{monthName} target</th>
            </tr>
          </thead>
          <tbody>
            {entry.rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted" style={{ padding: '12px' }}>
                  No Org Outcomes or Org Outputs are defined.
                </td>
              </tr>
            ) : entry.rows.map(row => (
              <tr key={`${row.kindLabel}-${row.entity.id}`}>
                <td>{row.entity.name}</td>
                <td><span className="pill">{row.kindLabel}</span></td>
                <td className="tright mono" style={{ color: row.hasTarget ? undefined : 'var(--danger)' }}>
                  <b>{fmt(row.target)}</b>
                  {!row.hasTarget && <span title="no target this month"> ⚠</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="layout-col">
      <ContextBar
        businessUnitId={businessUnitId}
        setBusinessUnitId={setBusinessUnitId}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
      />

      {error && <div className="alert alert-err">{error}</div>}

      <div className="alert alert-info">
        Org <b>Outcome</b> then <b>Output</b> targets for <b>{monthName} {year}</b>. Anything without a
        target for the month is flagged. Use <b>change view</b> to stack every region and its business units.
      </div>

      <div className="between" style={{ marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Org Target Summary</h3>
        <button className="btn btn-sm" onClick={() => setAllBUs(v => !v)}>
          {allBUs ? '● All regions & BUs' : '○ Current BU only'} — change view
        </button>
      </div>

      {loading && <div className="muted" style={{ padding: '12px' }}>Loading…</div>}

      {!loading && !allBUs && !businessUnitId && (
        <div className="alert alert-warn">Pick a business unit, or switch to all regions &amp; BUs.</div>
      )}

      {!loading && allBUs && regions.map(region => (
        <React.Fragment key={region.regionId}>
          <div className="region-band">{region.regionName}</div>
          {region.bus.map(entry => buCard(entry, false))}
        </React.Fragment>
      ))}

      {!loading && !allBUs && regions.flatMap(region => region.bus).map(entry => buCard(entry, !!selectedBu?.region))}
    </div>
  );
};
