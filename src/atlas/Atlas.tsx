import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { baseName, GROUP_SYSTEM, GROUPS, SYSTEMS, type SystemId } from '../content/anatomy';
import { bloodColour, brainArea, flowFunction, FUNCTION_CONTEXT, FUNCTION_LAYERS, type FunctionId } from '../content/function';
import { TISSUES } from '../content/histology';
import { modeById, type ModeId } from '../content/modes';
import { BODYPARTS3D, SITE } from '../content/site';
import { GROUP_COLOR, GROUP_ORDER, MESH_TO_KEY, structureByKey, structuresIn } from '../content/structures';
import { SYSTEM_LABEL, type NumberingSystem } from '../content/teeth';
import { replaceSelection } from '../lib/route';
import { Viewer, type Pickable, type View } from '../viewer/Viewer';
import { Segmented, Switch } from './controls';
import { archOf, labelFor } from './describe';
import DetailCard from './DetailCard';
import FunctionCard from './FunctionCard';
import { LandmarkCard, ToothCard } from './CarvingCards';
import { CARVING_TOOTH, KIND_LABEL, LANDMARKS, landmarkById, MEASUREMENTS, type LandmarkKind } from '../content/carving';
import {
  bandColour, biofilmColour, LESION_MODEL, lesionType, PERIO_ZONES, perioGroup, mineralAt, plaquePH, PROCESS_MINUTES, PROCESS_PARTS, SITE_COLOUR, SITE_PINS, SITES, staticGroup,
  stageGroup, ZONES, zoneOfPart, type CariologyView, type LesionKind, type Scenario,
} from '../content/cariology';
import { CariologyPanel, lesionPartLook, LesionHead, PhTrack, ProcessCard, ProcessHead, SiteCard, StageCard, stageAt, stageTime, VIEW_OPTIONS, ZoneCard } from './Cariology';
import LoadingBar, { type LoadProgress } from './LoadingBar';
import { SheetInset, type SheetCover } from './Sheet';
import Icon from './Icon';
import SubjectPicker from './SubjectPicker';
import Search, { type SearchItem } from './Search';
import Timeline from './Timeline';
import './atlas.css';

type ArchFilter = 'both' | 'upper' | 'lower';
const BITE_OPEN = { x: 0, y: -1.6, z: 0.3 };
const REDUCED_MOTION = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * Carving tooth surfaces. The tooth is a left mandibular molar built with buccal +z, occlusal +y and
 * mesial −x (scripts/build-carving-tooth.mjs), so each surface is viewed from that direction.
 */
const CARVING_VIEWS: [string, string, string, { x: number; y: number; z: number }][] = [
  ['occlusal', 'O', 'Occlusal', { x: 0, y: 1, z: 0.001 }],
  ['buccal', 'B', 'Buccal', { x: 0, y: 0.05, z: 1 }],
  ['lingual', 'L', 'Lingual', { x: 0, y: 0.05, z: -1 }],
  ['mesial', 'M', 'Mesial', { x: -1, y: 0.05, z: 0 }],
  ['distal', 'D', 'Distal', { x: 1, y: 0.05, z: 0 }],
];
const CARVING_START = { x: -0.5, y: 0.45, z: 1 }; // three-quarter view from mesiobuccal
const CARVING_COLOUR: Record<string, string> = { 'carving-crown': '#f2ece0', 'carving-root': '#e2cc9f' };
const VIEWS: [View, string, string][] = [['front', 'F', 'Front'], ['side', 'S', 'Side'], ['back', 'B', 'Back'], ['top', 'T', 'Top']];
const STAGE_LABEL: Record<ModeId, string> = {
  general: 'Whole body · adult male',
  physiology: 'Function · schematic flow',
  dental: 'Permanent dentition',
  histology: 'Longitudinal section · schematic',
  cariology: 'Left mandibular first molar · sectioned',
};
const CARIOLOGY_STAGE: Record<CariologyView, string> = { lesion: 'Left mandibular first molar · sectioned', sites: 'Permanent dentition · caries sites', process: 'Enamel and biofilm · magnified' };
/** Seconds per lesion stage, and for the Process view's two hours, at 1×; the viewer's clock loops every 3 s. */
const STAGE_SECONDS = 2.5;
const PROCESS_SECONDS = 24;
const PROCESS_VIEW = { x: 0.55, y: 0.75, z: 1 };

