import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Model file sizes, so the loading bar can show a percentage even when the server sends no length
// (compressed responses).
const MODEL_SIZES = Object.fromEntries(readdirSync('public/models').filter((f) => f.endsWith('.glb')).map((f) => [`/models/${f}`, statSync(`public/models/${f}`).size]));

// A content hash per model, added to its URL: models are cached for a year as immutable, so a rebuilt
// model must get a new URL or browsers keep showing the old one.
const MODEL_VERSIONS = Object.fromEntries(readdirSync('public/models').filter((f) => f.endsWith('.glb')).map((f) => [`/models/${f}`, createHash('sha1').update(readFileSync(`public/models/${f}`)).digest('hex').slice(0, 10)]));

export default defineConfig({
  plugins: [react()],
  // three-mesh-bvh starts its worker from a URL next to its own file; pre-bundling moves the file and
  // breaks that URL, so it is served as is. Module workers in the build, as in dev.
  optimizeDeps: { exclude: ['three-mesh-bvh'] },
  worker: { format: 'es' },
  define: { __MODEL_SIZES__: JSON.stringify(MODEL_SIZES), __MODEL_VERSIONS__: JSON.stringify(MODEL_VERSIONS) },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], gsap: ['gsap'] } },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
