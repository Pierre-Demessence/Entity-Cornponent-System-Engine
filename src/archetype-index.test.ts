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

  describe('any-of groups', () => {
    it('matches entities intersecting every group mask', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      const c = index.registerStore({});
      index.addBit(1, a);
      index.addBit(2, b);
      index.addBit(3, c);

      // (a or b) → entities 1 and 2, not 3.
      expect([...index.matching(0n, 0n, [a | b])].sort((x, y) => x - y)).toEqual([1, 2]);
    });

    it('intersects every group (logical AND across groups)', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      const c = index.registerStore({});
      index.addBit(1, a);
      index.addBit(1, c);
      index.addBit(2, b);
      index.addBit(2, c);
      index.addBit(3, a);

      // (a or b) and c → 1 (a,c) and 2 (b,c); 3 lacks c.
      const got = [...index.matching(0n, 0n, [a | b, c])].sort((x, y) => x - y);
      expect(got).toEqual([1, 2]);
    });

    it('combines required, excluded, and any-of masks', () => {
      const index = new ArchetypeIndex();
      const req = index.registerStore({});
      const dead = index.registerStore({});
      const x = index.registerStore({});
      const y = index.registerStore({});
      index.addBit(1, req);
      index.addBit(1, x);
      index.addBit(2, req);
      index.addBit(2, y);
      index.addBit(2, dead);
      index.addBit(3, req);

      // req required, dead excluded, (x or y) → only 1 (2 is dead, 3 lacks x/y).
      const got = [...index.matching(req, dead, [x | y])];
      expect(got).toEqual([1]);
    });

    it('caches per distinct any-of mask set', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(1, a);
      index.addBit(2, b);

      expect([...index.matching(0n, 0n, [a])]).toEqual([1]);
      expect([...index.matching(0n, 0n, [b])]).toEqual([2]);
      expect([...index.matching(0n, 0n, [a | b])].sort((x, y) => x - y)).toEqual([1, 2]);
    });
  });
});
