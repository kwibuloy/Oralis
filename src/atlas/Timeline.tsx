import type { ReactNode } from 'react';
import Icon from './Icon';

const SPEEDS = [0.5, 1, 2] as const;

/**
 * Shared playback bar for animated subjects: play/pause, scrub through one loop, and a speed
 * button that cycles 0.5× / 1× / 2× (one tap target instead of three on phones). Optional extras:
 * `children` above the bar (a caption, a switch), `marks` (tick positions 0..1, e.g. stage
 * boundaries) and `track` (a drawing behind the slider, e.g. a pH curve).
 */
export default function Timeline({ playing, onPlaying, time, onScrub, speed, onSpeed, label, valueText, marks, track, children }: {
  playing: boolean; onPlaying: (on: boolean) => void;
  time: number; onScrub: (t: number) => void;
  speed: number; onSpeed: (s: number) => void;
  label: string;
  valueText?: string;
  marks?: number[];
  track?: ReactNode;
  children?: ReactNode;
}) {
  const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
  const bar = (
    <>
      <button className="timeline__play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => onPlaying(!playing)}>
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <div className={`timeline__track${track ? ' has-drawing' : ''}`}>
        {track && <div className="timeline__drawing" aria-hidden="true">{track}</div>}
        {marks?.map((m) => <span key={m} className="timeline__mark" style={{ left: `${m * 100}%` }} aria-hidden="true" />)}
        <input type="range" min={0} max={1000} value={Math.round(time * 1000)} aria-label={`${label} position`} aria-valuetext={valueText}
          onChange={(e) => { onPlaying(false); onScrub(Number(e.target.value) / 1000); }}
          style={{ '--fill': `${time * 100}%` } as React.CSSProperties} />
      </div>
      <button className="timeline__speed" aria-label={`Speed ${speed}×, tap for ${next}×`} onClick={() => onSpeed(next)}>
        {speed}×
      </button>
    </>
  );
  return children ? (
    <section className="card timeline timeline--rich" aria-label={`${label} playback`}>
      <div className="timeline__head">{children}</div>
      <div className="timeline__row">{bar}</div>
    </section>
  ) : (
    <section className="card timeline" aria-label={`${label} playback`}>{bar}</section>
  );
}
