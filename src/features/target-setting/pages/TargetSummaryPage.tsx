import React, { useState } from 'react';
import { useTargetSummary, BuSummary } from '../hooks/useTargetSummary';
import { useOrgMetadata } from '../hooks/useOrgMetadata';
import { useBusinessUnits } from '@shared/hooks/useBusinessUnits';
import { ContextBar } from '../components/CalendarAdjustment/ContextBar';
import { MONTHS } from '../models/types';

const fmt = (value: number | null | undefined) =>
  value == null ? '0' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const TargetSummaryPage: React.FC = () => {
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [functionId, setFunctionId] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  /** Stack every region and its BUs, instead of only the one in the context bar. */
  const [allBUs, setAllBUs] = useState<boolean>(false);

  const { regions, loading, error } = useTargetSummary(
    businessUnitId, departmentId, functionId, year, month, allBUs
  );
  const { businessUnits } = useBusinessUnits();
  const { departments, functions } = useOrgMetadata(departmentId);

  const monthName = MONTHS[month - 1];
  const departmentName = departments.find(d => d.id === departmentId)?.name || 'all departments';
  const functionName = functions.find(f => f.id === functionId)?.name;
  const scopeLabel = [departmentName, functionName].filter(Boolean).join(' · ');
  const selectedBu = businessUnits.find(bu => bu.id === businessUnitId);

  const buCard = (entry: BuSummary, showRegion: boolean) => (
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
              <th>KPI</th>
              <th>Type</th>
              <th>Department</th>
              <th>Function</th>
              <th className="tright">{monthName} target</th>
            </tr>
          </thead>
          <tbody>
            {entry.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: '12px' }}>
                  No KPI matches this department and function.
                </td>
              </tr>
            ) : entry.rows.map(row => (
              <tr key={row.kpi.id}>
                <td>
                  {row.kpi.name}
                  {row.isPmKpi && (
                    <span
                      className="pill"
                      title={row.outsideFilter
                        ? 'Referenced in a sealed financial model — listed whichever department it belongs to'
                        : 'Referenced in a sealed financial model'}
                    > PM KPI</span>
                  )}
                </td>
                <td><span className="pill">{row.kpi.type || 'Input'}</span></td>
                <td className="muted">{row.departmentName || '—'}</td>
                <td className="muted">{row.functionName || '—'}</td>
                <td className="tright mono" style={{ color: row.hasTarget ? undefined : 'var(--danger)' }}>
                  <b>{fmt(row.target)}</b>
                  {!row.hasTarget && (
                    <span title={`No target recorded for this KPI in ${monthName} ${year}`}> ⚠ no target</span>
                  )}
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
        departmentId={departmentId}
        setDepartmentId={setDepartmentId}
        functionId={functionId}
        setFunctionId={setFunctionId}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
      />

      {error && <div className="alert alert-err">{error}</div>}

      <div className="alert alert-info">
        Every KPI for <b>{monthName} {year}</b>, sorted Outcome → Output → Process → Input, with its
        target read from the KPI achievement table. A KPI with no target for the month is still listed
        and flagged. Filter by <b>Department</b> and <b>Function</b> above; <b>PM KPIs</b> (used in a
        sealed model) stay listed whichever department they belong to. Use <b>change view</b> to stack
        every region and its business units.
      </div>

      <div className="between" style={{ marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Target Summary — {scopeLabel}</h3>
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
