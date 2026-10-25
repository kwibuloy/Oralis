import { gsap } from 'gsap';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { nodeKey, PEDIGREES, type GeneticsPath as Path, type GeneticsView, type Pattern } from '../content/genetics';
import type { SurfaceStyle, Viewer } from '../viewer/Viewer';
import { Segmented } from './controls';

const REDUCED_MOTION = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Finger travel for one step: most of a phone's width, capped on wide screens. */
const pxPerStep = () => Math.min(window.innerWidth * 0.75, 560);
/** How far a flick carries: the finger's speed (steps per ms) times this, at most one step. */
const FLICK_MS = 160;
/** Paths with more stops than this get a counter and arrows instead of a row of dots. */
const MAX_DOTS = 6;
const PHONE = '(max-width: 860px)';

// How the Teeth path's tissues look (src/viewer/surface.ts; sizes in millimetres). Cut faces stay flat.
// Cut faces: faint rods (streaks along _dir) and growth lines (bands across _depth), baked by build_genetics_teeth.py,
// over clearer layer colours than the outside (an illustrated section). Outside, a faint warm halo marks where each
// condition took tooth away (_defect, baked from the damage), so students see where to look.
// A cool blue no tooth tissue has, so it is never read as stain, caries or amber DI dentin (the Teeth note explains it).
const HALO: SurfaceStyle = { halo: '#4d8dff', haloAmount: 0.45 };
const ENAMEL_CUT: SurfaceStyle = { ...HALO, streaks: 0.22, streakSize: 0.06, bands: 0.1, bandSpacing: 0.28, cutColor: '#f8f3e9', cutAmount: 0.35 };
const DENTIN_CUT: SurfaceStyle = { ...HALO, streaks: 0.18, streakSize: 0.07, bands: 0.06, bandSpacing: 0.35, cutColor: '#f0c27a', cutAmount: 0.5 };
// Outside: warmer at the neck, where dentin shows through; lighter and cooler at the edges (translucent enamel).
const ENAMEL: SurfaceStyle = {
  ...ENAMEL_CUT, roughness: 0.24, clearcoat: 0.65, grain: 0.22, grainSize: 0.35, perikymata: 0.8, perikymataSpacing: 0.1, bump: 0.4,
  neck: '#dcc391', neckAmount: 0.45, neckHeight: 3.5, rim: 0.35, flatCut: true,
};
const TOOTH_LOOK: Record<string, SurfaceStyle> = {
  enamel: ENAMEL,
  // Hard but thin: dentin shows through, and the perikymata and grooves stand out.
  'ai-hypoplastic-enamel': { ...ENAMEL, perikymata: 0.9, stain: '#d9be8a', stainAmount: 0.35, stainSize: 1.2 },
  // Soft, opaque and mottled chalky white to yellow-brown.
  'ai-hypomaturation-enamel': { ...ENAMEL_CUT, roughness: 0.72, grain: 0.4, grainSize: 0.3, bump: 0.5, stain: '#b4864a', stainAmount: 0.6, stainSize: 0.7, neck: '#d8bf8c', neckAmount: 0.3, neckHeight: 3, flatCut: true },
  // Very soft, rough, stained yellow-brown to brown.
  'ai-hypocalcified-enamel': { ...ENAMEL_CUT, roughness: 0.86, grain: 0.55, grainSize: 0.28, bump: 0.8, stain: '#6f4a22', stainAmount: 0.45, stainSize: 0.5, flatCut: true },
  // Normal enamel over soft dentin, chipping away.
  'di-enamel': { ...ENAMEL, perikymata: 0.3 },
  // Opalescent: amber with grey-blue patches and a soft sheen.
  // Few, irregular tubules: faint streaks.
  'di-dentin': { ...DENTIN_CUT, streaks: 0.06, streakSize: 0.12, roughness: 0.32, clearcoat: 0.4, grain: 0.2, grainSize: 0.45, bump: 0.3, stain: '#7d8796', stainAmount: 0.22, stainSize: 1.1, rim: 0.2, flatCut: true },
  dentin: { ...DENTIN_CUT, roughness: 0.55, grain: 0.25, grainSize: 0.35, bump: 0.3, flatCut: true },
  cementum: { ...HALO, bands: 0.08, bandSpacing: 0.12, roughness: 0.8, grain: 0.35, grainSize: 0.25, bump: 0.45, flatCut: true, cutColor: '#d9b878', cutAmount: 0.45 },
  // Living tissue: a richer red on the cut and a faint warm glow, with its vessels and nerve drawn on it.
  pulp: { roughness: 0.55, grain: 0.25, grainSize: 0.25, stain: '#8f2f3c', stainAmount: 0.3, stainSize: 0.45, glow: 0.4, cutColor: '#ea9a90', cutAmount: 0.5 },
  vessels: { roughness: 0.45, clearcoat: 0.25, glow: 0.12 },
};
// The display stand (contact shadow baked into _ao) and each gene's glowing thread to its tooth.
const STAND: SurfaceStyle = { ao: 1.6, roughness: 0.25, clearcoat: 0.6 };
const LINK: SurfaceStyle = { glow: 0.65, roughness: 0.3, clearcoat: 0.5 };
// Proteins (and the tRNAs, built the same way) carry baked occlusion (_ao, build_genetics.py) on their lobed
// relief; with the showcase lighting (Viewer.setShowcase) every Genetics path reads as one illustrated set.
const PROTEINS = new Set(['rep-helicase', 'rep-topoisomerase', 'rep-ssb', 'rep-primase', 'rep-dna-polymerase', 'rep-ligase',
  'tx-transcription-factors', 'tx-rna-polymerase', 'tl-small-subunit', 'tl-large-subunit', 'tl-trna', 'tl-release-factor',
  'dna-histone-octamer', 'dna-h1', 'dna-fibre', 'dna-scaffold']);
