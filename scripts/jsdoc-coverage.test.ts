/**
 * The public-API JSDoc coverage ratchet. Two guarantees:
 *
 *  1. Every public **function, class, interface, and type** has a JSDoc
 *     summary — a permanent floor. These are the exports whose `/api/` page and
 *     IDE hover most need a description; only runtime `const`s (component defs,
 *     the easing family) remain a backlog.
 *  2. The total undocumented count may only shrink (`<= BASELINE`) — a new
 *     export without a summary pushes over the ceiling and fails, while
 *     documenting more only creates headroom.
 *
 * Lower `BASELINE` as the remaining consts are documented. The backlog is the
 * `— —` rows in `docs/agent/engine-api.md`.
 */
import { describe, expect, it } from 'vitest';

import { undocumentedExports } from './jsdoc-coverage';

// Undocumented public exports remaining (all `const`s) after the functions,
// classes, interfaces and types were documented. This number may only go down.
const BASELINE = 55;

const undocumented = undocumentedExports();
function format(list: typeof undocumented): string {
  return list.map(u => `${u.importPath} ${u.name} (${u.kind})`).sort().join('\n');
}

// Kinds held to full coverage; `const` is the remaining backlog.
const DOCUMENTED_KINDS = new Set(['fn', 'class', 'interface', 'type']);

describe('public API JSDoc coverage', () => {
  it('documents every public function, class, interface, and type', () => {
    const shaped = undocumented.filter(u => DOCUMENTED_KINDS.has(u.kind));
    expect(format(shaped)).toBe('');
  });

  it(`keeps undocumented exports at or below ${BASELINE} (ratchet)`, () => {
    expect(
      undocumented.length,
      `${undocumented.length} undocumented exports (baseline ${BASELINE}):\n${format(undocumented)}`,
    ).toBeLessThanOrEqual(BASELINE);
  });
});
