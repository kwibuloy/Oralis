import {
  CRITICAL_PH, ICDAS_NOTE, LESION_MODEL, PERIO_ZONES, LESION_TYPES, lesionType, mineralAt, plaquePH, PROCESS_MINUTES, PROCESS_PARTS, SCENARIOS, SITES, siteById,
  stageCodeLabel, ZONES, zoneOfPart, type CariologyView, type LesionKind, type Scenario,
} from '../content/cariology';
import type { SurfaceStyle } from '../viewer/Viewer';
import { Segmented, Switch } from './controls';
import Icon from './Icon';
import Sheet from './Sheet';

/** Stage shown at a timeline position (0..1): the stages split the loop evenly. */
export const stageAt = (kind: LesionKind, t: number) => {
  const n = lesionType(kind).stages.length;
  return Math.min(n - 1, Math.floor(t * n));
};
/** The middle of a stage on the timeline. */
export const stageTime = (kind: LesionKind, stage: number) => (stage + 0.5) / lesionType(kind).stages.length;

export const VIEW_OPTIONS: [CariologyView, string][] = [['lesion', 'Lesion'], ['sites', 'Sites'], ['process', 'Process']];

/**
 * How each tissue of the lesion molar looks (sizes in millimetres). The tooth itself stays smooth:
 * glossy enamel, with only faint growth lines (striae of Retzius, incremental lines in dentin) on the
 * cut faces; carious dentin and pulp are stained, bone and gingiva textured.
 */
const ENAMEL: SurfaceStyle = { bands: 0.1, bandSpacing: 0.32, roughness: 0.28, clearcoat: 0.55 };
const DENTIN: SurfaceStyle = { bands: 0.08, bandSpacing: 0.45, roughness: 0.55 };
const CHALK: SurfaceStyle = { roughness: 0.78 };
export const TISSUE_LOOK: Record<string, SurfaceStyle> = {
  enamel: ENAMEL,
  'enamel-translucent-zone': { ...ENAMEL, clearcoat: 0.3 },
  'enamel-dark-zone': { ...CHALK, roughness: 0.6 },
  'enamel-lesion-body': CHALK,
  'enamel-surface-zone': { ...CHALK, roughness: 0.62 },
  dentin: DENTIN,
  cementum: { roughness: 0.78 },
  'sclerotic-dentin': { ...DENTIN, roughness: 0.32 },
  'affected-dentin': { ...DENTIN, stain: '#7d5226', stainAmount: 0.4, stainSize: 0.6, roughness: 0.6 },
  'infected-dentin': { stain: '#2f1d0e', stainAmount: 0.5, stainSize: 0.45, roughness: 0.4 },
  'tertiary-dentin': { ...DENTIN, roughness: 0.5 },
  pulp: { grain: 0.25, grainSize: 0.25, bump: 0.3, stain: '#8f2f3c', stainAmount: 0.35, stainSize: 0.45, roughness: 0.7 },
  'alveolar-bone': { grain: 0.35, grainSize: 0.3, bump: 0.6, stain: '#c4a983', stainAmount: 0.4, stainSize: 0.4, roughness: 0.85 },
  gingiva: { grain: 0.15, grainSize: 0.12, bump: 0.25, stain: '#c9727a', stainAmount: 0.2, stainSize: 0.7, roughness: 0.5 },
  pdl: { grain: 0.2, grainSize: 0.05, roughness: 0.6 },
};
const DRAW_ORDER = [
  'enamel-surface-zone', 'enamel-lesion-body', 'enamel-dark-zone', 'enamel-translucent-zone', 'infected-dentin', 'affected-dentin',
  'sclerotic-dentin', 'tertiary-dentin', 'pulp', 'cementum', 'enamel', 'dentin', 'pdl', 'gingiva', 'alveolar-bone',
];
/** Natural colour and texture of a lesion-molar part; fissure lesions are stained brown, as they usually are clinically. */
export function lesionPartLook(key: string) {
  const zone = zoneOfPart(key);
  const fissure = key.startsWith('cl-pit-fissure-') && /^enamel-(surface-zone|lesion-body)$/.test(zone);
  // Pit-and-fissure and smooth-surface sections are drawn schematic: flat zone colours on the cut faces,
  // fading into each other at the boundaries (the model bakes each cut-face vertex's neighbour zone).
  const section = /^cl-(pit-fissure|smooth-surface)-/.test(key) ? { flatCut: true, blendZones: true } : {};
  const look = { ...TISSUE_LOOK[zone], ...section };
  return {
    color: ZONES[zone]?.real ?? '#ddd',
    surface: fissure ? { ...look, stain: '#9b7448', stainAmount: 0.55, stainSize: 0.25 } : look,
    // Where zones overlap a little on a cut face (no hairline gaps), lesion zones draw in front of sound tissue.
    layer: DRAW_ORDER.indexOf(zone) + 1,
  };
}

