import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBreakdown } from '../hooks/useBreakdown';
import { useBusinessUnits } from '@shared/hooks/useBusinessUnits';
import { ContextBar } from '../components/CalendarAdjustment/ContextBar';
import { BreakdownEditor } from '../components/BreakdownEditor';
import { MONTHS, kpiTypeRank } from '../models/types';
import type { BaseEntity } from '../services/EntityService';

const fmt = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Passed via `navigate(..., { state })` from Execution & Monitoring's own Breakdowns overview
 * ("+ Add / Edit breakdown for this KPI") — pre-fills the filter bar and opens the KPI's own
 * breakdown editor directly, skipping this page's own list/search step entirely. */
export interface BreakdownDeepLinkState {
  businessUnitId?: string;
  departmentId?: string;
  functionId?: string;
  year?: number;
  month?: number;
  kpiId: string;
  kpiName: string;
  kpiType?: string;
  kpiAggType?: BaseEntity['aggType'];
}

/**
 * BreakdownPage — splitting an approved target, top-down.
 *
 * Only KPIs that already carry a target for the month are listed: a breakdown here shares an
 * approved figure out, so there has to be one to share. KPIs still waiting for a target are the
 * Bottom-up screen's business, where the rows are built first and their total is proposed.
 */
export const BreakdownPage: React.FC = () => {
  const location = useLocation();
  const deepLink = location.state as BreakdownDeepLinkState | null;

  const [businessUnitId, setBusinessUnitId] = useState<string>(deepLink?.businessUnitId ?? '');
  const [departmentId, setDepartmentId] = useState<string>(deepLink?.departmentId ?? '');
  const [functionId, setFunctionId] = useState<string>(deepLink?.functionId ?? '');
  const [year, setYear] = useState<number>(deepLink?.year ?? new Date().getFullYear());
  const [month, setMonth] = useState<number>(deepLink?.month ?? new Date().getMonth() + 1);
  /** Free-text filter over the KPI list — the list runs long once a BU has many KPIs. */
  const [kpiSearch, setKpiSearch] = useState<string>('');

  const breakdown = useBreakdown({
    businessUnitId, year, month, cycle: 'top-down', require: 'with-target',
    departmentId, functionId
  });
  const { view, kpiRows, openKpi, loading, error } = breakdown;

  // Deep-linked straight to one KPI's own breakdown — open it once, right away, rather than
  // making the user find and click it in the list below.
  const deepLinkOpenedRef = useRef(false);
  useEffect(() => {
    if (deepLinkOpenedRef.current || !deepLink?.kpiId) return;
    deepLinkOpenedRef.current = true;
    openKpi({ id: deepLink.kpiId, name: deepLink.kpiName, kind: 'kpi', type: deepLink.kpiType, aggType: deepLink.kpiAggType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { businessUnits } = useBusinessUnits();
  const selectedBu = businessUnits.find(bu => bu.id === businessUnitId);
  const businessUnitLabel = selectedBu ? [selectedBu.name, selectedBu.region].filter(Boolean).join(' — ') : '—';
  const monthName = MONTHS[month - 1];

  const contextBar = (
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
  );

  if (view.kpi) {
    return (
      <div className="layout-col">
        {contextBar}
        {error && <div className="alert alert-err">{error}</div>}
        <BreakdownEditor
          breakdown={breakdown}
          businessUnitId={businessUnitId}
          businessUnitLabel={businessUnitLabel}
          year={year}
          month={month}
        />
      </div>
    );
  }

  const search = kpiSearch.trim().toLowerCase();
  const sortedKpis = kpiRows
    .filter(k => !search || k.name.toLowerCase().includes(search))
    .sort((a, b) => kpiTypeRank(a.type) - kpiTypeRank(b.type) || a.name.localeCompare(b.name));

  return (
    <div className="layout-col">
      {contextBar}
      {error && <div className="alert alert-err">{error}</div>}

      <div className="alert alert-info">
        Method 3 — Breakdown. Pick a KPI to split its approved <b>{monthName} {year}</b> target — by
        account, physician, department… and each of those again (recursive). Only KPIs that already
        have a target appear here; the ones still without one are on the <b>Bottom-up</b> screen.
      </div>

      <div className="card">
        <div className="card-head between">
          <h3>Breakdown — {monthName} {year} · {businessUnitLabel}</h3>
          <input
            className="input"
            type="search"
            value={kpiSearch}
            onChange={e => setKpiSearch(e.target.value)}
            placeholder="Search KPI…"
            style={{ maxWidth: '240px' }}
          />
        </div>
        <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Type</th>
                <th>Rolls up</th>
                <th className="tright">{monthName} target</th>
                <th>Breakdown</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="muted" style={{ padding: '14px' }}>Loading…</td></tr>
              ) : sortedKpis.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: '14px' }}>
                    {!businessUnitId
                      ? 'Pick a business unit to begin.'
                      : search
                        ? `No KPI matching "${kpiSearch.trim()}" has a ${monthName} ${year} target to break down.`
                        : `No KPI in this scope has a ${monthName} ${year} target to break down.`}
                  </td>
                </tr>
              ) : sortedKpis.map(k => {
                const entity = {
                  id: k.id, name: k.name, kind: 'kpi' as const, type: k.type, aggType: k.aggType
                };
                return (
                  <tr key={k.id} className="click-row" onClick={() => openKpi(entity)}>
                    <td><b>{k.name}</b></td>
                    <td><span className="pill">{k.type}</span></td>
                    <td className="muted" style={{ fontSize: '11px' }}>
                      {k.aggType === 'Percentage' ? 'average of its rows' : 'sum of its rows'}
                    </td>
                    <td className="tright mono">{fmt(k.target)}</td>
                    <td>
                      {k.levels === 0
                        ? <span className="muted">no breakdown yet</span>
                        : <span className="badge st-approved">{k.levels} breakdown level{k.levels > 1 ? 's' : ''}</span>}
                    </td>
                    <td className="tright">
                      <button className="btn btn-xs" onClick={e => { e.stopPropagation(); openKpi(entity); }}>
                        open →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
