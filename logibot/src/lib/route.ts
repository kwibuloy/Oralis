import { useSyncExternalStore } from 'react';
import { modeById, type ModeId } from '../content/modes';

/** Hash routes: `#/general`, `#/dental/<structure-key>`, `#/histology/enamel`. Anything else opens General anatomy. */
export interface Route { mode: ModeId; selected?: string }

export function parseRoute(hash: string): Route {
  const [, mode, selected] = hash.replace(/^#/, '').split('/');
  const m = mode ? modeById(mode) : undefined;
  return m ? { mode: m.id, selected: selected ? decodeURIComponent(selected) : undefined } : { mode: 'general' };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

let cached: { hash: string; route: Route } | null = null;
function snapshot(): Route {
  const hash = window.location.hash;
  if (cached?.hash !== hash) cached = { hash, route: parseRoute(hash) };
  return cached.route;
}

export const useRoute = () => useSyncExternalStore(subscribe, snapshot);
export const modeHref = (mode: ModeId, selected?: string) => `#/${mode}${selected ? `/${encodeURIComponent(selected)}` : ''}`;

/** Update the selection in the URL without adding a history entry per click. */
export function replaceSelection(mode: ModeId, selected?: string) {
  history.replaceState(null, '', modeHref(mode, selected));
}
