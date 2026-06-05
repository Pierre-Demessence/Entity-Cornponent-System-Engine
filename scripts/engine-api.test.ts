import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ENGINE_API_DOC, generateEngineApiMarkdown } from './engine-api';

const root = resolve(fileURLToPath(import.meta.url), '../..');

describe('engine api catalog', () => {
  it('is in sync with the source (run `npm run docs:api` if this fails)', () => {
    const committed = readFileSync(join(root, ENGINE_API_DOC), 'utf8');
    // Normalize line endings: git autocrlf may check the file out as CRLF while
    // the generator always emits LF, which must not fail the drift comparison.
    const normalize = (s: string): string => s.replace(/\r\n/g, '\n');
    expect(normalize(generateEngineApiMarkdown())).toBe(normalize(committed));
  });
});
