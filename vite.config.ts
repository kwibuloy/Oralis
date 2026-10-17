import react from '@vitejs/plugin-react';
import { readdirSync, statSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Model file sizes, so the loading bar can show a percentage even when the server sends no length
// (compressed responses).
const MODEL_SIZES = Object.fromEntries(readdirSync('public/models').filter((f) => f.endsWith('.glb')).map((f) => [`/models/${f}`, statSync(`public/models/${f}`).size]));

export default defineConfig({
  plugins: [react()],
  define: { __MODEL_SIZES__: JSON.stringify(MODEL_SIZES) },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], gsap: ['gsap'] } },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
