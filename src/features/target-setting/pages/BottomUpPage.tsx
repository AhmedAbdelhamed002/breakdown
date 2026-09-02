import React, { useState } from 'react';
import { useBottomUp } from '../hooks/useBottomUp';
import { useBusinessUnits } from '@shared/hooks/useBusinessUnits';
import { ContextBar } from '../components/CalendarAdjustment/ContextBar';
import { BreakdownEditor } from '../components/BreakdownEditor';
import { useBreakdown } from '../hooks/useBreakdown';
import { MONTHS } from '../models/types';

export const BottomUpPage: React.FC = () => {
  const {
    businessUnitId, setBusinessUnitId,
    departmentId, setDepartmentId,
    functionId, setFunctionId,
    year, setYear,
    month, setMonth,
    untargetedKpis,
    error
  } = useBottomUp('', new Date().getFullYear());

  /**
   * The bottom-up breakdown, over the same period as the rest of the screen, and the only way a
   * target is set here: pick one of the untargeted KPIs and build its figure out of rows.
   */
  const breakdown = useBreakdown({
    businessUnitId, year, month, cycle: 'bottom-up', require: 'without-target'
  });

  const { businessUnits } = useBusinessUnits();
  const selectedBu = businessUnits.find(bu => bu.id === businessUnitId);
  const businessUnitLabel = selectedBu ? [selectedBu.name, selectedBu.region].filter(Boolean).join(' — ') : '—';
  const monthName = MONTHS[month - 1];

  /** Free-text filter over the untargeted KPIs — the list runs long early in a planning cycle. */
  const [kpiSearch, setKpiSearch] = useState<string>('');
  const search = kpiSearch.trim().toLowerCase();
  const visibleKpis = untargetedKpis.filter(k => !search || k.name.toLowerCase().includes(search));

  if (breakdown.view.kpi) {
    return (
      <div className="layout-col">
        <div className="between" style={{ marginBottom: '10px' }}>
          <div className="sub">
            Bottom-up breakdown · {businessUnitLabel} · {monthName} {year}
          </div>
          <button className="btn btn-sm" onClick={breakdown.closeKpi}>← All untargeted KPIs</button>
        </div>
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

      <div className="card">
        <div className="card-head between">
          <h3>KPIs with no {monthName} target — break one down</h3>
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <span className="sub">
              {search
                ? `${visibleKpis.length} of ${untargetedKpis.length} in this region / department / function`
                : `${untargetedKpis.length} in this region / department / function`}
            </span>
            <input
              className="input"
              type="search"
              value={kpiSearch}
              onChange={e => setKpiSearch(e.target.value)}
              placeholder="Search KPI…"
              style={{ maxWidth: '240px' }}
            />
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!businessUnitId ? (
                <tr><td colSpan={3} className="muted" style={{ padding: '12px' }}>
                  Pick a business unit to see which KPIs still need a target.
                </td></tr>
              ) : visibleKpis.length === 0 ? (
                <tr><td colSpan={3} className="muted" style={{ padding: '12px' }}>
                  {untargetedKpis.length === 0
                    ? `Every KPI in this scope already has a ${monthName} ${year} target.`
                    : `No KPI without a ${monthName} ${year} target matches "${kpiSearch.trim()}".`}
                </td></tr>
              ) : visibleKpis.map(kpi => (
                <tr key={kpi.id}>
                  <td>{kpi.name}</td>
                  <td><span className="pill">{kpi.type || 'Input'}</span></td>
                  <td className="tright">
                    <button
                      className="btn btn-xs"
                      title="Build this KPI's target from a breakdown"
                      onClick={() => breakdown.openKpi({
                        id: kpi.id, name: kpi.name, kind: 'kpi', type: kpi.type, aggType: kpi.aggType
                      })}
                    >
                      break down ▸
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