const PROTEIN: SurfaceStyle = { ao: 2.6, glow: 0.35, roughness: 0.42, clearcoat: 0.45, grain: 0.12, grainSize: 0.3, bump: 0.3 };
// DNA, RNA and the rest: the same gloss and edge glow, no relief.
const STRAND: SurfaceStyle = { glow: 0.3, roughness: 0.4, clearcoat: 0.35 };
/** The finish of any Genetics part: the teeth's tissues their own (toothLook), proteins lobed, the rest glossy. */
export function geneticsLook(node: string): SurfaceStyle {
  const key = nodeKey(node);
  if (key === 'gt-stand') return STAND;
  if (key === 'gt-link') return LINK;
  return toothLook(key) ?? (PROTEINS.has(key) ? PROTEIN : STRAND);
}

/** The finish of a Teeth-path part (gt-<condition>-<tissue>); other parts keep the default. */
export function toothLook(key: string): SurfaceStyle | undefined {
  const m = /^gt-(.+)-(enamel|dentin|cementum|pulp|vessels)$/.exec(key);
  if (!m) return undefined;
  return TOOTH_LOOK[key.slice(3)] ?? TOOTH_LOOK[m[2]];
}

/**
 * Genetics: the model is the timeline. One paused GSAP timeline holds a whole path (camera framing
 * per stop, and each shape key's weight over time); a sideways swipe sets its time directly, so the
 * model follows the finger, and letting go eases to the nearest stop. The card below shows where you are.
 */
