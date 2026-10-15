import { lazy, Suspense, useEffect } from 'react';
import { modeById } from './content/modes';
import Landing from './landing/Landing';
import { useRoute } from './lib/route';

// three.js and gsap load only when a mode opens.
const Atlas = lazy(() => import('./atlas/Atlas'));

export default function App() {
  const route = useRoute();
  const model = route.view === 'mode' ? modeById(route.mode)!.model : null;

  useEffect(() => {
    if (route.view === 'mode') window.scrollTo(0, 0);
  }, [route.view]);

  if (route.view === 'mode') {
    return (
      <Suspense fallback={<p className="loading-screen">Preparing the atlas…</p>}>
        {/* Keyed by model: switching General ↔ Dental keeps the loaded head. */}
        <Atlas key={model} modeId={route.mode} initialSelected={route.selected} />
      </Suspense>
    );
  }
  return <Landing />;
}
