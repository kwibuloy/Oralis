import { useEffect, useMemo, useRef, useState } from 'react';
import { GROUP_SYSTEM, GROUPS, SYSTEMS, type SystemId } from '../content/anatomy';
import { TISSUES } from '../content/histology';
import { modeById, type ModeId } from '../content/modes';
import { BODYPARTS3D, SITE } from '../content/site';
import { GROUP_COLOR, GROUP_ORDER, MESH_TO_KEY, structureByKey, structuresIn } from '../content/structures';
import { SYSTEM_LABEL, type NumberingSystem } from '../content/teeth';
import { replaceSelection } from '../lib/route';
import { Viewer, type View } from '../viewer/Viewer';
import { Segmented, Switch } from './controls';
import { archOf, labelFor } from './describe';
import DetailCard from './DetailCard';
import Icon from './Icon';
import SubjectPicker from './SubjectPicker';
import Search, { type SearchItem } from './Search';
import './atlas.css';

type ArchFilter = 'both' | 'upper' | 'lower';
const BITE_OPEN = { x: 0, y: -1.6, z: 0.3 };
const VIEWS: [View, string, string][] = [['front', 'F', 'Front'], ['side', 'S', 'Side'], ['back', 'B', 'Back'], ['top', 'T', 'Top']];
const STAGE_LABEL: Record<ModeId, string> = {
  general: 'Whole body · adult male',
  dental: 'Permanent dentition',
  histology: 'Longitudinal section · schematic',
};

interface Layer { id: string; label: string; color: string; count: number }

function layersFor(modeId: ModeId, model: string, bySystem: boolean): Layer[] {
  if (modeId === 'histology') return TISSUES.map((t) => ({ id: t.key, label: t.name, color: t.color, count: 1 }));
  const inModel = structuresIn(model);
  const rank = (g: string) => SYSTEMS.findIndex((s) => s.id === GROUP_SYSTEM[g]);
  const order = bySystem ? [...GROUP_ORDER].sort((a, b) => rank(a) - rank(b)) : GROUP_ORDER;
  return order.filter((g) => inModel.some((s) => s.group === g)).map((g) => ({
    id: g, label: GROUPS[g].label, color: GROUP_COLOR[g], count: inModel.filter((s) => s.group === g).length,
  }));
}

