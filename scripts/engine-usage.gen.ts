/**
 * CLI: writes the generated usage artifacts. Run via `npm run docs:usage`. Kept
 * separate from `engine-usage.ts` so the generator stays a pure, side-effect-free
 * import for the drift test.
 *
 * Markdown and JSON are versioned and drift-guarded; the HTML is generated and
 * gitignored — a local lens over the same model.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildUsageReport,
  ENGINE_USAGE_DOC,
  ENGINE_USAGE_HTML_DOC,
  ENGINE_USAGE_JSON_DOC,
  renderUsageHtml,
  renderUsageJson,
  renderUsageMarkdown,
} from './engine-usage';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const report = buildUsageReport();
const artifacts: [string, string][] = [
  [ENGINE_USAGE_DOC, renderUsageMarkdown(report)],
  [ENGINE_USAGE_JSON_DOC, renderUsageJson(report)],
  [ENGINE_USAGE_HTML_DOC, renderUsageHtml(report)],
];

for (const [doc, text] of artifacts) {
  writeFileSync(join(root, doc), text, 'utf8');
  console.log(`Wrote ${doc}`);
}
