import Icon from './Icon';

const SPEEDS = [0.5, 1, 2] as const;

/**
 * Shared playback bar for animated subjects: play/pause, scrub through one loop, and a speed
 * button that cycles 0.5× / 1× / 2× (one tap target instead of three on phones).
 */
export default function Timeline({ playing, onPlaying, time, onScrub, speed, onSpeed, label }: {
  playing: boolean; onPlaying: (on: boolean) => void;
  time: number; onScrub: (t: number) => void;
  speed: number; onSpeed: (s: number) => void;
  label: string;
}) {
  const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
  return (
    <section className="card timeline" aria-label={`${label} playback`}>
      <button className="timeline__play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => onPlaying(!playing)}>
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <input type="range" min={0} max={1000} value={Math.round(time * 1000)} aria-label={`${label} position`}
        onChange={(e) => { onPlaying(false); onScrub(Number(e.target.value) / 1000); }}
        style={{ '--fill': `${time * 100}%` } as React.CSSProperties} />
      <button className="timeline__speed" aria-label={`Speed ${speed}×, tap for ${next}×`} onClick={() => onSpeed(next)}>
        {speed}×
      </button>
    </section>
  );
}
