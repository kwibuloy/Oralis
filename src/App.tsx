import { lazy, Suspense } from 'react';
import { modeById } from './content/modes';
import { useRoute } from './lib/route';
import ComingSoon from './atlas/ComingSoon';

// three.js and gsap stay out of the first chunk.
const Atlas = lazy(() => import('./atlas/Atlas'));

export default function App() {
  const route = useRoute();
  return (
    <Suspense fallback={<p className="loading-screen">Preparing the atlas…</p>}>
      {/* Keyed by mode: each mode loads its own model into a fresh viewer. */}
      {modeById(route.mode)
        ? <Atlas key={route.mode} modeId={modeById(route.mode)!.id} initialSelected={route.selected} />
        : <ComingSoon id={route.mode} />}
    </Suspense>
  );
}
