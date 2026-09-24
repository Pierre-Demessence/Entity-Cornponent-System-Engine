import type { Noise1D, Noise2D, Noise3D } from './noise';

import { describe, expect, it } from 'vitest';

import {
  fbm1D,
  fbm2D,
  fbm3D,
  perlin1D,
  perlin2D,
  perlin3D,
  simplex2D,
  simplex3D,
  valueNoise1D,
  valueNoise2D,
  valueNoise3D,
} from './noise';

/**
 * The sampler tables are typed with the module's own exported types, so a
 * signature change in `noise.ts` breaks this file at compile time. fBm takes an
 * options object, so it is wrapped to share the sampler contracts.
 */
const SAMPLERS_1D: Array<[string, Noise1D]> = [
  ['valueNoise1D', valueNoise1D],
  ['perlin1D', perlin1D],
  ['fbm1D', (x, seed) => fbm1D(x, { seed })],
];

const SAMPLERS_2D: Array<[string, Noise2D]> = [
  ['valueNoise2D', valueNoise2D],
  ['perlin2D', perlin2D],
  ['simplex2D', simplex2D],
  ['fbm2D', (x, y, seed) => fbm2D(x, y, { seed })],
];

const SAMPLERS_3D: Array<[string, Noise3D]> = [
  ['valueNoise3D', valueNoise3D],
  ['perlin3D', perlin3D],
  ['simplex3D', simplex3D],
  ['fbm3D', (x, y, z, seed) => fbm3D(x, y, z, { seed })],
];

const CELLS_1D = 64;
const CELLS_2D = 8;
const STEPS_PER_CELL = 16;

/**
 * A 3D sweep is cubic, so it gets its own cell/step pair: `8 x 8` covers eight
 * cells per axis at 262k samples, where the 2D pair costs 16k. Span matters
 * more than resolution here — a peak has to land in *some* cell, not be
 * resolved inside one.
 */
const CELLS_3D = 8;
const STEPS_PER_CELL_3D = 8;

/**
 * Sample one point per step across `cells` unit lattice cells.
 *
 * The 1D sweep spans many cells on purpose: `perlin1D`'s peak needs a cell
 * whose two gradients point opposite ways, which is a coin flip per cell —
 * a short sweep can miss it entirely and understate the range.
 */
function sweep1D(fn: Noise1D, cells = CELLS_1D, perCell = STEPS_PER_CELL): number[] {
  const out: number[] = [];
  const samples = cells * perCell;
  for (let i = 0; i < samples; i++)
    out.push(fn(i / perCell, 0));
  return out;
}

function sweep2D(fn: Noise2D, cells = CELLS_2D): number[] {
  const out: number[] = [];
  const n = cells * STEPS_PER_CELL;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++)
      out.push(fn(i / STEPS_PER_CELL, j / STEPS_PER_CELL, 0));
  }
  return out;
}

function sweep3D(fn: Noise3D, cells = CELLS_3D): number[] {
  const out: number[] = [];
  const n = cells * STEPS_PER_CELL_3D;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++)
        out.push(fn(i / STEPS_PER_CELL_3D, j / STEPS_PER_CELL_3D, k / STEPS_PER_CELL_3D, 0));
    }
  }
  return out;
}

function minMax(values: number[]): { max: number; min: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min)
      min = v;
    if (v > max)
      max = v;
  }
  return { max, min };
}

