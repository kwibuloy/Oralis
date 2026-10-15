import { lazy, Suspense } from 'react';
import { useRoute } from './lib/route';

// three.js and gsap stay out of the first chunk.
const Atlas = lazy(() => import('./atlas/Atlas'));

export default function App() {
  const route = useRoute();
  return (
    <Suspense fallback={<p className="loading-screen">Preparing the atlas…</p>}>
      {/* Keyed by mode: each mode loads its own model into a fresh viewer. */}
      <Atlas key={route.mode} modeId={route.mode} initialSelected={route.selected} />
    </Suspense>
  );
}
