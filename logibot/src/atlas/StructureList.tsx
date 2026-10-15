import { useMemo, useState } from 'react';
import { TISSUES } from '../content/histology';
import type { ModeId } from '../content/modes';
import { GROUP_ORDER, STRUCTURES } from '../content/structures';
import { fdi, type NumberingSystem } from '../content/teeth';
import { groupLabel, labelFor } from './describe';

interface Props {
  mode: ModeId;
  groups: string[];
  system: NumberingSystem;
  selected: string | null;
  onSelect: (key: string) => void;
}

/** Searchable index of everything selectable in the current mode, grouped. */
export default function StructureList({ mode, groups, system, selected, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (label: string) => !q || label.toLowerCase().includes(q);
    if (mode === 'histology') {
      return [{ group: 'Tissues', items: TISSUES.map((t) => ({ key: t.key, label: t.name })).filter((i) => match(i.label)) }];
    }
    return GROUP_ORDER.filter((g) => groups.includes(g)).map((g) => ({
      group: groupLabel(g),
      items: STRUCTURES.filter((s) => s.group === g)
        .sort((a, b) => (a.tooth && b.tooth ? Number(fdi(a.tooth)) - Number(fdi(b.tooth)) : a.name.localeCompare(b.name)))
        .map((s) => ({ key: s.key, label: labelFor(mode, s.key, system) }))
        .filter((i) => match(i.label)),
    })).filter((s) => s.items.length);
  }, [mode, groups, system, query]);

  return (
    <section className="list" aria-labelledby="list-title">
      <h2 id="list-title" className="sr-only">Structures</h2>
      <label className="sr-only" htmlFor="list-search">Search structures</label>
      <input id="list-search" className="list__search" type="search" placeholder="Search structures" value={query} onChange={(e) => setQuery(e.target.value)} />
      {sections.map((s) => (
        <div key={s.group} className="list__group">
          <h3>{s.group}</h3>
          <ul>
            {s.items.map((i) => (
              <li key={i.key}>
                <button aria-current={i.key === selected ? 'true' : undefined} onClick={() => onSelect(i.key)}>{i.label}</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {sections.length === 0 && <p className="list__empty">Nothing matches “{query}”.</p>}
    </section>
  );
}