// ---------- Layers card ----------
export function CariologyPanel({ view, kind, stage, selected, onSelect, scenario, showZones, onShowZones }: {
  view: CariologyView; kind: LesionKind; stage: number; selected: string | null; onSelect: (key: string) => void; scenario: Scenario;
  showZones: boolean; onShowZones: (on: boolean) => void;
}) {
  if (view === 'lesion') {
    const model = LESION_MODEL[kind];
    // One row per zone; a click selects the zone's part in this stage (or the unchanging part outside the
    // lesion, or the bone and gingiva around it).
    const zones = Object.keys(ZONES).filter((z) => model.stages[stage].parts.includes(z) || model.staticParts.includes(z) || PERIO_ZONES.includes(z));
    const keyFor = (z: string) => (PERIO_ZONES.includes(z) ? `${model.perio}-${z}` : model.stages[stage].parts.includes(z) ? `cl-${kind}-${stage}-${z}` : `${model.static}-${z}`);
    return (
      <div className="cariology-panel">
        <p className="cariology-panel__lead">{lesionType(kind).section}</p>
        <div className="layers__row">
          <span>Show zones in colour</span>
          <Switch label="Show zones in colour" checked={showZones} onChange={onShowZones} />
        </div>
        <ul className="zone-list">
          {zones.map((z) => (
            <li key={z}>
              <button className="zone-list__item" aria-pressed={!!selected && zoneOfPart(selected) === z} onClick={() => onSelect(keyFor(z))}>
                <span className="dot" style={{ background: showZones ? ZONES[z].colour : ZONES[z].real }} aria-hidden="true" />{ZONES[z].name}
              </button>
            </li>
          ))}
        </ul>
        <p className="schematic-note">Schematic sizes on a real-size molar. {ICDAS_NOTE}</p>
      </div>
    );
  }
  if (view === 'sites') {
    return (
      <div className="cariology-panel">
        <p className="cariology-panel__lead">Where caries starts, by G.V. Black’s classes. Tap a class to find it on the arch.</p>
        <ul className="zone-list">
          {SITES.map((s) => (
            <li key={s.id}>
              <button className="zone-list__item" aria-pressed={selected === `site-${s.id}`} onClick={() => onSelect(`site-${s.id}`)}>
                <span className="landmarks__n">{s.short}</span>{s.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="cariology-panel">
      <p className="cariology-panel__lead">{SCENARIOS.find(([id]) => id === scenario)![2]}</p>
      <ul className="zone-list">
        {Object.entries(PROCESS_PARTS).filter(([k]) => !/pr-band-[1-4]/.test(k)).map(([k, p]) => (
          <li key={k}>
            <button className="zone-list__item" aria-pressed={selected === k} onClick={() => onSelect(k)}>
              <span className="dot" style={{ background: p.colour }} aria-hidden="true" />{k === 'pr-band-0' ? 'Enamel prisms' : p.name}
            </button>
          </li>
        ))}
      </ul>
      <ul className="legend" aria-label="Enamel colours">
        <li><span className="dot" style={{ background: '#d6dde6' }} />Sound enamel</li>
        <li><span className="dot" style={{ background: '#fdfbf4', boxShadow: 'inset 0 0 0 1px #d1d5db' }} />Mineral lost</li>
      </ul>
      <p className="schematic-note">Magnified about 2,000 times; schematic rates.</p>
    </div>
  );
}

// ---------- Timeline extras ----------
/** The lesion type switch and the current stage with its codes, above the stage timeline. */
export function LesionHead({ kind, onKind, stage, onInfo, showZones, onShowZones }: {
  kind: LesionKind; onKind: (k: LesionKind) => void; stage: number; onInfo: () => void; showZones: boolean; onShowZones: (on: boolean) => void;
}) {
  const st = lesionType(kind).stages[stage];
  return (
    <>
      <Segmented label="Lesion type" value={kind} onChange={onKind} options={LESION_TYPES.map((l) => [l.id, l.label])} />
      <div className="stage-row">
        <button className="stage-caption" onClick={onInfo} aria-label={`${st.name}: read about this stage`}>
          <span className="stage-caption__name">{stage + 1}. {st.name}</span>
          <span className="stage-caption__codes"><span className="code-chip">{st.icdas}</span><span className="code-chip">{stageCodeLabel(st)}</span></span>
          <Icon name="chevron" size={14} />
        </button>
        <button className="zone-toggle" aria-pressed={showZones} onClick={() => onShowZones(!showZones)} title="Show the lesion zones in study colours">Zones</button>
      </div>
    </>
  );
}

/** Minute, pH and enamel mineral above the Process timeline, with the scenario switch. */
export function ProcessHead({ minute, scenario, onScenario }: { minute: number; scenario: Scenario; onScenario: (s: Scenario) => void }) {
  const ph = plaquePH(minute, scenario);
  const below = ph < CRITICAL_PH;
  return (
    <>
      <Segmented label="Sugar intake" value={scenario} onChange={onScenario} options={SCENARIOS.map(([id, label]) => [id, label])} />
      <p className="process-caption" aria-live="polite">
        <span className="process-caption__time">{Math.round(minute)} min</span>
        <span className={`code-chip${below ? ' is-acid' : ''}`}>pH {ph.toFixed(1)}</span>
        <span>{below ? 'Below 5.5: enamel dissolves' : 'Above 5.5: mineral returns'}</span>
        <span className="process-caption__mineral">Mineral {Math.round(mineralAt(minute, scenario) * 100)}%</span>
      </p>
    </>
  );
}

/** The plaque pH curve drawn behind the Process timeline, with the critical pH line. */
export function PhTrack({ scenario }: { scenario: Scenario }) {
  const W = 200, H = 40, lo = 4.5, hi = 7.2;
  const y = (ph: number) => ((hi - ph) / (hi - lo)) * H;
  const pts = Array.from({ length: 121 }, (_, i) => `${(i / 120) * W},${y(plaquePH((i / 120) * PROCESS_MINUTES, scenario)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <rect x="0" y={y(CRITICAL_PH)} width={W} height={H - y(CRITICAL_PH)} className="ph-track__acid" />
      <line x1="0" x2={W} y1={y(CRITICAL_PH)} y2={y(CRITICAL_PH)} className="ph-track__critical" />
      <polyline points={pts} className="ph-track__curve" />
    </svg>
  );
}

// ---------- Cards ----------
export function StageCard({ kind, stage, onClose }: { kind: LesionKind; stage: number; onClose: () => void }) {
  const L = lesionType(kind), st = L.stages[stage];
  return (
    <Sheet labelledBy="stage-title">
      <button className="icon-button detail__close" onClick={onClose} aria-label="Close stage"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: '#7a4b2a' }} aria-hidden="true" />
      <p className="detail__group">{L.label} lesion · stage {stage + 1} of {L.stages.length}</p>
      <h2 id="stage-title">{st.name}</h2>
      <div className="detail__scroll">
        <div className="detail__codes"><span className="code-chip">{st.icdas}</span><span className="code-chip">{stageCodeLabel(st)}</span></div>
        <p className="detail__lead">{st.summary}</p>
        <dl>
          <div className="field"><dt>Management</dt><dd>{st.management}</dd></div>
          <div className="field"><dt>This lesion type</dt><dd>{L.summary}</dd></div>
        </dl>
        <p className="schematic-note">{ICDAS_NOTE}</p>
      </div>
    </Sheet>
  );
}

export function ZoneCard({ part, kind, stage, onClose }: { part: string; kind: LesionKind; stage: number; onClose: () => void }) {
  const z = ZONES[zoneOfPart(part)];
  const st = lesionType(kind).stages[stage];
  return (
    <Sheet labelledBy="zone-title">
      <button className="icon-button detail__close" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: z?.colour ?? '#ccc' }} aria-hidden="true" />
      <p className="detail__group">{lesionType(kind).label} lesion · {st.name}</p>
      <h2 id="zone-title">{z?.name ?? part}</h2>
      <div className="detail__scroll">
        <p className="detail__lead">{z?.note}</p>
      </div>
      <div className="detail__meta">
        <div><small>Stage</small>{stage + 1}. {st.name}</div>
        <div><small>Codes</small>{st.icdas} · {stageCodeLabel(st)}</div>
      </div>
    </Sheet>
  );
}

export function SiteCard({ part, onClose }: { part: string; onClose: () => void }) {
  const s = siteById(part.replace(/^site-/, '')) ?? siteById('secondary')!;
  const restoration = part === 'site-restoration';
  return (
    <Sheet labelledBy="site-title">
      <button className="icon-button detail__close" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: restoration ? '#9aa1a9' : '#8a5a2b' }} aria-hidden="true" />
      <p className="detail__group">{restoration ? 'Restoration' : 'Caries site'}</p>
      <h2 id="site-title">{restoration ? 'Occlusal restoration' : s.label}</h2>
      <div className="detail__scroll">
        <p className="detail__lead">{restoration ? 'An existing occlusal restoration. Secondary caries starts at its margin.' : s.where}</p>
        <dl>
          <div className="field"><dt>Why here</dt><dd>{s.note}</dd></div>
          <div className="field"><dt>Management</dt><dd>{s.management}</dd></div>
        </dl>
        <p className="schematic-note">Lesions are painted on the scanned teeth to show where; their shapes are schematic.</p>
      </div>
    </Sheet>
  );
}

export function ProcessCard({ part, onClose }: { part: string; onClose: () => void }) {
  const p = PROCESS_PARTS[part];
  return (
    <Sheet labelledBy="process-title">
      <button className="icon-button detail__close" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: p?.colour ?? '#ccc' }} aria-hidden="true" />
      <p className="detail__group">The caries process</p>
      <h2 id="process-title">{p?.name ?? part}</h2>
      <div className="detail__scroll">
        <p className="detail__lead">{p?.note}</p>
        <p className="schematic-note">Below about pH {CRITICAL_PH} the plaque fluid is undersaturated with hydroxyapatite and enamel dissolves; above it, mineral can redeposit.</p>
      </div>
    </Sheet>
  );
}
