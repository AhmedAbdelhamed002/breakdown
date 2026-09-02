import React, { useEffect, useState } from 'react';
import { DimensionOption, dimensionSource } from '../services/BreakdownDimensionService';

interface DimensionPickerProps {
  /** The stf_breakdowntype label being picked from — Account, Physician, Payment Type … */
  dimension: string;
  /** What the picked value currently reads as, shown until the picker is opened. */
  value?: string;
  disabled?: boolean;
  onPick: (option: DimensionOption) => void;
  /** Text on the button that opens the picker. */
  label?: string;
}

/**
 * DimensionPicker — chooses which value of a dimension a breakdown row is.
 *
 * Account, physician and employee tables run to thousands of rows, so matches are searched in
 * Dataverse rather than loaded up front; the small ones (platform, payment type) simply come back
 * whole on the empty query. The picked option is handed back to the caller, which writes it to
 * the dimension's lookup.
 */
export const DimensionPicker: React.FC<DimensionPickerProps> = ({
  dimension, value, disabled, onPick, label = 'pick'
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<DimensionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = dimensionSource(dimension);

  // Search as the query settles, so a keystroke doesn't cost a request each.
  useEffect(() => {
    if (!open || !source) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      source.search(query.trim())
        .then(page => { if (!cancelled) setOptions(page.options); })
        .catch(err => { if (!cancelled) setError(err.message || `Could not load ${dimension} list`); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query, dimension, source]);

  if (!source) return <span className="muted">{value || '—'}</span>;

  if (!open) {
    return (
      <span className="stat-inline">
        <span>{value || <span className="muted">not set</span>}</span>
        <button className="btn btn-xs" disabled={disabled} onClick={() => { setQuery(''); setOpen(true); }}>
          {label}
        </button>
      </span>
    );
  }

  return (
    <div className="picker">
      <div className="stat-inline">
        <input
          autoFocus
          value={query}
          placeholder={`Search ${dimension}…`}
          onChange={e => setQuery(e.target.value)}
          style={{ minWidth: '180px' }}
        />
        <button className="btn btn-xs" onClick={() => setOpen(false)}>cancel</button>
      </div>
      <div className="picker-list">
        {loading ? (
          <div className="muted" style={{ padding: '6px 8px' }}>Searching…</div>
        ) : error ? (
          <div className="warn-text" style={{ padding: '6px 8px' }}>{error}</div>
        ) : options.length === 0 ? (
          <div className="muted" style={{ padding: '6px 8px' }}>No {dimension} matches “{query}”.</div>
        ) : options.map(option => (
          <button
            key={option.id}
            className="picker-item"
            onClick={() => { onPick(option); setOpen(false); }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
