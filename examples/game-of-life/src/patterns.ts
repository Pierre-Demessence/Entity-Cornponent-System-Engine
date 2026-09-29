import type { Point } from '@pierre/ecs/modules/grid-based';

export interface Pattern {
  name: string;
  cells: readonly Point[];
  h: number;
  w: number;
}

/**
 * Decodes the body of a run-length-encoded pattern (the format LifeWiki and
 * Golly share): `b` dead, `o` alive, `$` end of row, `!` end, each optionally
 * preceded by a run count.
 */
export function parseRle(name: string, rle: string): Pattern {
  const cells: Point[] = [];
  let x = 0;
  let y = 0;
  let w = 0;
  let run = '';
  for (const ch of rle.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') {
      run += ch;
      continue;
    }
    const n = run === '' ? 1 : Number(run);
    run = '';
    if (ch === 'o') {
      for (let i = 0; i < n; i++) cells.push({ x: x + i, y });
      x += n;
    }
    else if (ch === 'b') {
      x += n;
    }
    else if (ch === '$') {
      y += n;
      x = 0;
    }
    else if (ch === '!') {
      break;
    }
    w = Math.max(w, x);
  }
  return { name, cells, h: y + 1, w };
}

/** Number keys 1–6 stamp these at the centre of the board. */
export const PRESETS: readonly Pattern[] = [
  parseRle('Glider', 'bob$2bo$3o!'),
  parseRle('R-pentomino', 'b2o$2o$bo!'),
  parseRle('Acorn', 'bo$3bo$2o2b3o!'),
  parseRle('Lightweight spaceship', 'bo2bo$o4b$o3bo$4o!'),
  parseRle('Pulsar', `2b3o3b3o2b2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b2$2b3o3b3o2b$o4bobo4bo$
    o4bobo4bo$o4bobo4bo2$2b3o3b3o!`),
  parseRle('Gosper glider gun', `24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$
    2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!`),
];