export function GeneticsPath({ viewer, ready, path, views, onView }: {
  viewer: RefObject<Viewer | null>; ready: boolean; path: Path;
  views: [GeneticsView, string][]; onView: (v: GeneticsView) => void;
}) {
  const steps = path.steps;
  const last = steps.length - 1;
  const [step, setStep] = useState(0);
  // The gesture hint goes once the student has swiped: on phones the card then takes less of the screen.
  const [travelled, setTravelled] = useState(false);
  const go = useRef<(t: number, animate: boolean) => void>(() => {});
  const card = useRef<HTMLElement>(null);
  // On phones the card opens as a peek (switch, title, stop controls) so the model keeps the screen;
  // More shows the text, the family tree and the note.
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
  const [open, setOpen] = useState(false);
  // Examining a stop's model (Teeth): it turns freely and everything else hides; Back returns to travelling.
  const [examining, setExamining] = useState(false);
  useEffect(() => {
    const mq = matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Each stop's card opens at its title (on phones the card scrolls).
  useEffect(() => { card.current?.scrollTo?.({ top: 0 }); }, [step, path]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    setStep(0);
    setExamining(false);
    const frame = (i: number) => {
      const { center, width, height, phoneWidth, yaw } = steps[i].view;
      return { cx: center[0], cy: center[1], cz: center[2], w: width, h: height, pw: phoneWidth ?? width * 0.6, yaw: yaw ?? 0 };
    };
    const names = Object.keys(path.motion);
    const state: Record<string, number> = { ...frame(0), ...Object.fromEntries(names.map((n) => [n, path.motion[n][0][1]])) };
    const apply = () => {
      v.setPathView({ center: [state.cx, state.cy, state.cz], width: state.w, height: state.h, phoneWidth: state.pw, yaw: state.yaw });
      v.setMorphWeights(Object.fromEntries(names.map((n) => [n, state[n]])));
    };
    const timeline = gsap.timeline({ paused: true });
    steps.forEach((_, i) => { if (i) timeline.to(state, { ...frame(i), duration: 1, ease: 'sine.inOut' }, i - 1); });
    // Each shape key moves linearly between its keyframes, holding its value before and after.
    for (const n of names) {
      const track = path.motion[n];
      track.slice(1).forEach(([t, w], k) => {
        const [t0] = track[k];
        timeline.to(state, { [n]: w, duration: Math.max(t - t0, 1e-3), ease: 'none' }, t0);
      });
    }
    timeline.set({}, {}, last);
    timeline.time(last).time(0); // record every start value in order
    apply();

    const nav = { t: 0 };
    let snap: gsap.core.Tween | null = null;
    const show = () => { timeline.time(nav.t); apply(); setStep(Math.round(nav.t)); };
    go.current = (t, animate) => {
      setExamining(false);
      snap?.kill();
      const target = Math.min(Math.max(t, 0), last);
      if (!animate) { nav.t = target; show(); return; }
      const to = Math.round(target);
      snap = gsap.to(nav, { t: to, duration: REDUCED_MOTION ? 0 : 0.5 + 0.2 * Math.min(2, Math.abs(to - nav.t)), ease: 'power3.out', onUpdate: show });
    };
    // Stepwise paths (Teeth) move at most one stop per swipe or scroll, from the stop where it began.
    let from: number | null = null;
    const reach = (t: number) => (path.stepwise && from !== null ? Math.min(Math.max(t, from - 1), from + 1) : t);
    v.onTravel = (dx) => {
      setTravelled(true);
      from ??= Math.round(nav.t);
      go.current(reach(nav.t - dx / pxPerStep()), false);
    };
    v.onTravelEnd = (velocity) => {
      go.current(reach(nav.t + Math.max(-1, Math.min(1, (-velocity / pxPerStep()) * FLICK_MS))), true);
      from = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') go.current(Math.round(nav.t) + 1, true);
      else if (e.key === 'ArrowLeft') go.current(Math.round(nav.t) - 1, true);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      snap?.kill();
      timeline.kill();
      v.onTravel = () => {};
      v.onTravelEnd = () => {};
    };
  }, [viewer, ready, path, steps, last]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready || !examining || !path.examine) return;
    v.setFilter(path.examine(step));
    v.setPathOrbit(true);
    return () => {
      v.setPathOrbit(false);
      v.setFilter(() => true);
    };
  }, [viewer, ready, examining, path, step]);

  const s = steps[Math.min(step, last)];
  return (
    <section ref={card} className="card timeline timeline--rich path-card" aria-label={`Genetics: ${path.id}`}>
      <div className="path-card__views">
        <Segmented label="Genetics view" value={path.id} onChange={onView} options={views} />
      </div>
      <p className="path-card__eyebrow">{path.eyebrow(Math.min(step, last))}</p>
      <h2 className="path-card__title">{s.title}</h2>
      <div className="path-card__nav">
        {examining ? (
          <p className="path-card__examining">Drag to turn · pinch to zoom</p>
        ) : steps.length > MAX_DOTS ? (
          <div className="path-card__stepper">
            <button aria-label="Previous stop" disabled={step === 0} onClick={() => go.current(step - 1, true)}>‹</button>
            <span className="path-card__count" aria-live="polite">{step + 1} / {steps.length}</span>
            <span className="path-card__bar" aria-hidden="true"><i style={{ width: `${(step / last) * 100}%` }} /></span>
            <button aria-label="Next stop" disabled={step === last} onClick={() => go.current(step + 1, true)}>›</button>
          </div>
        ) : (
          <div className="path-card__dots">
            {steps.map((x, i) => (
              <button key={x.title} aria-label={`Go to ${x.title}`} aria-current={i === step ? 'step' : undefined} onClick={() => go.current(i, true)}><i /></button>
            ))}
          </div>
        )}
        {path.examine && (
          <button className="path-card__examine" aria-pressed={examining} onClick={() => setExamining((e) => !e)}>
            {examining ? 'Back' : 'Examine'}
          </button>
        )}
        {phone && <button className="path-card__more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Less' : 'More'}</button>}
      </div>
      {(!phone || open) && (
        <div className="path-card__body">
          {s.size && <p className="path-card__size">{s.size}</p>}
          <p className="path-card__text">{s.text}</p>
          {s.pattern && <FamilyTree pattern={s.pattern} />}
          <div className="path-card__foot">
            {!travelled && step === 0 && <p className="path-card__hint">{path.hint}</p>}
            <p className="path-card__note">{path.note}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/** Where each person of a three-generation tree sits (PEDIGREES share this shape): x, y in the drawing. */
const SPOTS: [number, number][] = [[107, 18], [157, 18], [37, 70], [77, 70], [127, 70], [177, 70], [227, 70], [37, 120], [67, 120], [97, 120]];
const R = 7;

/** A small family tree: square male, circle female, filled affected, dot carrier; generations I–III. */
function FamilyTree({ pattern }: { pattern: Pattern }) {
  const { people, note } = PEDIGREES[pattern];
  const couples = [...new Set(people.filter((p) => p.parents).map((p) => p.parents!.join()))].map((k) => k.split(',').map(Number) as [number, number]);
  return (
    <figure className="path-card__tree">
      <svg viewBox="0 0 250 132" role="img" aria-label={`Example family tree: ${pattern === 'AD' ? 'autosomal dominant' : 'autosomal recessive'}`}>
        <g stroke="var(--ink-2)" strokeWidth="1.4" fill="none">
          {couples.map(([a, b]) => {
            const kids = people.map((p, i) => [p, i] as const).filter(([p]) => p.parents?.join() === `${a},${b}`).map(([, i]) => i);
            const [ax, ay] = SPOTS[a], [bx] = SPOTS[b], mx = (ax + bx) / 2, sy = (ay + SPOTS[kids[0]][1]) / 2;
            const xs = kids.map((k) => SPOTS[k][0]);
            return (
              <g key={`${a}-${b}`}>
                <line x1={ax} y1={ay} x2={bx} y2={ay} />
                <line x1={mx} y1={ay} x2={mx} y2={sy} />
                <line x1={Math.min(mx, ...xs)} y1={sy} x2={Math.max(mx, ...xs)} y2={sy} />
                {kids.map((k) => <line key={k} x1={SPOTS[k][0]} y1={sy} x2={SPOTS[k][0]} y2={SPOTS[k][1] - R} />)}
              </g>
            );
          })}
          {people.map((p, i) => {
            const [x, y] = SPOTS[i], fill = p.status === 'a' ? 'var(--ink-2)' : 'var(--card)';
            return (
              <g key={i}>
                {p.sex === 'M' ? <rect x={x - R} y={y - R} width={2 * R} height={2 * R} fill={fill} /> : <circle cx={x} cy={y} r={R} fill={fill} />}
                {p.status === 'c' && <circle cx={x} cy={y} r={2.4} fill="var(--ink-2)" stroke="none" />}
              </g>
            );
          })}
        </g>
        {['I', 'II', 'III'].map((g, i) => <text key={g} x="0" y={22 + i * 51} fill="var(--ink-2)" fontSize="12" fontWeight="600">{g}</text>)}
      </svg>
      <ul className="path-card__key" aria-label="Key">
        <li><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="var(--ink-2)" /></svg>Affected</li>
        <li><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="var(--card)" stroke="var(--ink-2)" strokeWidth="1.4" /></svg>Unaffected</li>
        {people.some((p) => p.status === 'c') && <li><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="var(--card)" stroke="var(--ink-2)" strokeWidth="1.4" /><circle cx="8" cy="8" r="2.2" fill="var(--ink-2)" /></svg>Carrier</li>}
        <li>□ male · ○ female</li>
      </ul>
      <figcaption>{note}</figcaption>
    </figure>
  );
}
