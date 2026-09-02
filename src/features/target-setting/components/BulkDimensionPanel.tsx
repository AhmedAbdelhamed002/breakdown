import React, { useCallback, useEffect, useState } from 'react';
import { AggregationType, rollUpValues } from '../models/types';
import { SearchableSelect } from '@shared/components/SearchableSelect';
import {
  BULK_PAGE_SIZE, DimensionFacet, DimensionOption, dimensionSource
} from '../services/BreakdownDimensionService';

/** A value of the dimension together with the target typed against it. */
export interface BulkEntry {
  option: DimensionOption;
  target: number;
}

interface BulkDimensionPanelProps {
  /** The stf_breakdowntype label being listed — Account, Physician, Payment Type … */
  dimension: string;
  /** Targets already saved, keyed by the row's linked record id, shown so they can be edited too. */
  existingTargets: Record<string, number>;
  /** The parent target, used by "split evenly" and shown as what the rows must come to. */
  parentTarget: number;
  /** How this KPI's parts make up the whole — averaged for Percentage, added for Value. */
  aggType?: AggregationType;
  saving?: boolean;
  onCancel: () => void;
  /** Every value that was given a target — new rows and edits to existing ones. */
  onSave: (entries: BulkEntry[]) => void;
}

/**
 * BulkDimensionPanel — lists a whole dimension at once so every account (or physician, employee…)
 * can be given its target in one pass, instead of picking them one at a time.
 *
 * Values come in pages: the tables behind Account, Physician and Employee run to thousands of
 * rows, so the list loads a page at a time and can be narrowed by a search first. Only values
 * with a target typed against them are saved — the rest are left alone, so listing everything
 * doesn't create an empty row for every record in the table.
 */
