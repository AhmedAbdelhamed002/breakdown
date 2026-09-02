import React from 'react';
import { Button } from '@shared/components/Button/Button';
import { MONTHS } from '../../models/types';
import type { ForecastProfileMonth } from '../../services/AnnualForecastService';
import type { ConnectedContribution } from '../../hooks/useKpiPocTacticImpacts';

const fmt = (n: number | undefined | null) => (n == null ? '—' : n.toLocaleString());

interface MonthBreakdown {
  month: number;
  original: number;
  contributions: { id: string; name: string; kind: 'Poc' | 'Tactic'; value: number }[];
  proposed: number;
}

/**
 * "POCs / Tactics — each drives one component of a model; results stack and accumulate into the
 * target." One card per already-connected item (Financial Model linked and/or Impact applied).
 * Clicking a card re-opens the same Link Financial Model & Calculate Impact flow (via `onOpen`) so
 * its Financial Model/values can be adjusted.
 *
 * "Apply to Forecast" is a separate, purely local step: it never touches the underlying
 * pm_pocimpacts/pm_tacticimpacts records (Apply Impact already did that) — it only decides whether
 * this item's own `driverNewValue` for its own `month`/`year` is folded into the *forecast* profile
 * shown above (and what "Save as proposal" will write). `appliedIds` is owned by the page, reset
 * whenever the selected KPI changes.
 */
export const PocTacticContributionsPanel: React.FC<{
  connected: ConnectedContribution[];
  loading: boolean;
  disabled?: boolean;
  /** Which month + year `connected` is already scoped to (by the caller) — shown in the header/
   * empty state so "nothing here" reads as "not this month" rather than "never connected". */
  month: number;
  year: number;
  forecastProfile: ForecastProfileMonth[];
  appliedIds: Set<string>;
  onToggleApplied: (id: string) => void;
  onApplyAll: () => void;
  onRemoveAll: () => void;
  onOpen: (c: ConnectedContribution) => void;
  onAddClick: () => void;
}> = ({ connected, loading, disabled, month, year, forecastProfile, appliedIds, onToggleApplied, onApplyAll, onRemoveAll, onOpen, onAddClick }) => {
  const allApplied = connected.length > 0 && connected.every((c) => appliedIds.has(c.item.id));

  const baseByMonth = new Map(forecastProfile.map((m) => [m.month, m.baseValue]));
  const breakdownByMonth = new Map<number, MonthBreakdown>();
  for (const c of connected) {
    if (!appliedIds.has(c.item.id)) continue;
    const li = c.summary.lastImpact;
    if (!li?.month || li.year !== year) continue;
    if (!breakdownByMonth.has(li.month)) {
      breakdownByMonth.set(li.month, { month: li.month, original: baseByMonth.get(li.month) ?? 0, contributions: [], proposed: baseByMonth.get(li.month) ?? 0 });
    }
    const entry = breakdownByMonth.get(li.month)!;
    const value = li.driverNewValue ?? 0;
    entry.contributions.push({ id: c.item.id, name: c.item.name || '(unnamed)', kind: c.kind, value });
    entry.proposed += value;
  }
  const breakdowns = Array.from(breakdownByMonth.values()).sort((a, b) => a.month - b.month);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div>
          <h3>POCs / Tactics — {MONTHS[month - 1]} {year}</h3>
          <div className="sub">Each drives one component of a model; results stack and accumulate into the target.</div>
        </div>
        <div style={{ flex: 1 }} />
        {connected.length > 0 && (
          <Button size="sm" variant={allApplied ? 'default' : 'accent'} onClick={allApplied ? onRemoveAll : onApplyAll}>
            {allApplied ? 'Remove All from Forecast' : 'Apply All to Forecast'}
          </Button>
        )}
        <Button size="sm" disabled={disabled} onClick={onAddClick}>
          + POC / Tactic
        </Button>
      </div>
      <div className="card-body">
        {loading ? (
          <div className="muted">Loading…</div>
        ) : connected.length === 0 ? (
          <div className="empty-state">
            <h4>No POC/Tactic contributions for {MONTHS[month - 1]} {year}</h4>
            <p>Use "+ POC / Tactic" below to link one, or check another month — an Impact applied for a different month won't show here.</p>
          </div>
        ) : (
          <>
            {connected.map((c) => {
              const contribution = c.summary.lastImpact?.driverNewValue;
              const isApplied = appliedIds.has(c.item.id);
              return (
                <div className="item" key={c.item.id}>
                  <div className="item-head">
                    <span className={`badge ${c.kind === 'Tactic' ? 'track-op' : 'track-sv'}`}>{c.kind}</span>
                    <span className="title" style={{ cursor: 'pointer' }} onClick={() => onOpen(c)}>
                      {c.item.name || '(unnamed)'}
                    </span>
                    <span className="impact-status linked">✓ Impact Applied</span>
                    <Button size="xs" variant={isApplied ? 'default' : 'accent'} onClick={() => onToggleApplied(c.item.id)}>
                      {isApplied ? 'Remove from Forecast' : 'Apply to Forecast'}
                    </Button>
                  </div>
                  <div className="rel-trail">
                    <span className="rel-chip">{c.item.strategyKpiName ?? c.item.kpiName ?? 'No KPI'}</span>
                    <span className="rel-arrow" aria-hidden="true">→</span>
                    <span className={`rel-chip${c.summary.financialModelName ? '' : ' empty'}`}>
                      {c.summary.financialModelName ?? 'No Financial Model'}
                    </span>
                  </div>
                  <div className="stat-chip-row">
                    <div className="stat-chip">
                      <span className="label">Contribution</span>
                      <span className="value">{fmt(contribution)}</span>
                    </div>
                    {c.summary.lastImpact?.month && c.summary.lastImpact?.year && (
                      <div className="stat-chip">
                        <span className="label">Period</span>
                        <span className="value">
                          {MONTHS[c.summary.lastImpact.month - 1]} {c.summary.lastImpact.year}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {breakdowns.length > 0 && (
              <div className="resultbox" style={{ marginTop: 12, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                {breakdowns.map((b) => (
                  <div key={b.month}>
                    <div className="sub">{MONTHS[b.month - 1]} Forecast</div>
                    <div className="stat" style={{ fontSize: 16 }}>
                      Original {fmt(b.original)}
                      {b.contributions.map((ct) => (
                        <React.Fragment key={ct.id}>
                          {'  +  '}
                          {ct.name} {fmt(ct.value)}
                        </React.Fragment>
                      ))}
                      {'  =  '}
                      {fmt(b.proposed)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
