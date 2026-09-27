import { describe, expect, it } from 'vitest';

import { ArchetypeIndex } from '#archetype-index';

function ids(index: ArchetypeIndex, required: bigint, excluded = 0n): number[] {
  return [...index.matching(required, excluded)].sort((a, b) => a - b);
}

describe('archetypeIndex', () => {
  it('assigns a distinct power-of-two bit per store, idempotently', () => {
    const index = new ArchetypeIndex();
    const a = {};
    const b = {};
    const bitA = index.registerStore(a);
    const bitB = index.registerStore(b);
    expect(bitA).toBe(1n);
    expect(bitB).toBe(2n);
    expect(index.registerStore(a)).toBe(bitA);
    expect(index.bitOf(a)).toBe(bitA);
    expect(index.bitOf({})).toBeUndefined();
  });

  it('matches entities whose signature is a superset of the required mask', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const b = index.registerStore({});
    index.addBit(1, a);
    index.addBit(2, a);
    index.addBit(2, b);
    index.addBit(3, b);

    expect(ids(index, a)).toEqual([1, 2]);
    expect(ids(index, b)).toEqual([2, 3]);
    expect(ids(index, a | b)).toEqual([2]);
  });

  it('excludes entities that carry any excluded bit', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const dead = index.registerStore({});
    index.addBit(1, a);
    index.addBit(2, a);
    index.addBit(2, dead);

    expect(ids(index, a, dead)).toEqual([1]);
  });

  it('setting an already-present bit does not thrash the bucket', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    index.addBit(1, a);
    index.addBit(1, a);
    expect(ids(index, a)).toEqual([1]);
  });

  it('removing the last bit forgets the entity entirely', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    index.addBit(1, a);
    index.removeBit(1, a);
    expect(ids(index, a)).toEqual([]);
    expect(ids(index, 0n)).toEqual([]);
  });

  it('removeBit is a no-op for a bit that was never set', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const b = index.registerStore({});
    index.addBit(1, a);
    index.removeBit(1, b);
    expect(ids(index, a)).toEqual([1]);
  });

  it('removeEntity drops the entity from its bucket', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    index.addBit(1, a);
    index.addBit(2, a);
    index.removeEntity(1);
    expect(ids(index, a)).toEqual([2]);
  });

  it('clear wipes entities but keeps bit assignments', () => {
    const index = new ArchetypeIndex();
    const a = {};
    const bitA = index.registerStore(a);
    index.addBit(1, bitA);
    index.clear();
    expect(ids(index, bitA)).toEqual([]);
    expect(index.bitOf(a)).toBe(bitA);
  });

  it('reflects a newly created archetype after an earlier query cached its result', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const b = index.registerStore({});
    index.addBit(1, a);
    expect(ids(index, a)).toEqual([1]);

    // Entity 2 lands in a brand-new {a,b} archetype bucket after the first
    // query cached the {a} match — the structural-version bump must invalidate.
    index.addBit(2, a);
    index.addBit(2, b);
    expect(ids(index, a)).toEqual([1, 2]);
    expect(ids(index, a | b)).toEqual([2]);
  });
});