export default function Atlas({ modeId, initialSelected }: { modeId: ModeId; initialSelected?: string }) {
  const mode = modeById(modeId)!;
  const modelName = mode.model.replace(/^.*\/|\.glb$/g, '');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [visible, setVisible] = useState<string[]>(mode.defaultVisible);
  const [isolated, setIsolated] = useState(false);
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [view, setView] = useState<View | null>('front');
  const [system, setSystem] = useState<NumberingSystem>('fdi');
  const [arch, setArch] = useState<ArchFilter>('both');
  const [biteOpen, setBiteOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  const layers = useMemo(() => layersFor(modeId, modelName, !!mode.systems), [modeId, modelName, mode.systems]);
  const context = (mode.context ?? []).filter((g) => !visible.includes(g));
  const piecesVisible = layers.filter((l) => visible.includes(l.id)).reduce((t, l) => t + l.count, 0);
  const totalPieces = layers.reduce((t, l) => t + l.count, 0);

  // One viewer and one model per mode (App keys this component by mode).
  useEffect(() => {
    if (!canvas.current) return;
    const v = new Viewer(canvas.current);
    viewer.current = v;
    if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = v;
    v.onHover = (key, at) => setHover(key && at ? { key, ...at } : null);
    v.onPick = (key) => setSelected(key);
    let cancelled = false;
    v.loadGLB(mode.model, (node) => {
      if (modeId === 'histology') {
        const t = TISSUES.find((x) => x.key === node);
        return t ? { key: t.key, group: t.key, color: t.color } : null;
      }
      const key = MESH_TO_KEY.get(node);
      const s = key ? structureByKey(key) : undefined;
      return s ? { key: s.key, group: s.group, color: GROUP_COLOR[s.group] ?? '#ddd' } : null;
    })
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setError('The 3D model could not be loaded. Check your connection and reload.'));
    return () => { cancelled = true; v.dispose(); viewer.current = null; };
  }, [mode.model, modeId]);

  // Push React state into the viewer.
  useEffect(() => { viewer.current?.setVisibleGroups(visible, context); }, [visible, context.join(), ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // Presets can change the extent a lot (whole body → head), so they refit; single toggles don't.
  const [presetTick, setPresetTick] = useState(0);
  useEffect(() => { if (presetTick) viewer.current?.fit(); }, [presetTick]);
  useEffect(() => { viewer.current?.setFilter(arch === 'both' ? () => true : (key) => archOf(key) === arch); }, [arch, ready]);
  useEffect(() => { viewer.current?.setOffset((key) => archOf(key) === 'lower', biteOpen ? BITE_OPEN : { x: 0, y: 0, z: 0 }); }, [biteOpen, ready]);
  useEffect(() => { viewer.current?.setExplode(explode); }, [explode, ready]);
  useEffect(() => { viewer.current?.setAutoRotate(autoRotate); }, [autoRotate, ready]);
  useEffect(() => { viewer.current?.setIsolated(isolated); }, [isolated, ready]);
  useEffect(() => {
    if (!ready) return;
    viewer.current?.select(selected);
    replaceSelection(modeId, selected ?? undefined);
    if (!selected) setIsolated(false);
  }, [selected, ready, modeId]);

  // Refit once the slider settles; the inventory (past 50%) reads best face-on.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      if (explode > 0.5) { viewer.current?.setView('front'); setView('front'); } else viewer.current?.fit();
    }, 220);
    return () => clearTimeout(id);
  }, [explode, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelected(null); setCreditsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchItems: SearchItem[] = useMemo(() => {
    if (modeId === 'histology') return TISSUES.map((t) => ({ key: t.key, label: t.name, group: 'Tissue', color: t.color }));
    return structuresIn(modelName).map((s) => ({ key: s.key, label: labelFor(modeId, s.key, system), group: GROUPS[s.group].label, color: GROUP_COLOR[s.group] }));
  }, [modeId, modelName, system]);

  const toggle = (id: string, on: boolean) => setVisible((v) => (on ? [...new Set([...v, id])] : v.filter((x) => x !== id)));
  // System chips: a system is on when all its layers are; toggling adds or removes them all. Skin stays a manual layer.
  const systemLayers = (id: SystemId) => layers.filter((l) => GROUP_SYSTEM[l.id] === id && l.id !== 'skin').map((l) => l.id);
  const systemOn = (id: SystemId) => systemLayers(id).every((g) => visible.includes(g));
  const toggleSystem = (id: SystemId) => {
    const ids = systemLayers(id);
    setVisible((v) => (systemOn(id) ? v.filter((g) => !ids.includes(g)) : [...new Set([...v, ...ids])]));
    setPresetTick((t) => t + 1);
  };
  const activePreset = mode.presets.find((p) => p.groups.length === visible.length && p.groups.every((g) => visible.includes(g)))?.label ?? null;
  const goView = (v: View) => { setView(v); viewer.current?.setView(v); };
  const resetAll = () => {
    setSelected(null); setExplode(0); setIsolated(false); setBiteOpen(false); setArch('both');
    setVisible(mode.defaultVisible); setAutoRotate(false); setView('front');
    requestAnimationFrame(() => viewer.current?.setView('front'));
  };
  const stageLabel = explode > 0.5 ? 'Anatomical inventory' : explode > 0 ? 'Separated structures' : STAGE_LABEL[modeId];

  return (
    <div className="atlas" data-mode={modeId}>
      <div className="atlas__stage">
        <span className="floor" aria-hidden="true" />
        <canvas ref={canvas} aria-label={`${mode.name} 3D model`} role="img" />
        <p className="floor__label" aria-hidden="true">{stageLabel}</p>
        {!ready && !error && <p className="atlas__status">Loading the {mode.name.toLowerCase()} model…</p>}
        {error && <p className="atlas__status atlas__status--error" role="alert">{error}</p>}
        {hover && hover.key !== selected && (
          <p className="tag" style={{ transform: `translate(${hover.x}px, ${hover.y + 22}px) translateX(-50%)` }}>
            {labelFor(modeId, hover.key, system)}
          </p>
        )}
      </div>

      <header className="brand">
        <p className="brand__eyebrow"><span className="brand__dot" />{SITE.eyebrow}</p>
        <h1>{SITE.name} <span className="chip">3D</span></h1>
        <p className="brand__meta">{totalPieces} modeled pieces · {mode.source === 'blender' ? 'Modeled in Blender' : 'BodyParts3D'}</p>
      </header>

      <SubjectPicker current={modeId} />

      <div className="topright">
        <Search items={searchItems} onSelect={setSelected} />
        <button className="card icon-button" aria-label="Sources and credits" aria-expanded={creditsOpen} onClick={() => setCreditsOpen((o) => !o)}>
          <Icon name="info" />
        </button>
      </div>

      <button className="card layers-toggle" aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
        <Icon name="layers" /> Layers
      </button>
      <section className={`card layers${layersOpen ? ' is-open' : ''}`} aria-labelledby="layers-title">
        <div className="layers__head">
          <h2 id="layers-title">{modeId === 'histology' ? 'Tissues' : 'Layers'}</h2>
          <span className="count">{layers.length}</span>
        </div>
        {mode.systems ? (
          <div className="systems" role="group" aria-label="Body systems">
            {SYSTEMS.map((s) => (
              <button key={s.id} className="systems__chip" aria-pressed={systemOn(s.id)} onClick={() => toggleSystem(s.id)}>{s.label}</button>
            ))}
          </div>
        ) : (
          <Segmented label="Layer preset" value={activePreset} options={mode.presets.map((p) => [p.label, p.label])}
            onChange={(label) => { setVisible(mode.presets.find((p) => p.label === label)!.groups); setPresetTick((t) => t + 1); }} />
        )}
        <ul className="layers__list">
          {layers.map((l) => (
            <li key={l.id}>
              <span className="dot" style={{ background: l.color }} aria-hidden="true" />
              <span className="layers__label">{l.label}</span>
              {modeId !== 'histology' && <span className="layers__count">{l.count}</span>}
              <Switch label={`Show ${l.label}`} checked={visible.includes(l.id)} onChange={(on) => toggle(l.id, on)} />
            </li>
          ))}
        </ul>
        {modeId === 'dental' && (
          <div className="layers__extra">
            <p className="layers__caption">Numbering</p>
            <Segmented label="Numbering system" value={system} onChange={setSystem}
              options={(['fdi', 'universal', 'palmer'] as const).map((s) => [s, SYSTEM_LABEL[s]])} />
            <p className="layers__caption">Arch</p>
            <Segmented label="Arch" value={arch} onChange={setArch} options={[['both', 'Both'], ['upper', 'Upper'], ['lower', 'Lower']]} />
            <div className="layers__row">
              <span>Open bite</span>
              <Switch label="Open bite" checked={biteOpen} onChange={setBiteOpen} />
            </div>
          </div>
        )}
        <div className="layers__foot">
          <span>{piecesVisible} {modeId === 'histology' ? 'tissues' : 'pieces'} visible</span>
          <button className="text-button" onClick={() => setVisible(piecesVisible ? [] : layers.map((l) => l.id))}>
            {piecesVisible ? 'Hide all' : 'Show all'}
          </button>
        </div>
      </section>

      <div className="card toolbar" role="toolbar" aria-label="View">
        <button className="icon-button" aria-pressed={autoRotate} aria-label="Auto-rotate" onClick={() => setAutoRotate((a) => !a)}>
          <Icon name="rotate" />
        </button>
        <span className="toolbar__sep" />
        {VIEWS.map(([v, letter, name]) => (
          <button key={v} className="toolbar__view" aria-pressed={view === v} aria-label={`${name} view`} title={`${name} view`} onClick={() => goView(v)}>
            {letter}
          </button>
        ))}
        <span className="toolbar__sep" />
        <button className="icon-button" aria-label="Reset everything" title="Reset" onClick={resetAll}><Icon name="reset" /></button>
      </div>

      <section className="card explode" aria-labelledby="explode-title">
        <h2 id="explode-title">Explode</h2>
        <input id="explode-range" type="range" min={0} max={100} value={Math.round(explode * 100)} aria-valuetext={`${Math.round(explode * 100)}% exploded`}
          onChange={(e) => setExplode(Number(e.target.value) / 100)} style={{ '--fill': `${explode * 100}%` } as React.CSSProperties} />
        <output className="explode__value" htmlFor="explode-range">{Math.round(explode * 100)}%</output>
        <button className="icon-button explode__reset" aria-label="Reset explode" title="Reset explode" onClick={() => setExplode(0)} disabled={explode === 0}>
          <Icon name="reset" />
        </button>
      </section>

      {selected && (
        <DetailCard mode={modeId} selected={selected} isolated={isolated}
          onIsolate={() => setIsolated((i) => !i)} onClear={() => setSelected(null)} />
      )}

      {creditsOpen && (
        <aside className="card credits" aria-label="Sources and credits">
          <button className="icon-button detail__close" onClick={() => setCreditsOpen(false)} aria-label="Close"><Icon name="close" /></button>
          <h2>Sources &amp; credits</h2>
          <p>
            General and oral anatomy models: <a href={BODYPARTS3D.url}>{BODYPARTS3D.name}</a>, {BODYPARTS3D.by},{' '}
            <a href={BODYPARTS3D.license.url}>{BODYPARTS3D.license.name}</a>; extracted from the packaging in{' '}
            <a href={BODYPARTS3D.via.url}>{BODYPARTS3D.via.name}</a>. General anatomy includes every source mesh at full detail.
          </p>
          <p>Histology model: authored for {SITE.name} in Blender. It is schematic; proportions are stylised for teaching.</p>
          <p>Not in the source data: muscles of mastication, maxillary and mandibular nerves, facial nerve and lower cranial nerves, external carotid artery and its branches, parotid gland, lung tissue, third molars, primary teeth.</p>
          <p>For study only. Not for diagnosis or treatment planning. <a href={SITE.repo}>Source code</a> (MIT).</p>
        </aside>
      )}

      <p className="hints" aria-hidden="true">Drag to orbit · Right-drag to pan · Scroll to zoom · Tap to inspect</p>
    </div>
  );
}
