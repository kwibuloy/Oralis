import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

/** Serve /api/*.ts with the same Web-standard handlers Vercel runs in production. */
function vercelApi(): Plugin {
  const mount = (server: ViteDevServer | { middlewares: ViteDevServer['middlewares'] }, load: (p: string) => Promise<Record<string, unknown>>) =>
    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const match = req.url?.match(/^\/api\/([a-z-]+)(?:\?.*)?$/);
      if (!match) return next();
      try {
        const mod = await load(`/api/${match[1]}.ts`);
        const handler = mod[req.method ?? 'GET'] as ((r: Request) => Response | Promise<Response>) | undefined;
        if (!handler) return void ((res.statusCode = 405), res.end());
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const request = new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        });
        const response = await handler(request);
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal error' }));
      }
    });

  return {
    name: 'vercel-api',
    configureServer: (server) => void mount(server, (p) => server.ssrLoadModule(p)),
  };
}

export default defineConfig({
  plugins: [react(), vercelApi()],
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'], gsap: ['gsap'] } },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
