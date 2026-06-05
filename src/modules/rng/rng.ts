/**
 * A source of uniform random numbers in `[0, 1)`, matching the contract
 * of `Math.random`. Supplying a deterministic implementation (see
 * {@link makeSeededRng}) makes shuffles and picks reproducible for
 * replays and tests.
 */
export type RandomFn = () => number;

/**
 * Deterministic `[0, 1)` generator (mulberry32). The same `seed` always
 * yields the same sequence, so games can record a seed for replays and
 * tests can assert exact outcomes. Not cryptographically secure.
 */
export function makeSeededRng(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
