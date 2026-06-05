/**
 * CLI: writes the generated catalog to {@link ENGINE_API_DOC}. Run via
 * `npm run docs:api`. Kept separate from `engine-api.ts` so the generator stays
 * a pure, side-effect-free import for the drift test.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENGINE_API_DOC, generateEngineApiMarkdown } from './engine-api';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const out = join(root, ENGINE_API_DOC);
writeFileSync(out, generateEngineApiMarkdown(), 'utf8');

console.log(`Wrote ${ENGINE_API_DOC}`);
