import { useState } from 'react';
import { MODES, type ModeId } from '../content/modes';
import { modeHref } from '../lib/route';

/** Square plate, spare text: one mode at a time, chosen by plain text tabs. */
export default function ModeShowcase() {
  const [id, setId] = useState<ModeId>('dental');
  const mode = MODES.find((m) => m.id === id)!;
  const other = MODES[(MODES.indexOf(mode) + 1) % MODES.length];

  return (
    <section className="showcase" aria-labelledby="showcase-title">
      <div className="showcase__plate" data-reveal>
        <img key={mode.plate.src} src={mode.plate.src} width={mode.plate.width} height={mode.plate.height} alt={mode.plate.alt} loading="lazy" />
      </div>
      <div className="showcase__text">
        <div className="showcase__tabs" role="tablist" aria-label="Mode">
          {MODES.map((m) => (
            <button key={m.id} role="tab" id={`tab-${m.id}`} aria-selected={m.id === id} aria-controls="showcase-panel" onClick={() => setId(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
        <div id="showcase-panel" role="tabpanel" aria-labelledby={`tab-${id}`} className="showcase__panel">
          <h2 id="showcase-title">{mode.name}</h2>
          <p>{mode.lead}</p>
          <ul className="showcase__list">
            {mode.covers.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
        <div className="showcase__actions">
          <a className="button" href={modeHref(mode.id)}>Open {mode.name.toLowerCase()}</a>
          <a className="button button--quiet" href={modeHref(other.id)}>Or try {other.name.toLowerCase()}</a>
        </div>
      </div>
    </section>
  );
}
