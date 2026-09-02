import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

export type SearchableSelectOption = {
  value: string;
  label: string;
};

interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** Shown when the current value is not in `options` (e.g. a blocked KPI still on the record). */
  valueLabel?: string;
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Search…',
  disabled = false,
  style,
  allowEmpty = false,
  emptyLabel = '—',
  valueLabel,
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const selected = options.find((o) => o.value === value);
  const displayLabel =
    selected?.label || valueLabel || (allowEmpty && !value ? emptyLabel : '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
      : options;
    if (allowEmpty && !q) {
      return [{ value: '', label: emptyLabel }, ...list];
    }
    return list;
  }, [options, query, allowEmpty, emptyLabel]);

  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    };

    updatePos();
    setHighlight(0);
    inputRef.current?.focus();

    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };

    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  const selectOption = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) selectOption(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const {
    width,
    flex,
    minWidth,
    maxWidth,
    flexGrow,
    flexShrink,
    flexBasis,
    ...triggerStyleOverrides
  } = style ?? {};

  const triggerStyle: CSSProperties = {
    width: '100%',
    textAlign: 'left',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: displayLabel ? 'var(--text-primary)' : 'var(--text-muted)',
    boxSizing: 'border-box',
    opacity: disabled ? 0.6 : 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    ...triggerStyleOverrides,
  };

  return (
    <div
      ref={rootRef}
      className="lk"
      style={{
        minWidth: minWidth ?? 0,
        width: width ?? (flex || flexGrow ? undefined : '100%'),
        maxWidth,
        flex,
        flexGrow,
        flexShrink,
        flexBasis,
      }}
    >
      {open && !disabled ? (
        <input
          ref={inputRef}
          className="lk-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-expanded
          aria-autocomplete="list"
          style={triggerStyle}
        />
      ) : (
        <button
          type="button"
          className="lk-input"
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          title={displayLabel || placeholder}
          style={triggerStyle}
        >
          {displayLabel || placeholder}
        </button>
      )}

      {open && !disabled && (
        <div
          role="listbox"
          className="lk-menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: 240,
            zIndex: 1000,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
              No matches
            </div>
          ) : (
            filtered.map((opt, i) => {
              const active = i === highlight;
              const chosen = opt.value === value;
              return (
                <button
                  key={`${opt.value || 'empty'}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  className="lk-menu-item"
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(opt.value);
                  }}
                  style={{
                    background: active || chosen ? 'var(--primary-faint)' : undefined,
                    fontWeight: chosen ? 600 : undefined,
                  }}
                >
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