/** What a node of the Cariology model is: an authored lesion-molar, site or process part, or null. */
function cariologyPart(node: string): Pickable | null {
  if (node.startsWith('cl-')) {
    const zone = zoneOfPart(node);
    return { key: node, group: node.slice(0, node.length - zone.length - 1), ...lesionPartLook(node) };
  }
  if (node.startsWith('site-')) return { key: node, group: 'sites', color: node === 'site-restoration' ? SITE_COLOUR.restoration : SITE_COLOUR.site, surface: { roughness: node === 'site-restoration' ? 0.35 : 0.7 } };
  if (node.startsWith('pr-')) {
    const group = node.startsWith('pr-band') ? 'pr-enamel' : node === 'pr-biofilm-matrix' ? 'pr-biofilm' : node === 'pr-pellicle' ? 'pr-pellicle' : 'pr-bacteria';
    return { key: node, group, color: PROCESS_PARTS[node]?.colour ?? '#ddd' };
  }
  return null;
}

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
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [visible, setVisible] = useState<string[]>(mode.defaultVisible);
  const [isolated, setIsolated] = useState(false);
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [view, setView] = useState<string | null>('front');
  const [system, setSystem] = useState<NumberingSystem>('fdi');
  const [arch, setArch] = useState<ArchFilter>('both');
  const [biteOpen, setBiteOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  // Physiology (function-only subject): which functions are on, whose description is open, playback.
  const [functions, setFunctions] = useState<FunctionId[]>(['blood']);
  const [openFunction, setOpenFunction] = useState<FunctionId | null>(null);
  const [playing, setPlaying] = useState(!!mode.functionView && !REDUCED_MOTION);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const inFunction = !!mode.functionView;
  // Oral anatomy: skull & arches or the carving tooth, and which landmark is open.
  const [toothView, setToothView] = useState<'arches' | 'carving'>('arches');
  const [landmark, setLandmark] = useState<string | null>(null);
  const carving = modeId === 'dental' && toothView === 'carving';
  // Cariology: which view, which lesion type and sugar scenario, and whether the stage card is open.
  const cario = modeId === 'cariology';
  const [cariView, setCariView] = useState<CariologyView>('lesion');
  const [lesionKind, setLesionKind] = useState<LesionKind>('pit-fissure');
  const [scenario, setScenario] = useState<Scenario>('single');
  const [stageOpen, setStageOpen] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const stage = cario ? stageAt(lesionKind, time) : 0;
  const minute = time * PROCESS_MINUTES;
  const cariTimeline = cario && cariView !== 'sites';

  const layers = useMemo(() => layersFor(modeId, modelName, !!mode.systems), [modeId, modelName, mode.systems]);
  // In the Function view the skeleton stays faded behind the systems for orientation.
  const context = (inFunction ? FUNCTION_CONTEXT : carving ? [] : mode.context ?? []).filter((g) => !visible.includes(g));
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
    v.onTime = setTime;
    v.onPinPick = (id) => {
      // Cariology pins sit on parts (lesion zones, caries sites): picking one selects that part.
      if (modeId === 'cariology') { setSelected(id); return; }
      setSelected(null); setLandmark(id);
    };
    let cancelled = false;
    v.loadGLB(mode.model, (node) => {
      if (modeId === 'histology') {
        const t = TISSUES.find((x) => x.key === node);
        return t ? { key: t.key, group: t.key, color: t.color } : null;
      }
      if (node in CARVING_COLOUR) return { key: node, group: 'carving', color: CARVING_COLOUR[node] };
      if (modeId === 'cariology') { const part = cariologyPart(node); if (part) return part; }
      const key = MESH_TO_KEY.get(node);
      const s = key ? structureByKey(key) : undefined;
      return s ? { key: s.key, group: s.group, color: GROUP_COLOR[s.group] ?? '#ddd' } : null;
    }, (loaded, total) => !cancelled && setProgress({ loaded, total }))
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setError('The 3D model could not be loaded. Check your connection and reload.'));
    return () => { cancelled = true; v.dispose(); viewer.current = null; };
  }, [mode.model, modeId]);

  // Keep framed parts clear of the detail card: above the phone bottom sheet, or between the layers
  // card and the detail card on wider screens.
  // On phones a bar along the bottom (Cariology's timeline) also covers the canvas when no card is open.
  const root = useRef<HTMLDivElement>(null);
  const sheetCover = useRef<SheetCover>({ right: 0, bottom: 0 });
  const applyInsets = useCallback(() => {
    const cover = sheetCover.current;
    const layers = document.querySelector<HTMLElement>('.atlas .layers');
    const left = cover.right && layers && layers.offsetParent ? layers.getBoundingClientRect().right : 0;
    const bar = root.current?.querySelector<HTMLElement>('.timeline--rich');
    const phone = matchMedia('(max-width: 860px)').matches;
    const barCover = bar && phone ? root.current!.clientHeight - bar.offsetTop : 0;
    viewer.current?.setInsets({ left, right: cover.right, bottom: Math.max(cover.bottom, barCover) });
  }, []);
  const setSheetInset = useCallback((cover: SheetCover) => { sheetCover.current = cover; applyInsets(); }, [applyInsets]);
  // Track the rich timeline's height: the phone sheet and the view switch sit above it.
  useEffect(() => {
    const bar = root.current?.querySelector<HTMLElement>('.timeline--rich');
    if (!bar) { root.current?.style.removeProperty('--timeline-h'); applyInsets(); return; }
    const ro = new ResizeObserver(() => { root.current?.style.setProperty('--timeline-h', `${bar.offsetHeight}px`); applyInsets(); });
    ro.observe(bar);
    return () => ro.disconnect();
  }, [cariTimeline, cariView, ready, applyInsets]);

  // Push React state into the viewer. Cariology's views decide their own groups: one lesion stage and
  // the unchanging rest of its section; the arches with the sites (gingiva faded, so root caries
  // shows, and the jaws left out so the teeth fill the screen); or the process block with the
  // biofilm faded so the bacteria inside show.
  const shown = !cario ? { visible, context } : cariView === 'lesion'
    ? { visible: [staticGroup(lesionKind), stageGroup(lesionKind, stage), perioGroup(lesionKind)], context: [] }
    : cariView === 'sites' ? { visible: ['teeth', 'sites'], context: ['gingiva'] }
      : { visible: ['pr-enamel', 'pr-pellicle', 'pr-bacteria'], context: ['pr-biofilm'] };
  useEffect(() => { viewer.current?.setVisibleGroups(shown.visible, shown.context); }, [shown.visible.join(), shown.context.join(), ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // Presets can change the extent a lot (whole body → head), so they refit; single toggles don't.
  const [presetTick, setPresetTick] = useState(0);
  useEffect(() => { if (presetTick) viewer.current?.fit(); }, [presetTick]);
  useEffect(() => { viewer.current?.setFilter(arch === 'both' ? () => true : (key) => archOf(key) === arch); }, [arch, ready]);
  // Cariology's Sites view opens the bite, so the occlusal lesions (Class I, secondary caries) can be seen.
  const openBite = biteOpen || (cario && cariView === 'sites');
  useEffect(() => { viewer.current?.setOffset((key) => archOf(key) === 'lower', openBite ? BITE_OPEN : { x: 0, y: 0, z: 0 }); }, [openBite, ready]);
  useEffect(() => { viewer.current?.setExplode(explode); }, [explode, ready]);
  useEffect(() => { viewer.current?.setAutoRotate(autoRotate); }, [autoRotate, ready]);
  useEffect(() => { viewer.current?.setIsolated(isolated); }, [isolated, ready]);
  // A selection carried over to the next lesion stage keeps the camera where it is.
  const quietSelect = useRef(false);
  useEffect(() => {
    if (!ready) return;
    viewer.current?.select(selected, { frame: !quietSelect.current });
    quietSelect.current = false;
    if (selected) setOpenFunction(null);
    replaceSelection(modeId, selected ?? undefined);
    if (!selected) setIsolated(false);
  }, [selected, ready, modeId]);

  // Function view: flow pulses, oxygenation and brain-area colours, muscle pull, playback.
  const meta = useMemo(() => new Map(structuresIn(modelName).map((s) => [s.key, { group: s.group, name: baseName(s.sourceName), sided: s.sourceName }])), [modelName]);
  useEffect(() => {
    if (!ready) return;
    const keys = inFunction ? [...meta].filter(([, m]) => functions.includes(flowFunction(m.group, m.name) as FunctionId)).map(([k]) => k) : [];
    viewer.current?.setFlowKeys(new Set(keys));
    let colours: Map<string, string> | null = null;
    if (inFunction) {
      colours = new Map();
      for (const [k, m] of meta) {
        const c = (functions.includes('blood') && bloodColour(m.group, m.name)) || (functions.includes('brain') && m.group === 'brain' && brainArea(m.name, m.sided)?.colour);
        if (c) colours.set(k, c);
      }
    }
    viewer.current?.setColourOverrides(colours);
  }, [inFunction, functions.join(), ready, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const pullKey = inFunction && functions.includes('muscles') && selected && GROUP_SYSTEM[meta.get(selected)?.group ?? ''] === 'muscles' ? selected : null;
  useEffect(() => { if (ready) viewer.current?.setPullArrows(pullKey); }, [pullKey, ready]);
  // Playback starts only once the model is in (the timeline would otherwise run over an empty stage).
  useEffect(() => { viewer.current?.setPlaying(ready && playing && (inFunction || cariTimeline)); }, [playing, inFunction, cariTimeline, ready]);
  // Cariology plays slower than the 3 s flow loop: a few seconds per lesion stage, or two hours in 24 s.
  const loopScale = !cario ? 1 : cariView === 'process' ? 3 / PROCESS_SECONDS : 3 / (lesionType(lesionKind).stages.length * STAGE_SECONDS);
  useEffect(() => { viewer.current?.setSpeed(speed * loopScale); }, [speed, loopScale, ready]);
  const scrub = (t: number) => { setTime(t); viewer.current?.setTime(t); };
  const groupsFor = (ids: FunctionId[]) => [...new Set(ids.flatMap((id) => FUNCTION_LAYERS.find((f) => f.id === id)!.groups))];
  const toggleFunction = (id: FunctionId, on: boolean) => {
    const next = on ? [...functions, id] : functions.filter((f) => f !== id);
    setFunctions(next);
    // Turning a function on shows what it does.
    if (on) { setSelected(null); setOpenFunction(id); }
    setVisible(groupsFor(next));
    setPresetTick((t) => t + 1);
  };

  // Pins: carving landmarks on the crown (in the tooth's own millimetres); in Cariology the zones of the
  // shown lesion stage (on the cut face) or the caries sites (on the teeth). The open one is highlighted.
  useEffect(() => {
    if (!ready) return;
    if (carving) viewer.current?.setPins('carving-crown', LANDMARKS.map((l) => ({ id: l.id, label: String(l.n), title: l.name, position: l.position, normal: l.normal })));
    else if (cario && cariView === 'lesion') {
      viewer.current?.setPins(null, LESION_MODEL[lesionKind].stages[stage].pins.map((p, i) => {
        const key = `${stageGroup(lesionKind, stage)}-${p.region}`;
        return { id: key, key, label: String(i + 1), title: ZONES[p.region]?.name ?? p.region, position: p.position, normal: p.normal };
      }));
    } else if (cario && cariView === 'sites') {
      viewer.current?.setPins(null, SITE_PINS.map((p) => ({ id: p.key, key: p.key, label: SITES.find((s) => s.id === p.id)?.short ?? '?', title: SITES.find((s) => s.id === p.id)?.label ?? p.id, position: p.position, normal: p.normal })));
    } else viewer.current?.setPins(null, []);
  }, [carving, cario, cariView, lesionKind, stage, ready]);
  useEffect(() => { viewer.current?.setActivePin(cario ? selected : landmark); }, [landmark, selected, cario, carving, cariView, stage, ready]);

  // Cariology: keep a selected lesion zone selected as the stage changes (if the zone is still there).
  useEffect(() => {
    if (!cario || !selected?.startsWith(`cl-${lesionKind}-`) || selected.includes('-static-')) return;
    const zone = zoneOfPart(selected);
    const next = LESION_MODEL[lesionKind].stages[stage].parts.includes(zone) ? `${stageGroup(lesionKind, stage)}-${zone}` : null;
    if (next !== selected) { quietSelect.current = true; setSelected(next); }
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  // Process view: enamel loses mineral (chalky) below the critical pH and regains it above; the biofilm turns acid.
  useEffect(() => {
    if (!ready || !cario) return;
    if (cariView === 'lesion') {
      // Show zones: the study colours instead of the natural ones.
      const keys = [...LESION_MODEL[lesionKind].staticParts.map((z) => `${staticGroup(lesionKind)}-${z}`), ...LESION_MODEL[lesionKind].stages[stage].parts.map((z) => `${stageGroup(lesionKind, stage)}-${z}`), ...PERIO_ZONES.map((z) => `${perioGroup(lesionKind)}-${z}`)];
      viewer.current?.setColourOverrides(showZones ? new Map(keys.map((k) => [k, ZONES[zoneOfPart(k)]?.colour ?? '#ddd'])) : null);
      return;
    }
    if (cariView !== 'process') { viewer.current?.setColourOverrides(null); return; }
    const m = mineralAt(minute, scenario);
    const colours = new Map<string, string>([0, 1, 2, 3, 4].map((b) => [`pr-band-${b}`, bandColour(b, m)]));
    colours.set('pr-biofilm-matrix', biofilmColour(plaquePH(minute, scenario)));
    viewer.current?.setColourOverrides(colours);
  }, [cario, cariView, minute, scenario, ready, showZones, lesionKind, stage]);
  const cariViewDir = (v: CariologyView, kind: LesionKind) => {
    const d = LESION_MODEL[kind].view;
    return v === 'lesion' ? { x: d[0], y: d[1], z: d[2] } : v === 'process' ? PROCESS_VIEW : 'front';
  };
  // Frame the opening view once the model is in.
  useEffect(() => { if (ready && cario) viewer.current?.setView(cariViewDir(cariView, lesionKind)); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const switchCariView = (next: CariologyView, kind = lesionKind) => {
    setCariView(next); setLesionKind(kind);
    setSelected(null); setStageOpen(false); setPlaying(false); scrub(0);
    setView(next === 'sites' ? 'front' : null);
    requestAnimationFrame(() => viewer.current?.setView(cariViewDir(next, kind)));
  };
  useEffect(() => { if (selected) setLandmark(null); }, [selected]);
  const switchToothView = (next: 'arches' | 'carving') => {
    setToothView(next);
    setSelected(null); setLandmark(null); setExplode(0); setIsolated(false); setArch('both'); setBiteOpen(false);
    setVisible(next === 'carving' ? ['carving'] : mode.defaultVisible);
    setView(next === 'carving' ? null : 'front');
    // After the visibility change has reached the viewer, frame the new view.
    requestAnimationFrame(() => viewer.current?.setView(next === 'carving' ? CARVING_START : 'front'));
  };

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
    if (carving) return LANDMARKS.map((l) => ({ key: `landmark:${l.id}`, label: `${l.n}. ${l.name}`, group: KIND_LABEL[l.kind], color: '#2563eb' }));
    if (cario) return [
      ...SITES.map((s) => ({ key: `site-${s.id}`, label: s.label, group: 'Caries sites', color: SITE_COLOUR.site })),
      ...Object.entries(PROCESS_PARTS).filter(([k]) => !/pr-band-[1-4]/.test(k)).map(([k, p]) => ({ key: k, label: k === 'pr-band-0' ? 'Enamel prisms' : p.name, group: 'Caries process', color: p.colour })),
    ];
    if (modeId === 'histology') return TISSUES.map((t) => ({ key: t.key, label: t.name, group: 'Tissue', color: t.color }));
    return structuresIn(modelName).map((s) => ({ key: s.key, label: labelFor(modeId, s.key, system), group: GROUPS[s.group].label, color: GROUP_COLOR[s.group] }));
  }, [modeId, modelName, system, carving, cario]);
  const onSearch = (key: string) => {
    if (cario) {
      const view: CariologyView = key.startsWith('site-') ? 'sites' : 'process';
      if (view !== cariView) switchCariView(view);
      setSelected(key);
      return;
    }
    if (key.startsWith('landmark:')) { setSelected(null); setLandmark(key.slice(9)); } else setSelected(key);
  };

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
  const goSurface = (id: string, dir: { x: number; y: number; z: number }) => { setView(id); viewer.current?.setView(dir); };
  const resetAll = () => {
    if (cario) { switchCariView(cariView); setAutoRotate(false); return; }
    setSelected(null); setLandmark(null); setExplode(0); setIsolated(false); setBiteOpen(false); setArch('both');
    setVisible(inFunction ? groupsFor(functions) : carving ? ['carving'] : mode.defaultVisible); setAutoRotate(false);
    setView(carving ? null : 'front');
    requestAnimationFrame(() => viewer.current?.setView(carving ? CARVING_START : 'front'));
  };
  const stageLabel = cario ? CARIOLOGY_STAGE[cariView] : carving ? `${CARVING_TOOTH.name} · idealised (Wheeler)` : inFunction ? 'Function · schematic flow' : explode > 0.5 ? 'Anatomical inventory' : explode > 0 ? 'Separated structures' : STAGE_LABEL[modeId];

  return (
    <div ref={root} className={`atlas${cariTimeline ? ' has-rich-timeline' : ''}`} data-mode={modeId}>
      <div className="atlas__stage">
        <span className="floor" aria-hidden="true" />
        <canvas ref={canvas} aria-label={`${mode.name} 3D model`} role="img" />
        <p className="floor__label" aria-hidden="true">{stageLabel}</p>
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
        <Search items={searchItems} onSelect={onSearch} />
        <button className="card icon-button" aria-label="Sources and credits" aria-expanded={creditsOpen} onClick={() => setCreditsOpen((o) => !o)}>
          <Icon name="info" />
        </button>
      </div>

      <button className="card layers-toggle" aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
        <Icon name="layers" /> {inFunction ? 'Functions' : cario ? 'Parts' : 'Layers'}
      </button>
      <section className={`card layers${layersOpen ? ' is-open' : ''}`} aria-labelledby="layers-title">
        <div className="layers__head">
          <h2 id="layers-title">{cario ? VIEW_OPTIONS.find(([v]) => v === cariView)![1] : carving ? 'Landmarks' : inFunction ? 'Functions' : modeId === 'histology' ? 'Tissues' : 'Layers'}</h2>
          {!cario && <span className="count">{carving ? LANDMARKS.length : inFunction ? FUNCTION_LAYERS.length : layers.length}</span>}
        </div>
        {cario && (
          <>
            <div className="view-switch view-switch--card">
              <Segmented label="Cariology view" value={cariView} onChange={(v) => switchCariView(v)} options={VIEW_OPTIONS} />
            </div>
            <CariologyPanel view={cariView} kind={lesionKind} stage={stage} selected={selected} scenario={scenario} showZones={showZones} onShowZones={setShowZones}
              onSelect={(key) => { setStageOpen(false); setSelected(key); setLayersOpen(false); }} />
          </>
        )}
        {modeId === 'dental' && (
          <div className="view-switch view-switch--card">
            <Segmented label="Oral anatomy view" value={toothView} onChange={switchToothView} options={[['arches', 'Skull & arches'], ['carving', 'Carving tooth']]} />
          </div>
        )}
        {cario ? null : carving ? (
          <div className="landmarks">
            {(Object.keys(KIND_LABEL) as LandmarkKind[]).map((kind) => (
              <section key={kind}>
                <p className="layers__caption">{KIND_LABEL[kind]}</p>
                <ul>
                  {LANDMARKS.filter((l) => l.kind === kind).map((l) => (
                    <li key={l.id}>
                      <button className="landmarks__item" aria-pressed={landmark === l.id} onClick={() => { setSelected(null); setLandmark(l.id); }}>
                        <span className="landmarks__n">{l.n}</span>{l.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section>
              <p className="layers__caption">Wheeler’s measurements (mm)</p>
              <dl className="measurements">
                {MEASUREMENTS.map(([label, mm]) => <div key={label}><dt>{label}</dt><dd>{mm.toFixed(1)}</dd></div>)}
              </dl>
            </section>
          </div>
        ) : inFunction ? (
          <>
            <ul className="function-list">
              {FUNCTION_LAYERS.map((f) => (
                <li key={f.id}>
                  <button className="function-list__label" aria-expanded={openFunction === f.id} onClick={() => { setSelected(null); setOpenFunction(f.id); }}>
                    {f.label}<Icon name="chevron" size={14} />
                  </button>
                  <Switch label={`Show ${f.label}`} checked={functions.includes(f.id)} onChange={(on) => toggleFunction(f.id, on)} />
                </li>
              ))}
            </ul>
            <p className="schematic-note">Tap a name to read how it works.</p>
          </>
        ) : mode.systems ? (
          <div className="systems" role="group" aria-label="Body systems">
            {SYSTEMS.map((s) => (
              <button key={s.id} className="systems__chip" aria-pressed={systemOn(s.id)} onClick={() => toggleSystem(s.id)}>{s.label}</button>
            ))}
          </div>
        ) : (
          <Segmented label="Layer preset" value={activePreset} options={mode.presets.map((p) => [p.label, p.label])}
            onChange={(label) => { setVisible(mode.presets.find((p) => p.label === label)!.groups); setPresetTick((t) => t + 1); }} />
        )}
        {!inFunction && !carving && !cario && <ul className="layers__list">
          {layers.map((l) => (
            <li key={l.id}>
              <span className="dot" style={{ background: l.color }} aria-hidden="true" />
              <span className="layers__label">{l.label}</span>
              {modeId !== 'histology' && <span className="layers__count">{l.count}</span>}
              <Switch label={`Show ${l.label}`} checked={visible.includes(l.id)} onChange={(on) => toggle(l.id, on)} />
            </li>
          ))}
        </ul>}
        {modeId === 'dental' && !carving && (
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
        {!inFunction && !carving && !cario && <div className="layers__foot">
          <span>{piecesVisible} {modeId === 'histology' ? 'tissues' : 'pieces'} visible</span>
          <button className="text-button" onClick={() => setVisible(piecesVisible ? [] : layers.map((l) => l.id))}>
            {piecesVisible ? 'Hide all' : 'Show all'}
          </button>
        </div>}
      </section>

      <div className="card toolbar" role="toolbar" aria-label="View">
        <button className="icon-button" aria-pressed={autoRotate} aria-label="Auto-rotate" onClick={() => setAutoRotate((a) => !a)}>
          <Icon name="rotate" />
        </button>
        <span className="toolbar__sep" />
        {carving
          ? CARVING_VIEWS.map(([id, letter, name, dir]) => (
            <button key={id} className="toolbar__view" aria-pressed={view === id} aria-label={`${name} surface`} title={`${name} surface`} onClick={() => goSurface(id, dir)}>
              {letter}
            </button>
          ))
          : VIEWS.map(([v, letter, name]) => (
            <button key={v} className="toolbar__view" aria-pressed={view === v} aria-label={`${name} view`} title={`${name} view`} onClick={() => goView(v)}>
              {letter}
            </button>
          ))}
        <span className="toolbar__sep" />
        <button className="icon-button" aria-label="Reset everything" title="Reset" onClick={resetAll}><Icon name="reset" /></button>
      </div>

      {modeId === 'dental' && (
        // Phones and tablets: the view switch stays visible instead of hiding in the Layers drawer.
        <div className={`card view-switch view-switch--float${carving ? ' is-low' : ''}`}>
          <Segmented label="Oral anatomy view" value={toothView} onChange={switchToothView} options={[['arches', 'Skull & arches'], ['carving', 'Carving tooth']]} />
        </div>
      )}
      {cario && (
        // Phones and tablets: the view switch stays visible instead of hiding in the Parts drawer.
        <div className={`card view-switch view-switch--float${cariTimeline ? ' is-high' : ' is-low'}`}>
          <Segmented label="Cariology view" value={cariView} onChange={(v) => switchCariView(v)} options={VIEW_OPTIONS} />
        </div>
      )}
      {cario ? (cariView === 'lesion' ? (
        <Timeline label="Lesion stage" playing={ready && playing} onPlaying={setPlaying} time={time} onScrub={scrub} speed={speed} onSpeed={setSpeed}
          valueText={`Stage ${stage + 1}: ${lesionType(lesionKind).stages[stage].name}`}
          marks={lesionType(lesionKind).stages.slice(1).map((_, i) => (i + 1) / lesionType(lesionKind).stages.length)}>
          <LesionHead kind={lesionKind} stage={stage} onInfo={() => { setSelected(null); setStageOpen(true); }} showZones={showZones} onShowZones={setShowZones}
            onKind={(k) => { switchCariView('lesion', k); scrub(stageTime(k, 0)); }} />
        </Timeline>
      ) : cariView === 'process' ? (
        <Timeline label="Caries process" playing={ready && playing} onPlaying={setPlaying} time={time} onScrub={scrub} speed={speed} onSpeed={setSpeed}
          valueText={`${Math.round(minute)} minutes, pH ${plaquePH(minute, scenario).toFixed(1)}`} track={<PhTrack scenario={scenario} />}>
          <ProcessHead minute={minute} scenario={scenario} onScenario={setScenario} />
        </Timeline>
      ) : null) : carving ? null : inFunction ? (
        <Timeline label="Function" playing={ready && playing} onPlaying={setPlaying} time={time} onScrub={scrub} speed={speed} onSpeed={setSpeed} />
      ) : (
      <section className="card explode" aria-labelledby="explode-title">
        <h2 id="explode-title">Explode</h2>
        <input id="explode-range" type="range" min={0} max={100} value={Math.round(explode * 100)} aria-valuetext={`${Math.round(explode * 100)}% exploded`}
          onChange={(e) => setExplode(Number(e.target.value) / 100)} style={{ '--fill': `${explode * 100}%` } as React.CSSProperties} />
        <output className="explode__value" htmlFor="explode-range">{Math.round(explode * 100)}%</output>
        <button className="icon-button explode__reset" aria-label="Reset explode" title="Reset explode" onClick={() => setExplode(0)} disabled={explode === 0}>
          <Icon name="reset" />
        </button>
      </section>
      )}

      <SheetInset.Provider value={setSheetInset}>
      {inFunction && openFunction && !selected && (
        <FunctionCard fn={FUNCTION_LAYERS.find((f) => f.id === openFunction)!} onClose={() => setOpenFunction(null)} />
      )}
      {carving && landmark && !selected && landmarkById(landmark) && (
        <LandmarkCard landmark={landmarkById(landmark)!} onClose={() => setLandmark(null)} />
      )}
      {selected && selected in CARVING_COLOUR && <ToothCard part={selected} onClose={() => setSelected(null)} />}
      {cario && stageOpen && !selected && cariView === 'lesion' && <StageCard kind={lesionKind} stage={stage} onClose={() => setStageOpen(false)} />}
      {cario && selected?.startsWith('cl-') && <ZoneCard part={selected} kind={lesionKind} stage={stage} onClose={() => setSelected(null)} />}
      {cario && selected?.startsWith('site-') && <SiteCard part={selected} onClose={() => setSelected(null)} />}
      {cario && selected?.startsWith('pr-') && <ProcessCard part={selected} onClose={() => setSelected(null)} />}
      {selected && !(selected in CARVING_COLOUR) && !(cario && /^(cl|site|pr)-/.test(selected)) && (
        <DetailCard mode={modeId} selected={selected} isolated={isolated}
          onIsolate={() => setIsolated((i) => !i)} onClear={() => setSelected(null)} />
      )}
      </SheetInset.Provider>

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
          <p>Cariology: the lesion molar and the enamel and biofilm block are authored for {SITE.name} in code; lesion sizes are schematic, and the sites on the scanned teeth are painted to show where.</p>
          <p>Not in the source data: muscles of mastication, maxillary and mandibular nerves, facial nerve and lower cranial nerves, external carotid artery and its branches, parotid gland, lung tissue, third molars, primary teeth.</p>
          <p>For study only. Not for diagnosis or treatment planning. <a href={SITE.repo}>Source code</a> (MIT).</p>
        </aside>
      )}

      {/* Outside the stage so it sits above the floating cards and view rail. */}
      {!ready && !error && <LoadingBar name={mode.name} model={mode.model} progress={progress} />}
      <p className="hints" aria-hidden="true">Drag to orbit · Right-drag to pan · Scroll to zoom · Tap to inspect</p>
    </div>
  );
}
