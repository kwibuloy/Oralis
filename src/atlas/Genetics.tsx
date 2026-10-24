import { gsap } from 'gsap';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { PATH_NOTE, PATH_STEPS } from '../content/genetics';
import type { Viewer } from '../viewer/Viewer';

const REDUCED_MOTION = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Finger travel for one step: most of a phone's width, capped on wide screens. */
const pxPerStep = () => Math.min(window.innerWidth * 0.75, 560);
/** How far a flick carries: the finger's speed (steps per ms) times this, at most one step. */
const FLICK_MS = 160;

/**
 * Genetics: the ladder is the timeline. One paused GSAP timeline holds the whole path (camera framing
 * and shape-key weights, a second per step); a sideways swipe sets its time directly, so the model
 * follows the finger, and letting go eases to the nearest step. The step card below shows where you are.
 */
export function GeneticsPath({ viewer, ready }: { viewer: RefObject<Viewer | null>; ready: boolean }) {
  const steps = PATH_STEPS;
  const last = steps.length - 1;
  const [step, setStep] = useState(0);
  // The gesture hint goes once the student has swiped: on phones the card then takes less of the screen.
  const [travelled, setTravelled] = useState(false);
  const go = useRef<(t: number, animate: boolean) => void>(() => {});

  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    const names = [...new Set(steps.flatMap((s) => Object.keys(s.morph)))];
    const frame = (i: number) => {
      const s = steps[i];
      return { cx: s.view.center[0], cy: s.view.center[1], cz: s.view.center[2], w: s.view.width, h: s.view.height, ...Object.fromEntries(names.map((n) => [n, s.morph[n] ?? 0])) };
    };
    const state: Record<string, number> = frame(0);
    const apply = () => {
      v.setPathView({ center: [state.cx, state.cy, state.cz], width: state.w, height: state.h });
      v.setMorphWeights(Object.fromEntries(names.map((n) => [n, state[n]])));
    };
    const timeline = gsap.timeline({ paused: true });
    steps.forEach((_, i) => { if (i) timeline.to(state, { ...frame(i), duration: 1, ease: 'sine.inOut' }, i - 1); });
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
  }, [viewer, ready, steps, last]);

  const s = steps[step];
  return (
    <section className="card timeline timeline--rich path-card" aria-label="Genetics path">
      <p className="path-card__eyebrow">DNA · stop {step + 1} of {steps.length}</p>
      <h2 className="path-card__title">{s.title}</h2>
      {s.size && <p className="path-card__size">{s.size}</p>}
      <p className="path-card__text">{s.text}</p>
      <div className="path-card__dots">
        {steps.map((x, i) => (
          <button key={x.title} aria-label={`Go to ${x.title}`} aria-current={i === step ? 'step' : undefined} onClick={() => go.current(i, true)}><i /></button>
        ))}
      </div>
      {!travelled && <p className="path-card__hint">Swipe sideways to travel along the ladder · up or down to turn · pinch to zoom · tap a part</p>}
      <p className="path-card__note">{PATH_NOTE}</p>
    </section>
  );
}
