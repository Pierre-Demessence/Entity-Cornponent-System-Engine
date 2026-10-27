/**
 * A source of uniform random numbers in `[0, 1)`, matching the contract
 * of `Math.random`. Supplying a deterministic implementation (see
 * {@link makeSeededRng}) makes shuffles and picks reproducible for
 * replays and tests.
 */
export type RandomFn = () => number;

/**
 * A {@link RandomFn} whose position in its sequence can be saved and
 * restored. Reading `state` yields a JSON-safe unsigned 32-bit integer;
 * assigning a previously read value (to this or any other `SeededRng`)
 * resumes the exact sequence from that point.
 */
export interface SeededRng extends RandomFn {
  state: number;
}

/**
 * Deterministic `[0, 1)` generator (mulberry32). The same `seed` always
 * yields the same sequence, so games can record a seed for replays and
 * tests can assert exact outcomes. Save `state` mid-sequence to put it in a
 * save file, and assign it back to resume. Not cryptographically secure.
 */
export function makeSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;
  const rng = (() => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as SeededRng;
  Object.defineProperty(rng, 'state', {
    enumerable: true,
    get: () => state >>> 0,
    set: (value: number) => {
      state = value >>> 0;
    },
  });
  return rng;
}

/**
 * Uniform integer in `[0, maxExclusive)`. Returns `0` when
 * `maxExclusive <= 0`.
 */
export function randomInt(maxExclusive: number, rand: RandomFn = Math.random): number {
  if (maxExclusive <= 0)
    return 0;
  return Math.floor(rand() * maxExclusive);
}

/**
 * Uniform float in `[min, max)`. Returns `min` when `max <= min`.
 */
export function randomFloat(min: number, max: number, rand: RandomFn = Math.random): number {
  if (max <= min)
    return min;
  return min + rand() * (max - min);
}

/**
 * Uniformly pick one element. Returns `undefined` for an empty array.
 */
export function pick<T>(arr: readonly T[], rand: RandomFn = Math.random): T | undefined {
  if (arr.length === 0)
    return undefined;
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * In-place Fisher–Yates shuffle. Returns the same array for chaining.
 */
export function shuffle<T>(arr: T[], rand: RandomFn = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
