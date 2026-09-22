import type { Plugin } from 'vite';

import { defineConfig } from 'vite';

// SharedArrayBuffer (the parallel toggle) needs cross-origin isolation. Setting
// COOP/COEP via middleware applies them to every response, including the HTML
// document; `server.headers` alone did not produce isolation here.
function crossOriginIsolation(): Plugin {
  const setHeaders = (res: { setHeader: (k: string, v: string) => void }): void => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  };
  return {
    name: 'cross-origin-isolation',
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        setHeaders(res);
        next();
      });
    },
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        setHeaders(res);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [crossOriginIsolation()],
  server: { port: 5196 },
});
