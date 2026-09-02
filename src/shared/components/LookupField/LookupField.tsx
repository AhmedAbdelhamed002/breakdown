import { useState } from "react";

export interface LookupOption {
  id: string;
  label: string;
}

interface Props {
  value: string;
  /** `label` is the just-selected option's label (omitted when clearing) — for callers that need to remember a display name (e.g. a linked project) without a separate lookup. */
  onChange: (id: string, label?: string) => void;
  /** Fallback label for `value` when it isn't present in `options`/search results yet — e.g. editing an existing record whose selected item falls outside a live search's first page. */
  selectedLabel?: string;
  /** Static list, filtered client-side as the user types. Use this OR `onSearch`, not both. */
  options?: LookupOption[];
  /** Live server-side search (e.g. user directory) — called on every keystroke, same as a plain search box. */
  onSearch?: (term: string) => Promise<LookupOption[]>;
  placeholder?: string;
  disabled?: boolean;
}

/** Single-select searchable combobox: selected value shown as a removable chip, otherwise a filterable text input + dropdown menu. */
export function LookupField({ value, onChange, selectedLabel, options, onSearch, placeholder, disabled }: Props) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<LookupOption[]>([]);

  const staticList = options ?? [];
  const selected = staticList.find((o) => o.id === value) ?? searchResults.find((o) => o.id === value);
  // A value can arrive before its own options have finished loading (e.g. reopening an existing
  // record) — `selected` won't be found yet, and without a caller-supplied `selectedLabel` the only
  // thing left to show was the raw id itself. Never show that: it reads as a cryptic GUID rather
  // than "still resolving the name" to the user. "Loading…" is honest even in the rarer case where
  // the id turns out to be genuinely unresolvable (a stale/broken reference) — a stuck "Loading…" is
  // still less misleading than a bare GUID.
  const resolving = !!value && !selected && !selectedLabel;
  const shown = selected ?? (value ? { id: value, label: selectedLabel ?? "Loading…" } : undefined);

  async function runSearch(q: string) {
    if (!onSearch) return;
    setSearchResults(await onSearch(q));
  }

  function handleFocus() {
    setOpen(true);
    if (onSearch && searchResults.length === 0) void runSearch(term);
  }

  function handleTermChange(next: string) {
    setTerm(next);
    setOpen(true);
    if (onSearch) void runSearch(next);
  }

  const filtered = onSearch ? searchResults : staticList.filter((o) => !term || o.label.toLowerCase().includes(term.toLowerCase()));

  function select(o: LookupOption) {
    onChange(o.id, o.label);
    setTerm("");
    setOpen(false);
  }
  function clear() {
    onChange("");
    setTerm("");
  }

  return (
    <div className="lk">
      <div className="lk-input">
        <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
          {shown && (
            <span className={`chip${resolving ? " chip-loading" : ""}`}>
              {shown.label}
              <button type="button" onClick={clear} aria-label="Clear" disabled={disabled}>
                ×
              </button>
            </span>
          )}
        </div>
        {!shown && (
          <input
            type="text"
            placeholder={placeholder}
            autoComplete="off"
            disabled={disabled}
            value={term}
            onChange={(e) => handleTermChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        )}
      </div>
      {open && !shown && filtered.length > 0 && (
        <div className="lk-menu">
          {filtered.map((o) => (
            <button key={o.id} type="button" className="lk-menu-item" onMouseDown={() => select(o)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
