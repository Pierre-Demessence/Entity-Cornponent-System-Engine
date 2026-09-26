// @ts-check
import { readFileSync } from 'node:fs';

import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

const REPO = 'https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine';
const BASE = '/Entity-Cornponent-System-Engine/';

/**
 * The core subpaths are derived from the package's own `exports` map, so the
 * reference cannot drift from what consumers can actually import. Modules are a
 * glob because the `exports` entry is one.
 *
 * Paths are relative to the repo root: TypeDoc resolves them from the working
 * directory, which is where the npm script runs, not from the Astro root.
 */
function coreEntryPoints() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return Object.entries(pkg.exports)
    .filter(([key]) => key !== '.' && key !== './modules/*')
    .map(([, value]) => String(value));
}

export default defineConfig({
  base: BASE,
  // Served from a project path, so `base` keeps every generated link correct.
  site: 'https://pierre-demessence.github.io',
  integrations: [
    starlight({
      // The header's section links are text, not icons, which needs an override.
      components: { Header: './src/components/Header.astro' },
      customCss: ['./src/styles/custom.css'],
      description: 'Entity-Component-System primitives for 2D and 3D games and simulations.',
      routeMiddleware: './src/site-route-data.ts',
      social: [{ href: REPO, icon: 'github', label: 'GitHub' }],
      title: '@pierre/ecs',
      plugins: [
        starlightTypeDoc({
          entryPoints: [...coreEntryPoints(), './src/modules/*/index.ts'],
          tsconfig: './tsconfig.json',
          typeDoc: {
            excludeInternal: true,
            // The repo README is not the API landing; `/api/` is an authored page.
            readme: 'none',
          },
        }),
      ],
      sidebar: [
        {
          // The 50+ guides inline would push the API group far below the fold.
          collapsed: true,
          label: 'Manual',
          items: [
            { label: 'Overview', link: '/manual/' },
            { items: [{ autogenerate: { directory: 'manual/core' } }], label: 'Core' },
            { items: [{ autogenerate: { directory: 'manual/modules' } }], label: 'Modules' },
          ],
        },
        {
          // `typeDocSidebarGroup` is a placeholder the plugin swaps for the generated
          // group by matching its label, so it must stay in the tree untouched.
          // The route middleware in `src/site-route-data.ts` splits this superset into
          // the two per-section sidebars.
          items: [{ label: 'Overview', link: '/api/' }, typeDocSidebarGroup],
          label: 'API reference',
        },
      ],
    }),
  ],
});