export const BulkDimensionPanel: React.FC<BulkDimensionPanelProps> = ({
  dimension, existingTargets, parentTarget, aggType, saving, onCancel, onSave
}) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<DimensionOption[]>([]);
  const [skipToken, setSkipToken] = useState<string | undefined>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /**
   * Every value seen across pages and searches. Targets typed on one page have to survive a
   * later search or "load more", so what gets saved is looked up here, not in the visible list.
   */
  const [seen, setSeen] = useState<Record<string, DimensionOption>>({});
  /** The values being broken down into. The parent target is shared out between these. */
  const [selected, setSelected] = useState<Set<string>>(new Set(Object.keys(existingTargets)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The facet values on offer, once each facet has been loaded. */
  const [facetOptions, setFacetOptions] = useState<Record<string, DimensionOption[]>>({});
  /** Which value each facet is narrowed to — '' means the facet isn't applied. */
  const [facetPicks, setFacetPicks] = useState<Record<string, string>>({});

  const source = dimensionSource(dimension);

  const facets: DimensionFacet[] = source?.facets ?? [];

  useEffect(() => {
    let cancelled = false;
    setFacetPicks({});
    if (!facets.length) { setFacetOptions({}); return; }
    Promise.all(facets.map(async facet => [facet.key, await facet.options()] as const))
      .then(pairs => { if (!cancelled) setFacetOptions(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) setFacetOptions({}); });
    return () => { cancelled = true; };
  }, [dimension]);

  /** The clauses the picked facets add to every read of this dimension. */
  const facetClauses = facets
    .filter(facet => facetPicks[facet.key])
    .map(facet => facet.clause(facetPicks[facet.key]));

  const loadPage = useCallback(async (search: string, token?: string) => {
    if (!source) return;
    setLoading(true);
    setError(null);
    try {
      const page = await source.search(search, { top: BULK_PAGE_SIZE, skipToken: token }, facetClauses);
      setOptions(prev => (token ? [...prev, ...page.options] : page.options));
      setSeen(prev => {
        const next = { ...prev };
        page.options.forEach(option => { next[option.id] = option; });
        return next;
      });
      setSkipToken(page.skipToken);
    } catch (err: any) {
      setError(err.message || `Could not load the ${dimension} list`);
    } finally {
      setLoading(false);
    }
  }, [source, dimension, facetClauses.join('|')]);

  // Reload from the top whenever the search settles.
  useEffect(() => {
    const timer = setTimeout(() => { loadPage(query.trim()); }, 250);
    return () => clearTimeout(timer);
  }, [query, loadPage]);

  if (!source) return null;

  const valueOf = (id: string) => {
    const draft = drafts[id];
    if (draft !== undefined) return draft;
    const existing = existingTargets[id];
    return existing != null ? String(existing) : '';
  };

  const toggle = (id: string, option: DimensionOption) => {
    setSeen(prev => ({ ...prev, [id]: option }));
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // Everything picked anywhere in this sheet, whether or not it's on screen right now.
  const toSave: BulkEntry[] = Array.from(selected)
    .filter(id => seen[id])
    .map(id => ({ option: seen[id], target: parseFloat(valueOf(id)) || 0 }));

  // What the breakdown would come to once saved — the selected values, rolled up this KPI's way.
  const isPercentage = aggType === 'Percentage';
  const resultingCount = toSave.length;
  const resultingTotal = rollUpValues(toSave.map(entry => entry.target), aggType);

  /**
   * Set the selected values so they come to the parent target.
   *
   * A Value KPI shares it out — five accounts under a target of 50 get 10 each. A Percentage KPI
   * averages, so each selected value takes the target itself: five accounts at 80% average to 80%.
   */
  const splitEvenly = () => {
    const ids = selected.size ? Array.from(selected) : options.map(o => o.id);
    if (!ids.length) return;
    const share = isPercentage
      ? parentTarget
      : Math.round((parentTarget / ids.length) * 100) / 100;
    setSeen(prev => {
      const next = { ...prev };
      options.forEach(o => { next[o.id] = o; });
      return next;
    });
    setSelected(new Set(ids));
    setDrafts(prev => ({ ...prev, ...Object.fromEntries(ids.map(id => [id, String(share)])) }));
  };

  return (
    <div className="card" style={{ borderColor: 'var(--primary)', marginTop: '10px' }}>
      <div className="card-head between">
        <h3>All {dimension}s — set targets in one pass</h3>
        <div className="btn-row">
          <input
            value={query}
            placeholder={`Search ${dimension}…`}
            onChange={e => setQuery(e.target.value)}
            style={{ minWidth: '180px' }}
          />
          <button className="btn btn-xs" disabled={saving || !options.length} onClick={splitEvenly}>
            {isPercentage ? 'set selected to the target' : 'split parent across selected'}
          </button>
          <button className="btn btn-xs" disabled={saving} onClick={onCancel}>cancel</button>
        </div>
      </div>

      {facets.length > 0 && (
        <div className="fillbar">
          Narrow by:
          {facets.map(facet => (
            <span key={facet.key} className="stat-inline">
              <span className="eq-lbl">{facet.label}</span>
              <SearchableSelect
                options={(facetOptions[facet.key] ?? []).map(o => ({ value: o.id, label: o.label }))}
                value={facetPicks[facet.key] ?? ''}
                onChange={val => setFacetPicks(prev => ({ ...prev, [facet.key]: val }))}
                placeholder="any"
                emptyLabel="any"
              />
            </span>
          ))}
        </div>
      )}

      <div className="card-body" style={{ padding: 0, maxHeight: '340px', overflow: 'auto' }}>
        {error && <div className="alert alert-warn" style={{ margin: '10px' }}>{error}</div>}
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '32px' }}></th>
              <th>{dimension}</th>
              <th className="tright">Target</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {options.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: '12px' }}>
                  {query ? `No ${dimension} matches “${query}”.` : `No ${dimension} records found.`}
                </td>
              </tr>
            ) : options.map(option => (
              <tr key={option.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(option.id)}
                    onChange={() => toggle(option.id, option)}
                  />
                </td>
                <td>{option.label}</td>
                <td className="tright">
                  <input
                    type="number"
                    value={valueOf(option.id)}
                    placeholder="—"
                    onChange={e => {
                      setDrafts(prev => ({ ...prev, [option.id]: e.target.value }));
                      // Typing a target is itself a choice to include the value.
                      setSeen(prev => ({ ...prev, [option.id]: option }));
                      setSelected(prev => new Set(prev).add(option.id));
                    }}
                    style={{ width: '96px' }}
                  />
                </td>
                <td className="muted" style={{ fontSize: '11px' }}>
                  {existingTargets[option.id] != null ? 'already in this breakdown' : ''}
                </td>
              </tr>
            ))}
            {loading && (
              <tr><td colSpan={4} className="muted" style={{ padding: '12px' }}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card-foot between">
        <span className="sub">
          {resultingCount} {dimension.toLowerCase()}{resultingCount === 1 ? '' : 's'} selected,{' '}
          {isPercentage ? 'averaging' : 'totalling'}{' '}
          <b style={{ color: resultingTotal < parentTarget ? 'var(--danger)' : 'var(--success)' }}>
            {resultingTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </b>{' '}
          against a parent target of {parentTarget.toLocaleString(undefined, { maximumFractionDigits: 2 })}.
          {skipToken && ' More values remain — load them or narrow the search.'}
        </span>
        <div className="btn-row">
          {skipToken && (
            <button className="btn btn-sm" disabled={loading || saving} onClick={() => loadPage(query.trim(), skipToken)}>
              Load more
            </button>
          )}
          <button className="btn btn-primary btn-sm" disabled={saving || toSave.length === 0} onClick={() => onSave(toSave)}>
            Save {toSave.length} row{toSave.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};
