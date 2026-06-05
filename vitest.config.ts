import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^#(.*)$/, replacement: resolve(__dirname, 'src/$1.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      exclude: ['src/**/*.test.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
    },
  },
});
