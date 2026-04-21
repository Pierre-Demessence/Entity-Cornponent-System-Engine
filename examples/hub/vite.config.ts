import { defineConfig } from 'vite';

export default defineConfig({
  // Keep the hub on a dedicated port because the root app uses default Vite port.
  server: { port: 5177 },
});
