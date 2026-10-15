import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

export interface SearchItem {
  key: string;
  label: string;
  group: string;
  color: string;
}

/** "Find a structure" box: `/` focuses it, arrows move, Enter selects. */
export default function Search({ items, onSelect }: { items: SearchItem[]; onSelect: (key: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)).slice(0, 8);
  }, [items, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (key: string) => {
    onSelect(key);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search">
      <label className="card search__box">
        <Icon name="search" />
        <span className="sr-only">Find a structure</span>
        <input
          ref={input} value={query} placeholder="Find a structure" autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={open && results.length > 0} aria-controls="search-results"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && results[active]) choose(results[active].key);
            if (e.key === 'Escape') { setQuery(''); input.current?.blur(); }
          }}
        />
        <kbd>/</kbd>
      </label>
      {open && results.length > 0 && (
        <ul id="search-results" className="card search__results" role="listbox">
          {results.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === active}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r.key)} onMouseEnter={() => setActive(i)}>
                <span className="dot" style={{ background: r.color }} aria-hidden="true" />
                <span className="search__label">{r.label}</span>
                <span className="search__group">{r.group}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && results.length === 0 && <p className="card search__empty">No structure matches “{query}”.</p>}
    </div>
  );
}
