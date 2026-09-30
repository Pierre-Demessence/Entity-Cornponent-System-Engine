import type { EntityId } from '#entity-id';

import { describe, expect, it } from 'vitest';

import { EntityAllocator } from '#entity-allocator';
import { ENTITY_GENERATION_MAX, ENTITY_INDEX_MAX, entityGeneration, entityIndex, packEntityId } from '#entity-id';

function live(alloc: EntityAllocator): EntityId {
  const id = alloc.allocate();
  alloc.activate(id);
  return id;
}

describe('entityAllocator', () => {
  it('hands out sequential generation-0 ids on a fresh allocator', () => {
    const alloc = new EntityAllocator();
    expect([live(alloc), live(alloc), live(alloc)]).toEqual([0, 1, 2]);
    expect(alloc.size).toBe(3);
  });

  it('reserved ids are not alive until activated', () => {
    const alloc = new EntityAllocator();
    const id = alloc.allocate();
    expect(alloc.isAlive(id)).toBe(false);
    expect(alloc.size).toBe(0);
    alloc.activate(id);
    expect(alloc.isAlive(id)).toBe(true);
    expect(alloc.size).toBe(1);
  });

  it('reuses the most recently released index with a bumped generation', () => {
    const alloc = new EntityAllocator();
    const a = live(alloc);
    const b = live(alloc);
    expect(alloc.release(a)).toBe(true);
    expect(alloc.release(b)).toBe(true);
    const c = live(alloc);
    expect(entityIndex(c)).toBe(entityIndex(b));
    expect(entityGeneration(c)).toBe(1);
    expect(alloc.isAlive(b)).toBe(false);
    expect(alloc.isAlive(c)).toBe(true);
  });

  it('release of a stale, dead, reserved or unknown id is a no-op returning false', () => {
    const alloc = new EntityAllocator();
    const a = live(alloc);
    alloc.release(a);
    const b = live(alloc);
    expect(alloc.release(a)).toBe(false);
    expect(alloc.isAlive(b)).toBe(true);
    expect(alloc.release(alloc.allocate())).toBe(false);
    expect(alloc.release(packEntityId(999, 0))).toBe(false);
    expect(alloc.size).toBe(1);
  });

  it('retires an index released at the maximum generation', () => {
    const alloc = new EntityAllocator();
    let id = live(alloc);
    for (let g = 0; g < ENTITY_GENERATION_MAX; g++) {
      alloc.release(id);
      id = live(alloc);
    }
    expect(entityIndex(id)).toBe(0);
    expect(entityGeneration(id)).toBe(ENTITY_GENERATION_MAX);
    alloc.release(id);
    expect(entityIndex(live(alloc))).toBe(1);
  });

  it('throws once every index is in use', () => {
    const alloc = new EntityAllocator();
    for (let i = 0; i <= ENTITY_INDEX_MAX; i++) alloc.allocate();
    expect(() => alloc.allocate()).toThrow(/exhausted/);
  });

  it('keeps the index space bounded to peak-live under churn', () => {
    const alloc = new EntityAllocator();
    const ids = Array.from({ length: 100 }, () => live(alloc));
    for (let round = 0; round < 200; round++) {
      for (let i = 0; i < ids.length; i++) {
        alloc.release(ids[i]!);
        ids[i] = live(alloc);
      }
    }
    expect(Math.max(...ids.map(entityIndex))).toBeLessThan(100);
    expect(alloc.size).toBe(100);
  });

  it('iterates live ids only', () => {
    const alloc = new EntityAllocator();
    const a = live(alloc);
    const b = live(alloc);
    alloc.allocate();
    alloc.release(a);
    expect([...alloc.live()]).toEqual([b]);
  });

  it('clear resets to a fresh allocator', () => {
    const alloc = new EntityAllocator();
    alloc.release(live(alloc));
    alloc.clear();
    expect(alloc.size).toBe(0);
    expect(live(alloc)).toBe(0);
  });

  describe('claim', () => {
    it('extends past the high-water mark, freeing the skipped indices', () => {
      const alloc = new EntityAllocator();
      const id = packEntityId(3, 2);
      alloc.claim(id);
      expect(alloc.isAlive(id)).toBe(true);
      expect(alloc.size).toBe(1);
      expect([live(alloc), live(alloc), live(alloc)].sort()).toEqual([0, 1, 2]);
      expect(entityIndex(live(alloc))).toBe(4);
    });

    it('adopts a free index at the same or a newer generation', () => {
      const alloc = new EntityAllocator();
      alloc.release(live(alloc));
      const id = packEntityId(0, 1);
      alloc.claim(id);
      expect(alloc.isAlive(id)).toBe(true);
      expect(entityIndex(live(alloc))).toBe(1);
    });

    it('rejects a free index at an older generation', () => {
      const alloc = new EntityAllocator();
      alloc.release(live(alloc));
      expect(() => alloc.claim(packEntityId(0, 0))).toThrow(/older generation/);
    });

    it('is a no-op for an id already alive', () => {
      const alloc = new EntityAllocator();
      const id = live(alloc);
      alloc.claim(id);
      expect(alloc.size).toBe(1);
    });

    it('rejects an index held by a different entity', () => {
      const alloc = new EntityAllocator();
      live(alloc);
      expect(() => alloc.claim(packEntityId(0, 3))).toThrow(/in use/);
      alloc.allocate();
      expect(() => alloc.claim(packEntityId(1, 0))).toThrow(/in use/);
    });

    it('rejects a retired index', () => {
      const alloc = new EntityAllocator();
      let id = live(alloc);
      for (let g = 0; g <= ENTITY_GENERATION_MAX; g++) {
        alloc.release(id);
        if (g < ENTITY_GENERATION_MAX)
          id = live(alloc);
      }
      expect(() => alloc.claim(packEntityId(0, ENTITY_GENERATION_MAX))).toThrow(/retired/);
    });
  });

  describe('serialization', () => {
    it('round-trips live, free and retired state', () => {
      const alloc = new EntityAllocator();
      const a = live(alloc);
      const b = live(alloc);
      const c = live(alloc);
      alloc.release(b);
      const loaded = EntityAllocator.fromSerialized(JSON.parse(JSON.stringify(alloc.toSerialized())), 'entities');
      expect([...loaded.live()].sort()).toEqual([a, c]);
      expect(loaded.isAlive(b)).toBe(false);
      expect(live(loaded)).toBe(packEntityId(1, 1));
    });

    it('persists an unflushed reservation as released so refs to it stay stale', () => {
      const alloc = new EntityAllocator();
      const reserved = alloc.allocate();
      const loaded = EntityAllocator.fromSerialized(alloc.toSerialized(), 'entities');
      const next = live(loaded);
      expect(next).not.toBe(reserved);
      expect(entityIndex(next)).toBe(entityIndex(reserved));
    });

    it.each([
      [{ free: [], generations: [0], highWater: 2, retired: [] }, /generations/],
      [{ free: [5], generations: [0], highWater: 1, retired: [] }, /free/],
      [{ free: [0, 0], generations: [0], highWater: 1, retired: [] }, /free/],
      [{ free: [], generations: [300], highWater: 1, retired: [] }, /generation/],
      [{ free: [0], generations: [0], highWater: 1, retired: [0] }, /retired/],
    ])('rejects malformed payload %#', (raw, message) => {
      expect(() => EntityAllocator.fromSerialized(raw, 'entities')).toThrow(message);
    });
  });
});
