import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], gsap: ['gsap'] } },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
