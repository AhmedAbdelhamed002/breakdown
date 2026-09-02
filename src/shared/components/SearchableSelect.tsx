import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** Shown under the label — a type, a code, whatever tells two similar entries apart. */
  hint?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Shown when nothing is selected, and as the empty choice at the top of the list. */
  placeholder?: string;
  /** Set to allow clearing back to '' — the empty choice is only offered when this is given. */
  emptyLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: React.CSSProperties;
}

/**
 * SearchableSelect — a dropdown you can type into.
 *
 * For the lists that run long: business units, departments, KPIs, entities, financial models. Short
 * fixed lists (month, year, a handful of choice options) stay as plain selects, where clicking is
 * quicker than typing.
 *
 * Filtering is over the label and hint together, so an entity can be found by its type as well as
 * its name. The list is closed on outside click or Escape.
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options, value, onChange, placeholder = 'Select…', emptyLabel, disabled, loading, style
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  // Close when the click lands anywhere else, so the list can't be left hanging open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q));
  }, [options, query]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="picker" ref={containerRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        className={`select-like${open ? ' open' : ''}`}
        disabled={disabled || loading}
        onClick={() => { setQuery(''); setOpen(o => !o); }}
      >
        <span className={selected ? '' : 'muted'}>
          {loading ? 'Loading…' : selected?.label ?? placeholder}
        </span>
        <span className="muted" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="picker-pop">
          <input
            autoFocus
            value={query}
            placeholder="Type to filter…"
            onChange={e => setQuery(e.target.value)}
          />
          <div className="picker-list">
            {emptyLabel && (
              <button type="button" className="picker-item muted" onClick={() => pick('')}>
                {emptyLabel}
              </button>
            )}
            {matches.length === 0 ? (
              <div className="muted" style={{ padding: '6px 8px' }}>No match for “{query}”.</div>
            ) : matches.map(option => (
              <button
                type="button"
                key={option.value}
                className={`picker-item${option.value === value ? ' on' : ''}`}
                onClick={() => pick(option.value)}
              >
                {option.label}
                {option.hint && <div className="sub">{option.hint}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
