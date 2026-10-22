import { describe, expect, it } from 'vitest';

import { ArchetypeIndex } from '#archetype-index';
import { eid } from '#test-utils';

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

  it('forEachStoreOf visits only the stores an entity holds, tolerating removal mid-walk', () => {
    const index = new ArchetypeIndex();
    const [a, b, c] = [{}, {}, {}];
    const bits = [a, b, c].map(s => index.registerStore(s));
    index.addBit(eid(7), bits[0]!);
    index.addBit(eid(7), bits[2]!);
    const seen: object[] = [];
    index.forEachStoreOf(eid(7), (store) => {
      seen.push(store);
      index.removeBit(eid(7), index.bitOf(store)!);
    });
    expect(seen).toEqual([a, c]);
    index.forEachStoreOf(eid(99), () => seen.push(b));
    expect(seen).toEqual([a, c]);
  });

  it('matches entities whose signature is a superset of the required mask', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const b = index.registerStore({});
    index.addBit(eid(1), a);
    index.addBit(eid(2), a);
    index.addBit(eid(2), b);
    index.addBit(eid(3), b);

    expect(ids(index, a)).toEqual([1, 2]);
    expect(ids(index, b)).toEqual([2, 3]);
    expect(ids(index, a | b)).toEqual([2]);
  });

  it('excludes entities that carry any excluded bit', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const dead = index.registerStore({});
    index.addBit(eid(1), a);
    index.addBit(eid(2), a);
    index.addBit(eid(2), dead);

    expect(ids(index, a, dead)).toEqual([1]);
  });

  it('setting an already-present bit does not thrash the bucket', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    index.addBit(eid(1), a);
    index.addBit(eid(1), a);
    expect(ids(index, a)).toEqual([1]);
  });

  it('removing the last bit forgets the entity entirely', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    index.addBit(eid(1), a);
    index.removeBit(eid(1), a);
    expect(ids(index, a)).toEqual([]);
    expect(ids(index, 0n)).toEqual([]);
  });

  it('removeBit is a no-op for a bit that was never set', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const b = index.registerStore({});
    index.addBit(eid(1), a);
    index.removeBit(eid(1), b);
    expect(ids(index, a)).toEqual([1]);
  });

  it('removeEntity drops the entity from its bucket', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    index.addBit(eid(1), a);
    index.addBit(eid(2), a);
    index.removeEntity(eid(1));
    expect(ids(index, a)).toEqual([2]);
  });

  it('clear wipes entities but keeps bit assignments', () => {
    const index = new ArchetypeIndex();
    const a = {};
    const bitA = index.registerStore(a);
    index.addBit(eid(1), bitA);
    index.clear();
    expect(ids(index, bitA)).toEqual([]);
    expect(index.bitOf(a)).toBe(bitA);
  });

  it('reflects a newly created archetype after an earlier query cached its result', () => {
    const index = new ArchetypeIndex();
    const a = index.registerStore({});
    const b = index.registerStore({});
    index.addBit(eid(1), a);
    expect(ids(index, a)).toEqual([1]);

    // Entity 2 lands in a brand-new {a,b} archetype bucket after the first
    // query cached the {a} match — the structural-version bump must invalidate.
    index.addBit(eid(2), a);
    index.addBit(eid(2), b);
    expect(ids(index, a)).toEqual([1, 2]);
    expect(ids(index, a | b)).toEqual([2]);
  });

  describe('batched structural changes', () => {
    const BIT_COUNT = 10;

    function registerBits(index: ArchetypeIndex): bigint[] {
      return Array.from({ length: BIT_COUNT }, () => index.registerStore({}));
    }

    it('joining an existing archetype one bit at a time leaves the version unchanged', () => {
      const index = new ArchetypeIndex();
      const bits = registerBits(index);
      for (const bit of bits) index.addBit(eid(1), bit);
      const placed = index.version;

      for (const bit of bits) index.addBit(eid(2), bit);

      expect(index.version).toBe(placed);
      expect(ids(index, bits[0]!)).toEqual([1, 2]);
    });

    it('building an entity never creates a bucket for an intermediate signature', () => {
      const index = new ArchetypeIndex();
      const bits = registerBits(index);
      for (const bit of bits) index.addBit(eid(1), bit);

      // One bucket for the final signature: created once, version 0 → 1.
      expect(index.version).toBe(1);
      expect(index.selectBuckets(0n, 0n)).toHaveLength(1);
    });

    it('destroying one of two same-archetype entities leaves the version unchanged', () => {
      const index = new ArchetypeIndex();
      const bits = registerBits(index);
      for (const bit of bits) {
        index.addBit(eid(1), bit);
        index.addBit(eid(2), bit);
      }
      const before = index.version;

      for (const bit of bits) index.removeBit(eid(2), bit);
      index.removeEntity(eid(2));

      expect(index.version).toBe(before);
      expect(ids(index, bits[0]!)).toEqual([1]);
    });

    it('adding then removing the same bit before any read commits no move', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(eid(1), a);
      index.addBit(eid(2), a);
      index.addBit(eid(2), b);
      const before = index.version;

      index.addBit(eid(1), b);
      index.removeBit(eid(1), b);

      expect(index.version).toBe(before);
      expect(ids(index, a)).toEqual([1, 2]);
      expect(ids(index, b)).toEqual([2]);
    });

    it('creating then removing an entity before any read creates no bucket', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(eid(1), a);
      index.addBit(eid(1), b);
      index.removeEntity(eid(1));

      expect(index.version).toBe(0);
      expect(ids(index, a)).toEqual([]);
    });

    it('selectBuckets reflects changes made after an earlier selection cached', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(eid(1), a);
      expect(index.selectBuckets(a | b, 0n)).toHaveLength(0);

      index.addBit(eid(1), b);

      expect(index.selectBuckets(a | b, 0n)).toHaveLength(1);
      expect(index.selectBuckets(a, b)).toHaveLength(0);
    });

    it('matching sees pending changes in the same call', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(eid(1), a);
      expect(ids(index, a)).toEqual([1]);

      index.addBit(eid(1), b);
      index.removeBit(eid(1), a);

      expect(ids(index, a)).toEqual([]);
      expect(ids(index, b)).toEqual([1]);
    });

    it('forEachStoreOf reads the current signature before any commit', () => {
      const index = new ArchetypeIndex();
      const a = {};
      const b = {};
      index.addBit(eid(1), index.registerStore(a));
      index.addBit(eid(1), index.registerStore(b));
      const seen: object[] = [];
      index.forEachStoreOf(eid(1), store => seen.push(store));
      expect(seen).toEqual([a, b]);
    });

    it('clear drops pending placements', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      index.addBit(eid(1), a);
      index.clear();
      const cleared = index.version;

      expect(ids(index, a)).toEqual([]);
      expect(index.version).toBe(cleared);
    });
  });

  describe('any-of groups', () => {
    it('matches entities intersecting every group mask', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      const c = index.registerStore({});
      index.addBit(eid(1), a);
      index.addBit(eid(2), b);
      index.addBit(eid(3), c);

      // (a or b) → entities 1 and 2, not 3.
      expect([...index.matching(0n, 0n, [a | b])].sort((x, y) => x - y)).toEqual([1, 2]);
    });

    it('intersects every group (logical AND across groups)', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      const c = index.registerStore({});
      index.addBit(eid(1), a);
      index.addBit(eid(1), c);
      index.addBit(eid(2), b);
      index.addBit(eid(2), c);
      index.addBit(eid(3), a);

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
      index.addBit(eid(1), req);
      index.addBit(eid(1), x);
      index.addBit(eid(2), req);
      index.addBit(eid(2), y);
      index.addBit(eid(2), dead);
      index.addBit(eid(3), req);

      // req required, dead excluded, (x or y) → only 1 (2 is dead, 3 lacks x/y).
      const got = [...index.matching(req, dead, [x | y])];
      expect(got).toEqual([1]);
    });

    it('caches per distinct any-of mask set', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(eid(1), a);
      index.addBit(eid(2), b);

      expect([...index.matching(0n, 0n, [a])]).toEqual([1]);
      expect([...index.matching(0n, 0n, [b])]).toEqual([2]);
      expect([...index.matching(0n, 0n, [a | b])].sort((x, y) => x - y)).toEqual([1, 2]);
    });
  });

  describe('iteration guard', () => {
    it('throws on a structural change while iterating', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      index.addBit(eid(1), a);
      index.beginIteration();
      try {
        expect(() => index.addBit(eid(2), a)).toThrow(/Structural change during query iteration/);
        expect(() => index.removeEntity(eid(1))).toThrow(/Structural change during query iteration/);
      }
      finally {
        index.endIteration();
      }
    });

    it('throws on removeBit that changes the signature while iterating', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(eid(1), a);
      index.addBit(eid(1), b);
      index.beginIteration();
      try {
        expect(() => index.removeBit(eid(1), b)).toThrow(/Structural change during query iteration/);
      }
      finally {
        index.endIteration();
      }
    });

    it('does not trip on removeBit of an unset bit while iterating', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      const b = index.registerStore({});
      index.addBit(eid(1), a);
      index.beginIteration();
      try {
        expect(() => index.removeBit(eid(1), b)).not.toThrow();
      }
      finally {
        index.endIteration();
      }
    });

    it('permits structural changes once iteration ends', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      index.beginIteration();
      index.endIteration();
      expect(() => index.addBit(eid(1), a)).not.toThrow();
    });

    it('does not trip on an idempotent bit set (value replace) while iterating', () => {
      const index = new ArchetypeIndex();
      const a = index.registerStore({});
      index.addBit(eid(1), a);
      index.beginIteration();
      try {
        expect(() => index.addBit(eid(1), a)).not.toThrow();
      }
      finally {
        index.endIteration();
      }
    });
  });
});
