import { describe, expect, it } from 'vitest';

import { makeSeededRng, pick, randomInt, shuffle } from './rng';

describe('makeSeededRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeSeededRng(42);
    const b = makeSeededRng(42);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeSeededRng(1);
    const b = makeSeededRng(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rand = makeSeededRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('stays within [0, maxExclusive)', () => {
    const rand = makeSeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(6, rand);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('returns 0 for non-positive bounds', () => {
    expect(randomInt(0)).toBe(0);
    expect(randomInt(-3)).toBe(0);
  });
});

describe('pick', () => {
  it('returns undefined for an empty array', () => {
    expect(pick([])).toBeUndefined();
  });

  it('only ever returns elements of the array', () => {
    const rand = makeSeededRng(123);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 200; i++)
      expect(arr).toContain(pick(arr, rand));
  });

  it('is deterministic with a seeded rng', () => {
    const arr = [10, 20, 30, 40, 50];
    expect(pick(arr, makeSeededRng(5))).toBe(pick(arr, makeSeededRng(5)));
  });
});

describe('shuffle', () => {
  it('returns the same array reference (in place)', () => {
    const arr = [1, 2, 3];
    expect(shuffle(arr, makeSeededRng(1))).toBe(arr);
  });

  it('is a permutation (preserves multiset)', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const before = [...arr].sort((a, b) => a - b);
    shuffle(arr, makeSeededRng(2024));
    expect([...arr].sort((a, b) => a - b)).toEqual(before);
  });

  it('is deterministic with a seeded rng', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [1, 2, 3, 4, 5, 6, 7, 8];
    shuffle(a, makeSeededRng(77));
    shuffle(b, makeSeededRng(77));
    expect(a).toEqual(b);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], makeSeededRng(1))).toEqual([]);
    expect(shuffle([42], makeSeededRng(1))).toEqual([42]);
  });
});
