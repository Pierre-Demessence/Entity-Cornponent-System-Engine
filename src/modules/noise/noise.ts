/**
 * Coherent noise — the smooth, seed-reproducible random field under
 * terrain, water shaping, texture variation and clouds. Every sampler is a
 * pure function returning `[-1, 1]` for finite inputs, so any module or app
 * can import it freely. **Depends on nothing.**
 *
 * For *white* noise (uniform, uncorrelated samples) use
 * [`modules/rng`](../rng/README.md) — that is a different primitive.
 */

/**
 * 1D coherent-noise sampler over a seed. Returns a value in `[-1, 1]` for
 * finite input.
 */
export type Noise1D = (x: number, seed: number) => number;

/**
 * 2D coherent-noise sampler over a seed. Returns a value in `[-1, 1]` for
 * finite input.
 */
export type Noise2D = (x: number, y: number, seed: number) => number;

const HASH_X = 0x27D4EB2D;
const HASH_Y = 0x165667B1;
const TAU = Math.PI * 2;

// Skew/unskew factors for the 2D triangular lattice (Perlin's simplex).
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const DEFAULT_GAIN = 0.5;
const DEFAULT_LACUNARITY = 2;
const DEFAULT_OCTAVES = 4;

/**
 * Cap for `octaves`. A safety bound, not a precision floor: with the default
 * `gain` a 33rd octave would still move the result. 32 is far past anything a
 * game needs, and it keeps a pathological count (or `Infinity`) from spinning
 * the octave loop.
 */
const MAX_OCTAVES = 32;

/** Floor `octaves` into `[0, MAX_OCTAVES]`; non-finite input yields `0`. */
function clampOctaves(octaves: number): number {
  if (!Number.isFinite(octaves))
    return 0;
  return Math.min(Math.max(Math.floor(octaves), 0), MAX_OCTAVES);
}

/** Perlin's quintic fade: zero 1st and 2nd derivatives at both ends. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Normalize `-0` to `0`. Signed zero is a legal IEEE float but leaks into
 * `Object.is`, `Math.sign` and `1 / v`, so a contract promising "exactly zero
 * at lattice points" should mean `+0`.
 */
function zeroSafe(v: number): number {
  return v === 0 ? 0 : v;
}

/**
 * Hash an integer lattice coordinate plus seed into `[0, 1)`. The `Math.imul`
 * mixes keep the result well-distributed over the coordinate ranges a game
 * lattice uses; this is a hash, not a cipher.
 */
function hashLattice(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, HASH_X) ^ Math.imul(y, HASH_Y)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
  h = Math.imul(h ^ (h >>> 13), 0x297A2D39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Unit-length gradient angle for a lattice point, in radians. */
function gradientAngle(seed: number, x: number, y: number): number {
  return hashLattice(seed, x, y) * TAU;
}

function cornerContribution(seed: number, i: number, j: number, dx: number, dy: number): number {
  let t = 0.5 - dx * dx - dy * dy;
  if (t <= 0)
    return 0;
  t *= t;
  const angle = gradientAngle(seed, i, j);
  return t * t * (Math.cos(angle) * dx + Math.sin(angle) * dy);
}

/**
 * Value noise, 1D: lattice values interpolated with the quintic fade.
 * The cheapest family and the most "blocky" — good for cheap variation,
 * less so for terrain silhouettes.
 */
export function valueNoise1D(x: number, seed = 0): number {
  const xi = Math.floor(x);
  const t = fade(x - xi);
  const a = hashLattice(seed, xi, 0);
  const b = hashLattice(seed, xi + 1, 0);
  return zeroSafe(mix(a, b, t) * 2 - 1);
}

/** Value noise, 2D: faded bilinear interpolation of hashed lattice values. */
export function valueNoise2D(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = fade(x - xi);
  const ty = fade(y - yi);
  const top = mix(hashLattice(seed, xi, yi), hashLattice(seed, xi + 1, yi), tx);
  const bottom = mix(hashLattice(seed, xi, yi + 1), hashLattice(seed, xi + 1, yi + 1), tx);
  return zeroSafe(mix(top, bottom, ty) * 2 - 1);
}

/**
 * Perlin gradient noise, 1D. Exactly `0` at every integer coordinate — the
 * property that makes it well-behaved when a scrolling world samples it.
 */
export function perlin1D(x: number, seed = 0): number {
  const xi = Math.floor(x);
  const t = x - xi;
  const ga = hashLattice(seed, xi, 0) < 0.5 ? -1 : 1;
  const gb = hashLattice(seed, xi + 1, 0) < 0.5 ? -1 : 1;
  // Unit ±1 gradients peak at 0.5 across a cell, so double to fill [-1, 1].
  return zeroSafe(mix(ga * t, gb * (t - 1), fade(t)) * 2);
}

/**
 * Perlin gradient noise, 2D. Exactly `0` at every integer lattice point.
 * Gradients are unit-length, so the theoretical peak is `sqrt(2)/2` — scaled
 * here so that peak fills `[-1, 1]`. In practice a wide sweep reaches roughly
 * `0.9`, since all four gradients rarely align with the sample at once.
 */
export function perlin2D(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;

  const g00 = gradientAngle(seed, xi, yi);
  const g10 = gradientAngle(seed, xi + 1, yi);
  const g01 = gradientAngle(seed, xi, yi + 1);
  const g11 = gradientAngle(seed, xi + 1, yi + 1);

  const n00 = Math.cos(g00) * tx + Math.sin(g00) * ty;
  const n10 = Math.cos(g10) * (tx - 1) + Math.sin(g10) * ty;
  const n01 = Math.cos(g01) * tx + Math.sin(g01) * (ty - 1);
  const n11 = Math.cos(g11) * (tx - 1) + Math.sin(g11) * (ty - 1);

  const top = mix(n00, n10, fade(tx));
  const bottom = mix(n01, n11, fade(tx));
  return zeroSafe(mix(top, bottom, fade(ty)) * Math.SQRT2);
}

/**
 * Ken Perlin's simplex noise, 2D — gradient noise on a triangular lattice,
 * so it has less directional bias than `perlin2D` and no axis-aligned
 * artifacts. The usual choice for organic 2D terrain.
 *
 * Uses the canonical `70` scaling; paired with unit-length gradients (as here)
 * that puts the practical peak at about `0.71` rather than `1` — still inside
 * `[-1, 1]`, but scale by amplitude if you need the full swing.
 */
export function simplex2D(x: number, y: number, seed = 0): number {
  // Skew into the triangular lattice to find the cell, then unskew to get
  // the offsets to that triangle's three corners.
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);

  let i1 = 0;
  let j1 = 1;
  if (x0 > y0) {
    i1 = 1;
    j1 = 0;
  }

  const n
    = cornerContribution(seed, i, j, x0, y0)
      + cornerContribution(seed, i + i1, j + j1, x0 - i1 + G2, y0 - j1 + G2)
      + cornerContribution(seed, i + 1, j + 1, x0 - 1 + 2 * G2, y0 - 1 + 2 * G2);

  // Perlin's empirical scaling for the triangular-lattice construction.
  return zeroSafe(n * 70);
}

