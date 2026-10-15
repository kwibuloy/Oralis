import { useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS } from '../content/anatomy';
import { TISSUES } from '../content/histology';
import { MODES, modeById, type ModeId } from '../content/modes';
import { BODYPARTS3D, SITE } from '../content/site';
import { GROUP_COLOR, MESH_TO_KEY, STRUCTURES, structureByKey } from '../content/structures';
import { SYSTEM_LABEL, type NumberingSystem } from '../content/teeth';
import { modeHref, replaceSelection } from '../lib/route';
import { buildToothSection } from '../viewer/histologyModel';
import { Viewer } from '../viewer/Viewer';
import { archOf, labelFor } from './describe';
import InfoCard from './InfoCard';
import StructureList from './StructureList';
import './atlas.css';

type ArchFilter = 'both' | 'upper' | 'lower';
const BITE_OPEN = { x: 0, y: -1.8, z: 0.4 };
const headGroups = Object.keys(GROUPS);
const tissueKeys = TISSUES.map((t) => t.key);

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export default function Atlas({ modeId, initialSelected }: { modeId: ModeId; initialSelected?: string }) {
  const mode = modeById(modeId)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [visible, setVisible] = useState<string[]>(mode.defaultVisible);
  const [showContext, setShowContext] = useState(true);
  const [isolated, setIsolated] = useState(false);
  const [system, setSystem] = useState<NumberingSystem>('fdi');
  const [arch, setArch] = useState<ArchFilter>('both');
  const [biteOpen, setBiteOpen] = useState(false);

  const allGroups = mode.model === 'tooth-section' ? tissueKeys : headGroups;
  const listGroups = mode.id === 'dental' ? [...mode.defaultVisible, ...(mode.context ?? [])] : visible;

  // Viewer lifecycle: one per mount (App keys this component by model).
  useEffect(() => {
    if (!canvas.current) return;
    const v = new Viewer(canvas.current);
    viewer.current = v;
    if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = v;
    v.onHover = (key, at) => setHover(key && at ? { key, ...at } : null);
    v.onPick = (key) => setSelected(key);
    let cancelled = false;
    const load = mode.model === 'tooth-section'
      ? Promise.resolve(v.loadGroup(buildToothSection(), (key) => ({ key, group: key, color: TISSUES.find((t) => t.key === key)!.color })))
      : v.loadGLB('/models/head.glb', (id) => {
        const key = MESH_TO_KEY.get(id);
        const s = key ? structureByKey(key) : undefined;
        return s ? { key: s.key, group: s.group, color: GROUP_COLOR[s.group] ?? '#ddd' } : null;
      });
    load.then(() => !cancelled && setReady(true)).catch(() => !cancelled && setError('The 3D model could not be loaded. Check your connection and reload.'));
    return () => { cancelled = true; v.dispose(); viewer.current = null; };
  }, [mode.model]);

  // Reset per-mode state when switching between modes that share a model.
  const lastMode = useRef(modeId);
  useEffect(() => {
    if (lastMode.current === modeId) return;
    lastMode.current = modeId;
    setVisible(mode.defaultVisible);
    setShowContext(true);
    setIsolated(false);
    setArch('both');
    setBiteOpen(false);
    setSelected(initialSelected ?? null);
  }, [modeId, mode.defaultVisible, initialSelected]);

  // Push state into the viewer.
  useEffect(() => {
    viewer.current?.setVisibleGroups(visible, showContext ? mode.context ?? [] : []);
  }, [visible, showContext, mode.context, ready]);

  useEffect(() => {
    viewer.current?.setFilter(arch === 'both' ? () => true : (key) => archOf(key) === arch);
  }, [arch, ready]);

  useEffect(() => {
    viewer.current?.setOffset((key) => archOf(key) === 'lower', biteOpen ? BITE_OPEN : { x: 0, y: 0, z: 0 });
  }, [biteOpen, ready]);

  useEffect(() => {
    if (!ready) return;
    viewer.current?.select(selected);
    replaceSelection(modeId, selected ?? undefined);
    if (!selected) setIsolated(false);
  }, [selected, ready, modeId]);

  useEffect(() => { viewer.current?.setIsolated(isolated); }, [isolated, ready]);

  // Frame the visible set when a mode opens or the arch changes.
  useEffect(() => { if (ready && !selected) viewer.current?.frameAll(); }, [ready, modeId, arch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleGroup = (g: string) => setVisible((v) => (v.includes(g) ? v.filter((x) => x !== g) : [...v, g]));
  const counts = useMemo(() => Object.fromEntries(headGroups.map((g) => [g, STRUCTURES.filter((s) => s.group === g).length])), []);

  return (
    <div className="atlas">
      <header className="atlas__bar">
        <a className="atlas__wordmark" href="#/">{SITE.name}</a>
        <nav className="atlas__modes" aria-label="Mode">
          {MODES.map((m) => (
            <a key={m.id} href={modeHref(m.id)} aria-current={m.id === modeId ? 'page' : undefined}>
              <span className="atlas__mode-long">{m.name}</span><span className="atlas__mode-short">{m.short}</span>
            </a>
          ))}
        </nav>
        <button className="button button--quiet atlas__reset" onClick={() => { setSelected(null); viewer.current?.resetView(); }}>Reset view</button>
      </header>

      <section className="atlas__stage" aria-label={`${mode.name} model`}>
        <canvas ref={canvas} aria-hidden="true" />
        {!ready && !error && <p className="atlas__loading">Loading the {mode.model === 'head' ? 'head and neck' : 'tooth section'}…</p>}
        {error && <p className="atlas__error" role="alert">{error}</p>}
        {hover && hover.key !== selected && (
          <p className="atlas__tag" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }}>{labelFor(modeId, hover.key, system)}</p>
        )}
        <div className="atlas__controls">
          {mode.id === 'dental' && (
            <>
              <Segmented label="Numbering system" value={system} onChange={setSystem} options={(['fdi', 'universal', 'palmer'] as const).map((s) => [s, SYSTEM_LABEL[s]])} />
              <Segmented label="Arch" value={arch} onChange={setArch} options={[['both', 'Both arches'], ['upper', 'Upper'], ['lower', 'Lower']]} />
              <button className="chip" aria-pressed={biteOpen} onClick={() => setBiteOpen((b) => !b)}>Open bite</button>
              <button className="chip" aria-pressed={showContext} onClick={() => setShowContext((b) => !b)}>Jaw bones</button>
            </>
          )}
          {selected && (
            <button className="chip" aria-pressed={isolated} onClick={() => setIsolated((b) => !b)}>{isolated ? 'Show surroundings' : 'Isolate'}</button>
          )}
        </div>
        <p className="atlas__hint">Drag to turn · scroll or pinch to zoom · right-drag to pan · tap a structure</p>
      </section>

      <aside className="atlas__panel" aria-label="Details">
        {selected ? (
          <div className="atlas__selected">
            <InfoCard mode={modeId} selected={selected} />
            <button className="link atlas__clear" onClick={() => setSelected(null)}>Clear selection</button>
          </div>
        ) : (
          <div className="atlas__intro">
            <h1>{mode.name}</h1>
            <p>{mode.lead}</p>
          </div>
        )}

        {mode.id !== 'dental' && (
          <fieldset className="layers">
            <legend>{mode.model === 'tooth-section' ? 'Tissues' : 'Layers'}</legend>
            {allGroups.map((g) => {
              const tissue = TISSUES.find((t) => t.key === g);
              return (
                <label key={g} className="layers__item">
                  <input type="checkbox" checked={visible.includes(g)} onChange={() => toggleGroup(g)} />
                  <span className="swatch" style={{ background: tissue?.color ?? GROUP_COLOR[g] }} aria-hidden="true" />
                  {tissue?.name ?? GROUPS[g].label}
                  {!tissue && <span className="layers__count">{counts[g]}</span>}
                </label>
              );
            })}
          </fieldset>
        )}

        <StructureList mode={modeId} groups={mode.model === 'tooth-section' ? tissueKeys : listGroups} system={system} selected={selected} onSelect={setSelected} />

        <p className="atlas__credit">
          {mode.model === 'head'
            ? <>Geometry: <a className="link" href={BODYPARTS3D.url}>{BODYPARTS3D.name}</a>, {BODYPARTS3D.by}, <a className="link" href={BODYPARTS3D.license.url}>{BODYPARTS3D.license.name}</a>. Simplified for the web.</>
            : <>A schematic section drawn in code; proportions are stylised for teaching.</>}
          {' '}For study only, not clinical use.
        </p>
      </aside>
    </div>
  );
}
