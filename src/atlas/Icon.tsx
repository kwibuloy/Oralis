const PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.35-4.35',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-6v-4m0-4h.01',
  close: 'M18 6 6 18M6 6l12 12',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5',
  rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5',
  isolate: 'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3m5-4a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  chevron: 'm9 18 6-6-6-6',
  layers: 'm12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5M3 16l9 5 9-5',
  external: 'M7 17 17 7M8 7h9v9',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M9 5v14M15 5v14',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
