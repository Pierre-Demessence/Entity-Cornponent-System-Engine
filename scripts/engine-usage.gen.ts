/**
 * CLI: writes the generated usage report to {@link ENGINE_USAGE_DOC}. Run via
 * `npm run docs:usage`. Kept separate from `engine-usage.ts` so the generator
 * stays a pure, side-effect-free import for the drift test.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENGINE_USAGE_DOC, generateEngineUsageMarkdown } from './engine-usage';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const out = join(root, ENGINE_USAGE_DOC);
writeFileSync(out, generateEngineUsageMarkdown(), 'utf8');

console.log(`Wrote ${ENGINE_USAGE_DOC}`);
