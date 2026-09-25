/**
 * CLI: writes the Manual pages under `_site/manual`. Run via
 * `npm run docs:manual`. Kept separate from `manual.ts` so the renderer stays a
 * pure, side-effect-free import.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { modulesWithoutReadme, renderManualPages } from './manual';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const site = join(root, '_site');

// Rebuilt from scratch so a guide whose README was deleted does not linger.
rmSync(join(site, 'manual'), { force: true, recursive: true });

const pages = renderManualPages();
for (const page of pages) {
  const out = join(site, page.outPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page.html, 'utf8');
}

const skipped = modulesWithoutReadme();
console.log(`Wrote ${pages.length} pages to _site/manual`);
if (skipped.length > 0)
  console.warn(`No README, so no guide written for: ${skipped.join(', ')}`);