/** Fractal options for `fbm1D`. */
export interface Fbm1DOptions {
  /** Base frequency multiplier on `x`. Default `1`. */
  frequency?: number;
  /**
   * Amplitude multiplier per octave. Higher keeps more high-frequency detail
   * (rougher); lower is smoother. Default `0.5`.
   */
  gain?: number;
  /** Frequency growth per octave. Default `2`. */
  lacunarity?: number;
  /** Number of summed octaves, floored and capped at 32. Default `4`. */
  octaves?: number;
  /** Seed, offset per octave so octaves are decorrelated. Default `0`. */
  seed?: number;
  /** Base sampler. Default `perlin1D`. */
  source?: Noise1D;
}

/** Fractal options for `fbm2D`. */
export interface Fbm2DOptions {
  /** Base frequency multiplier on the input coordinates. Default `1`. */
  frequency?: number;
  /**
   * Amplitude multiplier per octave. Higher keeps more high-frequency detail
   * (rougher); lower is smoother. Default `0.5`.
   */
  gain?: number;
  /** Frequency growth per octave. Default `2`. */
  lacunarity?: number;
  /** Number of summed octaves, floored and capped at 32. Default `4`. */
  octaves?: number;
  /** Seed, offset per octave so octaves are decorrelated. Default `0`. */
  seed?: number;
  /** Base sampler. Default `perlin2D`. */
  source?: Noise2D;
}

/**
 * Fractal Brownian motion, 1D: octaves of `source` summed at growing
 * frequency and shrinking amplitude, normalized by the summed **absolute**
 * amplitude so the result stays in `[-1, 1]` for any finite option combination
 * — including a negative `gain`, which yields a difference-of-octaves texture.
 * `octaves` is floored and capped at 32, and an overflow on any axis (runaway
 * `gain` / `lacunarity` / `frequency`, non-finite coordinate) yields `0` rather
 * than `NaN`.
 * This is the shape terrain, water and clouds actually sample.
 */
export function fbm1D(x: number, options: Fbm1DOptions = {}): number {
  const {
    frequency = 1,
    gain = DEFAULT_GAIN,
    lacunarity = DEFAULT_LACUNARITY,
    octaves = DEFAULT_OCTAVES,
    seed = 0,
    source = perlin1D,
  } = options;

  const count = clampOctaves(octaves);
  if (count < 1)
    return 0;

  let amplitude = 1;
  let freq = frequency;
  let sum = 0;
  let total = 0;
  for (let o = 0; o < count; o++) {
    sum += source(x * freq, seed + o) * amplitude;
    total += Math.abs(amplitude);
    amplitude *= gain;
    freq *= lacunarity;
  }
  const result = sum / total;
  // A runaway `gain`, `lacunarity` or `frequency` — or a non-finite or
  // overflowing coordinate — leaves the intermediate non-finite. Fall back to
  // the safe value rather than NaN.
  return Number.isFinite(result) ? zeroSafe(result) : 0;
}

/** Fractal Brownian motion, 2D — the 2D sibling of `fbm1D`. */
export function fbm2D(x: number, y: number, options: Fbm2DOptions = {}): number {
  const {
    frequency = 1,
    gain = DEFAULT_GAIN,
    lacunarity = DEFAULT_LACUNARITY,
    octaves = DEFAULT_OCTAVES,
    seed = 0,
    source = perlin2D,
  } = options;

  const count = clampOctaves(octaves);
  if (count < 1)
    return 0;

  let amplitude = 1;
  let freq = frequency;
  let sum = 0;
  let total = 0;
  for (let o = 0; o < count; o++) {
    sum += source(x * freq, y * freq, seed + o) * amplitude;
    total += Math.abs(amplitude);
    amplitude *= gain;
    freq *= lacunarity;
  }
  // See `fbm1D`: any non-finite intermediate falls back to the safe value.
  const result = sum / total;
  return Number.isFinite(result) ? zeroSafe(result) : 0;
}