describe('coherent-noise contracts (all samplers)', () => {
  it.each(SAMPLERS_1D)('%s stays within [-1, 1]', (_name, fn) => {
    for (const v of sweep1D(fn)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it.each(SAMPLERS_2D)('%s stays within [-1, 1]', (_name, fn) => {
    for (const v of sweep2D(fn)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it.each(SAMPLERS_1D)('%s uses most of the range, not a narrow band', (_name, fn) => {
    const { max, min } = minMax(sweep1D(fn));
    expect(max).toBeGreaterThan(0.5);
    expect(min).toBeLessThan(-0.5);
  });

  it.each(SAMPLERS_2D)('%s uses most of the range, not a narrow band', (_name, fn) => {
    const { max, min } = minMax(sweep2D(fn));
    expect(max).toBeGreaterThan(0.5);
    expect(min).toBeLessThan(-0.5);
  });

  it.each(SAMPLERS_1D)('%s is pure — repeat calls agree', (_name, fn) => {
    for (const x of [0.3, 1.7, 12.25, -4.5])
      expect(fn(x, 9)).toBe(fn(x, 9));
  });

  it.each(SAMPLERS_2D)('%s is pure — repeat calls agree', (_name, fn) => {
    for (const [x, y] of [[0.3, 4.1], [1.7, 0.9], [12.25, -3.5], [-4.5, 2.5]])
      expect(fn(x, y, 9)).toBe(fn(x, y, 9));
  });

  it.each(SAMPLERS_1D)('%s varies with the seed', (_name, fn) => {
    const a = sweep1D((x, _s) => fn(x, 1));
    const b = sweep1D((x, _s) => fn(x, 2));
    expect(a).not.toEqual(b);
  });

  it.each(SAMPLERS_2D)('%s varies with the seed', (_name, fn) => {
    const a = sweep2D((x, y, _s) => fn(x, y, 1));
    const b = sweep2D((x, y, _s) => fn(x, y, 2));
    expect(a).not.toEqual(b);
  });

  it.each(SAMPLERS_1D)('%s is continuous — a tiny step moves the value a little', (_name, fn) => {
    for (const x of [0.5, 3.25, 8.75]) {
      const delta = Math.abs(fn(x + 1e-3, 5) - fn(x, 5));
      expect(delta).toBeLessThan(0.05);
    }
  });

  it.each(SAMPLERS_2D)('%s is continuous — a tiny step moves the value a little', (_name, fn) => {
    for (const [x, y] of [[0.5, 2.25], [3.25, 0.75], [8.75, 4.5]]) {
      const delta = Math.abs(fn(x + 1e-3, y + 1e-3, 5) - fn(x, y, 5));
      expect(delta).toBeLessThan(0.05);
    }
  });

  it.each(SAMPLERS_3D)('%s stays within [-1, 1]', (_name, fn) => {
    // Folded through `minMax` rather than asserting per sample: a 3D sweep is
    // 262k values, and 2M `expect` calls cost more than the sampling does.
    // The tolerance absorbs `perlin3D`'s ulp-level overshoot at aligned cell
    // centres (see its doc), which a sweep over more cells can land on.
    const { max, min } = minMax(sweep3D(fn));
    expect(min).toBeGreaterThanOrEqual(-1 - 1e-12);
    expect(max).toBeLessThanOrEqual(1 + 1e-12);
  });

  it.each(SAMPLERS_3D)('%s uses most of the range, not a narrow band', (_name, fn) => {
    const { max, min } = minMax(sweep3D(fn));
    expect(max).toBeGreaterThan(0.5);
    expect(min).toBeLessThan(-0.5);
  });

  it.each(SAMPLERS_3D)('%s is pure — repeat calls agree', (_name, fn) => {
    for (const [x, y, z] of [[0.3, 4.1, 2.5], [1.7, 0.9, 3.3], [12.25, -3.5, 0.75], [-4.5, 2.5, 6.5]])
      expect(fn(x, y, z, 9)).toBe(fn(x, y, z, 9));
  });

  it.each(SAMPLERS_3D)('%s varies with the seed', (_name, fn) => {
    // A coarse sweep on purpose: any seed change alters the whole field, and
    // comparing two 3D sweeps at full resolution is the slowest thing here.
    const a = sweep3D((x, y, z, _s) => fn(x, y, z, 1), 3);
    const b = sweep3D((x, y, z, _s) => fn(x, y, z, 2), 3);
    expect(a).not.toEqual(b);
  });

  it.each(SAMPLERS_3D)('%s is continuous — a tiny step moves the value a little', (_name, fn) => {
    for (const [x, y, z] of [[0.5, 2.25, 1.75], [3.25, 0.75, 8.5], [8.75, 4.5, 0.25]]) {
      const delta = Math.abs(fn(x + 1e-3, y + 1e-3, z + 1e-3, 5) - fn(x, y, z, 5));
      expect(delta).toBeLessThan(0.05);
    }
  });
});

describe('valueNoise1D', () => {
  it('interpolates lattice values instead of crossing zero at every integer', () => {
    const lattice = [3, 4, 5, 6].map(i => valueNoise1D(i, 7));
    expect(lattice.some(v => Math.abs(v) > 0.05)).toBe(true);
  });

  it('is smooth across a cell boundary', () => {
    const before = valueNoise1D(2 - 1e-6, 3);
    const after = valueNoise1D(2 + 1e-6, 3);
    expect(Math.abs(after - before)).toBeLessThan(1e-4);
  });
});

describe('valueNoise2D', () => {
  it('is smooth across a cell boundary on both axes', () => {
    const before = valueNoise2D(3 - 1e-6, 4 - 1e-6, 2);
    const after = valueNoise2D(3 + 1e-6, 4 + 1e-6, 2);
    expect(Math.abs(after - before)).toBeLessThan(1e-4);
  });
});

describe('valueNoise3D', () => {
  it('is smooth across a cell boundary on all three axes', () => {
    const before = valueNoise3D(3 - 1e-6, 4 - 1e-6, 5 - 1e-6, 2);
    const after = valueNoise3D(3 + 1e-6, 4 + 1e-6, 5 + 1e-6, 2);
    expect(Math.abs(after - before)).toBeLessThan(1e-4);
  });
});

describe('perlin1D', () => {
  it('is exactly 0 at every integer coordinate', () => {
    for (let i = -5; i <= 20; i++)
      expect(perlin1D(i, 42)).toBe(0);
  });

  it('is 0 at integer coordinates for every seed', () => {
    for (const seed of [0, 1, 999, -12])
      expect(perlin1D(7, seed)).toBe(0);
  });
});

describe('perlin2D', () => {
  it('is exactly 0 at every integer lattice point', () => {
    for (let i = -3; i <= 5; i++) {
      for (let j = -3; j <= 5; j++)
        expect(perlin2D(i, j, 11)).toBe(0);
    }
  });
});

describe('perlin3D', () => {
  it('is exactly 0 at every integer lattice point', () => {
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        for (let k = -3; k <= 3; k++)
          expect(perlin3D(i, j, k, 11)).toBe(0);
      }
    }
  });
});

describe('simplex2D', () => {
  it('is finite across negative coordinates, where the skew goes negative', () => {
    for (const i of [0, 1, 2, 3]) {
      for (const j of [0, 1, 2, 3])
        expect(Number.isFinite(simplex2D(i - 6.5, j - 6.5, 4))).toBe(true);
    }
  });

  it('differs from perlin2D — it is a different lattice', () => {
    expect(simplex2D(1.3, 2.7, 0)).not.toBe(perlin2D(1.3, 2.7, 0));
  });

  it('uses the canonical scaling, whose practical peak is about 0.71', () => {
    // Pinned so an accidental rescale is caught: the value is documented as
    // using roughly 71% of the range.
    const { max, min } = minMax(sweep2D(simplex2D));
    expect(max).toBeGreaterThan(0.6);
    expect(max).toBeLessThan(0.75);
    expect(min).toBeLessThan(-0.6);
    expect(min).toBeGreaterThan(-0.75);
  });
});

describe('simplex3D', () => {
  it('is finite across negative coordinates, where the skew goes negative', () => {
    for (const i of [0, 1, 2, 3]) {
      for (const j of [0, 1, 2, 3]) {
        for (const k of [0, 1, 2, 3])
          expect(Number.isFinite(simplex3D(i - 6.5, j - 6.5, k - 6.5, 4))).toBe(true);
      }
    }
  });

  it('differs from perlin3D — it is a different lattice', () => {
    expect(simplex3D(1.3, 2.7, 0.9, 0)).not.toBe(perlin3D(1.3, 2.7, 0.9, 0));
  });

  it('uses the canonical scaling, whose practical peak is about 0.69', () => {
    // Pinned so an accidental rescale is caught: the value is documented as
    // using roughly 69% of the range.
    const { max, min } = minMax(sweep3D(simplex3D));
    expect(max).toBeGreaterThan(0.6);
    expect(max).toBeLessThan(0.75);
    expect(min).toBeLessThan(-0.6);
    expect(min).toBeGreaterThan(-0.75);
  });
});

describe('fbm1D', () => {
  it('matches its source exactly at one octave', () => {
    for (const x of [0.4, 2.6, 7.1]) {
      expect(fbm1D(x, { octaves: 1, seed: 3 })).toBeCloseTo(perlin1D(x, 3), 12);
      expect(fbm1D(x, { frequency: 4, octaves: 1, seed: 3 })).toBeCloseTo(perlin1D(x * 4, 3), 12);
    }
  });

  it('accepts a different base sampler', () => {
    expect(fbm1D(1.5, { octaves: 1, seed: 2, source: valueNoise1D }))
      .toBeCloseTo(valueNoise1D(1.5, 2), 12);
  });

  it('stays in range for many octaves at a low gain', () => {
    for (const v of sweep1D(x => fbm1D(x, { gain: 0.25, octaves: 8 })))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('returns 0 for a non-positive octave count', () => {
    expect(fbm1D(3.5, { octaves: 0 })).toBe(0);
    expect(fbm1D(3.5, { octaves: -2 })).toBe(0);
  });

  it('floors a fractional octave count', () => {
    expect(fbm1D(3.5, { octaves: 1.9 })).toBe(fbm1D(3.5, { octaves: 1 }));
  });

  it('stays in range for a negative gain without collapsing to zero', () => {
    for (const gain of [-0.5, -0.9, -1]) {
      const values = sweep1D(x => fbm1D(x, { gain, octaves: 4 }));
      for (const v of values)
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      // A regression that clamped the result to 0 would still pass the bound.
      expect(values.some(v => Math.abs(v) > 0.1)).toBe(true);
    }
  });

  it('stays in range for an amplifying gain', () => {
    for (const v of sweep1D(x => fbm1D(x, { gain: 2, octaves: 4 })))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});

describe('fbm2D', () => {
  it('matches its source exactly at one octave', () => {
    expect(fbm2D(2.25, 3.75, { octaves: 1, seed: 5 })).toBeCloseTo(perlin2D(2.25, 3.75, 5), 12);
  });

  it('scales the input by frequency', () => {
    expect(fbm2D(1, 2, { frequency: 3, octaves: 1, seed: 0 }))
      .toBeCloseTo(perlin2D(3, 6, 0), 12);
  });

  it('stays in range for many octaves at a steep lacunarity', () => {
    for (const v of sweep2D((x, y, _s) => fbm2D(x, y, { gain: 0.45, lacunarity: 2.5, octaves: 8 })))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('returns 0 for a non-positive octave count', () => {
    expect(fbm2D(1, 2, { octaves: 0 })).toBe(0);
  });

  it('stays in range for a negative gain', () => {
    for (const v of sweep2D((x, y, _s) => fbm2D(x, y, { gain: -0.5, octaves: 4 })))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('adds detail as octaves increase', () => {
    const coarse = sweep2D((x, y, _s) => fbm2D(x, y, { octaves: 1 }), 2);
    const detailed = sweep2D((x, y, _s) => fbm2D(x, y, { octaves: 6 }), 2);
    expect(detailed).not.toEqual(coarse);
  });
});

describe('fbm3D', () => {
  it('matches its source exactly at one octave', () => {
    expect(fbm3D(2.25, 3.75, 1.5, { octaves: 1, seed: 5 }))
      .toBeCloseTo(perlin3D(2.25, 3.75, 1.5, 5), 12);
  });

  it('scales every input by frequency', () => {
    expect(fbm3D(1, 2, 3, { frequency: 3, octaves: 1, seed: 0 }))
      .toBeCloseTo(perlin3D(3, 6, 9, 0), 12);
  });

  it('accepts a different base sampler', () => {
    expect(fbm3D(1.5, 2.5, 3.5, { octaves: 1, seed: 2, source: valueNoise3D }))
      .toBeCloseTo(valueNoise3D(1.5, 2.5, 3.5, 2), 12);
  });

  it('stays in range for many octaves at a steep lacunarity', () => {
    // Octaves multiply the sample count eightfold, so the 3D fBm range checks
    // take the cheap 2-cell sweep: this is a bound, not a peak hunt.
    for (const v of sweep3D((x, y, z, _s) => fbm3D(x, y, z, { gain: 0.45, lacunarity: 2.5, octaves: 8 }), 2))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('returns 0 for a non-positive octave count', () => {
    expect(fbm3D(1, 2, 3, { octaves: 0 })).toBe(0);
  });

  it('stays in range for a negative gain', () => {
    for (const v of sweep3D((x, y, z, _s) => fbm3D(x, y, z, { gain: -0.5, octaves: 4 }), 2))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('adds detail as octaves increase', () => {
    const coarse = sweep3D((x, y, z, _s) => fbm3D(x, y, z, { octaves: 1 }), 2);
    const detailed = sweep3D((x, y, z, _s) => fbm3D(x, y, z, { octaves: 6 }), 2);
    expect(detailed).not.toEqual(coarse);
  });
});

describe('fbm octave handling', () => {
  it.each([
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['NaN', Number.NaN],
    ['zero', 0],
    ['negative', -3],
  ])('returns 0 for a %s octave count instead of hanging', (_name, octaves) => {
    expect(fbm1D(1.5, { octaves })).toBe(0);
    expect(fbm2D(1.5, 2.5, { octaves })).toBe(0);
    expect(fbm3D(1.5, 2.5, 3.5, { octaves })).toBe(0);
  });

  it('caps the octave count at exactly 32', () => {
    // Non-dyadic coordinates on purpose: a dyadic `x` such as `9.5` lands on an
    // integer lattice point for every octave past the first, and `perlin` is
    // exactly `0` at integers — which would make these comparisons true for the
    // wrong reason.
    for (const x of [0.7, 3.3, 1.1]) {
      expect(fbm1D(x, { octaves: 10_000 })).toBe(fbm1D(x, { octaves: 32 }));
      expect(fbm2D(x, x, { octaves: 10_000 })).toBe(fbm2D(x, x, { octaves: 32 }));
      expect(fbm3D(x, x, x, { octaves: 10_000 })).toBe(fbm3D(x, x, x, { octaves: 32 }));
      // 32 is distinguishable from 31, so the cap is not lower than 32...
      expect(fbm1D(x, { octaves: 32 })).not.toBe(fbm1D(x, { octaves: 31 }));
      expect(fbm2D(x, x, { octaves: 32 })).not.toBe(fbm2D(x, x, { octaves: 31 }));
      expect(fbm3D(x, x, x, { octaves: 32 })).not.toBe(fbm3D(x, x, x, { octaves: 31 }));
      // ...and 33 is indistinguishable from 32, so it is not higher either.
      expect(fbm1D(x, { octaves: 33 })).toBe(fbm1D(x, { octaves: 32 }));
      expect(fbm3D(x, x, x, { octaves: 33 })).toBe(fbm3D(x, x, x, { octaves: 32 }));
    }
  });

  it.each([
    ['an amplifying gain', { gain: 1e12, octaves: 32 }, 0.7],
    ['a runaway lacunarity', { lacunarity: 1e300 }, 0.7],
    ['an infinite lacunarity', { lacunarity: Infinity }, 3.3],
    ['an infinite frequency', { frequency: Infinity }, 0.7],
    ['a NaN frequency', { frequency: Number.NaN }, 3.3],
    ['an overflowing coordinate', { octaves: 32 }, 1e300],
  ])('falls back to a safe value for %s instead of NaN', (_name, options, x) => {
    // Any non-finite intermediate — from options or from the coordinate itself
    // — must come back as the documented fallback value: finite, in range, and
    // not a silent NaN.
    for (const v of [
      fbm1D(x, options),
      fbm1D(Infinity, options),
      fbm2D(x, x, options),
      fbm3D(x, x, x, options),
      fbm3D(Infinity, Infinity, Infinity, options),
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(v).toBe(0);
    }
  });

  it('offsets the seed per octave, so octaves are not copies of each other', () => {
    // With lacunarity 1 and gain -1, octave 2 samples the same coordinate as
    // octave 1 with the opposite amplitude. Without a per-octave seed offset
    // the two contributions would cancel to exactly 0 everywhere.
    const values = sweep1D(x => fbm1D(x, { gain: -1, lacunarity: 1, octaves: 2 }));
    expect(values.some(v => v !== 0)).toBe(true);
  });
});

describe('edge-case inputs', () => {
  it.each(SAMPLERS_1D)('%s stays in range for a negative or non-integer seed', (_name, fn) => {
    for (const seed of [-1, -9999, 0.5, 2.25]) {
      for (const x of [0.5, 4.25, 11.75])
        expect(Math.abs(fn(x, seed))).toBeLessThanOrEqual(1);
    }
  });

  it.each(SAMPLERS_2D)('%s stays in range for a negative or non-integer seed', (_name, fn) => {
    for (const seed of [-1, -9999, 0.5, 2.25]) {
      for (const x of [0.5, 4.25, 11.75])
        expect(Math.abs(fn(x, x, seed))).toBeLessThanOrEqual(1);
    }
  });

  it.each(SAMPLERS_3D)('%s stays in range for a negative or non-integer seed', (_name, fn) => {
    for (const seed of [-1, -9999, 0.5, 2.25]) {
      for (const x of [0.5, 4.25, 11.75])
        expect(Math.abs(fn(x, x, x, seed))).toBeLessThanOrEqual(1);
    }
  });

  it.each(SAMPLERS_1D)('%s is finite and bounded at very large coordinates', (_name, fn) => {
    // Past 2^31 `Math.imul` wraps, so this is where a naive hash breaks.
    for (const x of [2 ** 31, 2 ** 31 + 0.5, 2 ** 40, -(2 ** 31)]) {
      const v = fn(x, 3);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it.each(SAMPLERS_2D)('%s is finite and bounded at very large coordinates', (_name, fn) => {
    for (const x of [2 ** 31, 2 ** 40, -(2 ** 31)]) {
      const v = fn(x, x, 3);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it.each(SAMPLERS_3D)('%s is finite and bounded at very large coordinates', (_name, fn) => {
    for (const x of [2 ** 31, 2 ** 40, -(2 ** 31)]) {
      const v = fn(x, x, x, 3);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('never returns a signed zero', () => {
    for (let i = -8; i <= 8; i++) {
      expect(Object.is(perlin1D(i, 42), 0)).toBe(true);
      expect(Object.is(perlin1D(i, 7), 0)).toBe(true);
      expect(Object.is(perlin2D(i, i, 13), 0)).toBe(true);
      expect(Object.is(perlin3D(i, i, i, 13), 0)).toBe(true);
      expect(Object.is(fbm1D(i, { octaves: 1, seed: 5 }), 0)).toBe(true);
    }
  });

  it('is not pinned to zero at integers for value noise or simplex', () => {
    const lattice2D = [[3, 3], [4, 7], [9, 2], [5, 5]] as const;
    expect(lattice2D.some(([i, j]) => valueNoise2D(i, j, 6) !== 0)).toBe(true);
    expect(lattice2D.some(([i, j]) => simplex2D(i, j, 6) !== 0)).toBe(true);
    const lattice3D = [[3, 3, 3], [4, 7, 2], [9, 2, 5], [5, 5, 8]] as const;
    expect(lattice3D.some(([i, j, k]) => valueNoise3D(i, j, k, 6) !== 0)).toBe(true);
    expect(lattice3D.some(([i, j, k]) => simplex3D(i, j, k, 6) !== 0)).toBe(true);
    expect([3, 4, 5, 6].some(i => valueNoise1D(i, 6) !== 0)).toBe(true);
  });

  it('makes valueNoise2D the y = 0 slice of valueNoise1D', () => {
    for (const x of [0.5, 2.25, 7.75, -3.5])
      expect(valueNoise2D(x, 0, 7)).toBe(valueNoise1D(x, 7));
  });

  it('makes valueNoise3D the z = 0 plane of valueNoise2D', () => {
    for (const x of [0.5, 2.25, 7.75, -3.5]) {
      for (const y of [0.25, 3.5, -1.75])
        expect(valueNoise3D(x, y, 0, 7)).toBe(valueNoise2D(x, y, 7));
    }
  });

  it.each([
    ['frequency 0', { frequency: 0 }],
    ['negative frequency', { frequency: -3 }],
    ['gain 0', { gain: 0 }],
    ['gain 1', { gain: 1 }],
    ['lacunarity below 1', { lacunarity: 0.5 }],
    ['lacunarity 1', { lacunarity: 1 }],
  ])('fbm stays in range for %s', (_name, options) => {
    for (const v of sweep1D(x => fbm1D(x, { octaves: 5, ...options })))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    for (const v of sweep2D((x, y, _s) => fbm2D(x, y, { octaves: 5, ...options })))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    for (const v of sweep3D((x, y, z, _s) => fbm3D(x, y, z, { octaves: 5, ...options }), 2))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('fbm stays in range across negative coordinates', () => {
    for (const i of [0, 1, 2, 3]) {
      for (const j of [0, 1, 2, 3]) {
        const v = fbm2D(i - 8.5, j - 8.5, { octaves: 6, seed: -4 });
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
        const v3 = fbm3D(i - 8.5, j - 8.5, i - j - 3.5, { octaves: 6, seed: -4 });
        expect(Math.abs(v3)).toBeLessThanOrEqual(1);
      }
    }
    for (const v of sweep1D(x => fbm1D(x - 50, { octaves: 6, seed: -4 })))
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});
