import { gsap } from 'gsap';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { GeneticsPath as Path, GeneticsView } from '../content/genetics';
import type { Viewer } from '../viewer/Viewer';
import { Segmented } from './controls';

const REDUCED_MOTION = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Finger travel for one step: most of a phone's width, capped on wide screens. */
const pxPerStep = () => Math.min(window.innerWidth * 0.75, 560);
/** How far a flick carries: the finger's speed (steps per ms) times this, at most one step. */
const FLICK_MS = 160;

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

  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    setStep(0);
    const frame = (i: number) => {
      const { center, width, height } = steps[i].view;
      return { cx: center[0], cy: center[1], cz: center[2], w: width, h: height };
    };
    const names = Object.keys(path.motion);
    const state: Record<string, number> = { ...frame(0), ...Object.fromEntries(names.map((n) => [n, path.motion[n][0][1]])) };
    const apply = () => {
      v.setPathView({ center: [state.cx, state.cy, state.cz], width: state.w, height: state.h });
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
      snap?.kill();
      const target = Math.min(Math.max(t, 0), last);
      if (!animate) { nav.t = target; show(); return; }
      const to = Math.round(target);
      snap = gsap.to(nav, { t: to, duration: REDUCED_MOTION ? 0 : 0.5 + 0.2 * Math.min(2, Math.abs(to - nav.t)), ease: 'power3.out', onUpdate: show });
    };
    v.onTravel = (dx) => { setTravelled(true); go.current(nav.t - dx / pxPerStep(), false); };
    v.onTravelEnd = (velocity) => go.current(nav.t + Math.max(-1, Math.min(1, (-velocity / pxPerStep()) * FLICK_MS)), true);
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

  const s = steps[Math.min(step, last)];
  return (
    <section className="card timeline timeline--rich path-card" aria-label={`Genetics: ${path.id}`}>
      <div className="path-card__views">
        <Segmented label="Genetics view" value={path.id} onChange={onView} options={views} />
      </div>
      <p className="path-card__eyebrow">{path.eyebrow(Math.min(step, last))}</p>
      <h2 className="path-card__title">{s.title}</h2>
      {s.size && <p className="path-card__size">{s.size}</p>}
      <p className="path-card__text">{s.text}</p>
      <div className="path-card__dots">
        {steps.map((x, i) => (
          <button key={x.title} aria-label={`Go to ${x.title}`} aria-current={i === step ? 'step' : undefined} onClick={() => go.current(i, true)}><i /></button>
        ))}
      </div>
      {!travelled && <p className="path-card__hint">Swipe sideways to travel · up or down to turn · pinch to zoom · tap a part</p>}
      <p className="path-card__note">{path.note}</p>
    </section>
  );
}
