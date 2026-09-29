/**
 * CLI: writes the Examples section's MDX into the Starlight content directory.
 * Run via `npm run docs:examples`, or as part of `npm run docs:site`.
 *
 * Kept separate from `examples.ts` so the generator stays a pure,
 * side-effect-free import for its test.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXAMPLES_DIR, renderExamplePages } from './examples';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const contentDir = join(root, 'website/src/content/docs');

// Rebuilt from scratch so a removed prototype's page does not linger.
rmSync(join(contentDir, EXAMPLES_DIR), { force: true, recursive: true });

const pages = renderExamplePages();
for (const page of pages) {
  const out = join(contentDir, page.outPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page.markdown, 'utf8');
}

console.log(`Wrote ${pages.length} example pages to website/src/content/docs/${EXAMPLES_DIR}`);
