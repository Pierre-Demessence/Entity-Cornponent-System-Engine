/**
 * CLI: writes the Manual's markdown into the Starlight content directory. Run
 * via `npm run docs:manual`, or as the first half of `npm run docs:site`.
 *
 * Kept separate from `manual.ts` so the generator stays a pure, side-effect-free
 * import for its test.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { modulesWithoutReadme, renderManualPages } from './manual';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const contentDir = join(root, 'website/src/content/docs');

// Rebuilt from scratch so a guide whose README was deleted does not linger.
rmSync(join(contentDir, 'manual'), { force: true, recursive: true });

const pages = renderManualPages();
for (const page of pages) {
  const out = join(contentDir, page.outPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page.markdown, 'utf8');
}

const skipped = modulesWithoutReadme();
console.log(`Wrote ${pages.length} manual pages to website/src/content/docs/manual`);
if (skipped.length > 0)
  console.warn(`No README, so no guide written for: ${skipped.join(', ')}`);
