/**
 * The public-API JSDoc coverage ratchet. Two guarantees:
 *
 *  1. Every public **function and class** has a JSDoc summary — a permanent
 *     floor, since those are the exports whose `/api/` page and IDE hover most
 *     need a description.
 *  2. The total undocumented count may only shrink (`<= BASELINE`) — a new
 *     export without a summary pushes over the ceiling and fails, while
 *     documenting more only creates headroom.
 *
 * Lower `BASELINE` as interfaces/types/consts are documented. The backlog is the
 * `— —` rows in `docs/agent/engine-api.md`.
 */
import { describe, expect, it } from 'vitest';

import { undocumentedExports } from './jsdoc-coverage';

// Undocumented public exports remaining after the functions/classes were
// documented. This number may only go down.
const BASELINE = 140;

const undocumented = undocumentedExports();
function format(list: typeof undocumented): string {
  return list.map(u => `${u.importPath} ${u.name} (${u.kind})`).sort().join('\n');
}

describe('public API JSDoc coverage', () => {
  it('documents every public function and class', () => {
    const behavioural = undocumented.filter(u => u.kind === 'fn' || u.kind === 'class');
    expect(format(behavioural)).toBe('');
  });

  it(`keeps undocumented exports at or below ${BASELINE} (ratchet)`, () => {
    expect(
      undocumented.length,
      `${undocumented.length} undocumented exports (baseline ${BASELINE}):\n${format(undocumented)}`,
    ).toBeLessThanOrEqual(BASELINE);
  });
});
