import type { ComponentDef } from './component-store';

import { describe, expect, it } from 'vitest';

import { ComponentStore, TagStore } from './component-store';

const NumDef: ComponentDef<number> = {
  name: 'nums',
  serialize: v => v,
  deserialize: (raw, label) => {
    if (typeof raw !== 'number')
      throw new Error(`${label} must be a number`);
    return raw;
  },
};

describe('componentStore', () => {
  it('set and get', () => {
    const s = new ComponentStore<number>();
    s.set(1, 42);
    expect(s.get(1)).toBe(42);
    expect(s.has(1)).toBe(true);
    expect(s.size).toBe(1);
  });

  it('get returns undefined for missing entities', () => {
    const s = new ComponentStore<number>();
    expect(s.get(99)).toBeUndefined();
    expect(s.has(99)).toBe(false);
  });

  it('set replaces existing values', () => {
    const s = new ComponentStore<number>();
    s.set(1, 10);
    s.set(1, 20);
    expect(s.get(1)).toBe(20);
    expect(s.size).toBe(1);
  });

  describe('callbacks', () => {
    it('fires onSet after inserting', () => {
      const s = new ComponentStore<number>();
      const calls: Array<[number, number]> = [];
      s.onSet = (id, val) => calls.push([id, val]);
      s.set(1, 42);
      expect(calls).toEqual([[1, 42]]);
    });

    it('fires onDelete then onSet when replacing', () => {
      const s = new ComponentStore<number>();
      const log: string[] = [];
      s.onDelete = (id, old) => log.push(`del:${id}:${old}`);
      s.onSet = (id, val) => log.push(`set:${id}:${val}`);
      s.set(1, 10);
      s.set(1, 20);
      expect(log).toEqual(['set:1:10', 'del:1:10', 'set:1:20']);
    });

    it('fires onValidate before set commits', () => {
      const s = new ComponentStore<number>();
      const validated: number[] = [];
      s.onValidate = id => validated.push(id);
      s.set(5, 100);
      expect(validated).toEqual([5]);
    });

    it('fires onDelete on delete()', () => {
      const s = new ComponentStore<number>();
      const deleted: Array<[number, number]> = [];
      s.onDelete = (id, old) => deleted.push([id, old]);
      s.set(1, 42);
      s.delete(1);
      expect(deleted).toEqual([[1, 42]]);
    });

    it('fires onDelete for each entry on clear()', () => {
      const s = new ComponentStore<number>();
      const deleted: number[] = [];
      s.onDelete = id => deleted.push(id);
      s.set(1, 10);
      s.set(2, 20);
      s.clear();
      expect(deleted.sort()).toEqual([1, 2]);
      expect(s.size).toBe(0);
    });
  });

  describe('dirty tracking', () => {
    it('marks entities dirty on set', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      expect(s.isDirty(1)).toBe(true);
      expect(s.hasChanges()).toBe(true);
    });

    it('marks entities dirty on delete', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.clearDirty();
      s.delete(1);
      expect(s.isDirty(1)).toBe(true);
    });

    it('clearDirty resets all dirty flags', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.clearDirty();
      expect(s.isDirty(1)).toBe(false);
      expect(s.hasChanges()).toBe(false);
    });

    it('markDirty forces dirty flag', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.clearDirty();
      s.markDirty(1);
      expect(s.isDirty(1)).toBe(true);
    });
  });

  describe('iteration', () => {
    it('iterates entries', () => {
      const s = new ComponentStore<string>();
      s.set(1, 'a');
      s.set(2, 'b');
      const result = [...s];
      expect(result).toContainEqual([1, 'a']);
      expect(result).toContainEqual([2, 'b']);
    });

    it('entries() returns MapIterator', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      const entries = [...s.entries()];
      expect(entries).toEqual([[1, 42]]);
    });

    it('keys() returns entity IDs', () => {
      const s = new ComponentStore<number>();
      s.set(3, 10);
      s.set(7, 20);
      const keys = [...s.keys()];
      expect(keys).toContain(3);
      expect(keys).toContain(7);
    });
  });

  describe('delete', () => {
    it('returns true when entity existed', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      expect(s.delete(1)).toBe(true);
      expect(s.has(1)).toBe(false);
    });

    it('returns false when entity did not exist', () => {
      const s = new ComponentStore<number>();
      expect(s.delete(99)).toBe(false);
    });
  });

  describe('clear without onDelete', () => {
    it('clears all entries and dirty flags', () => {
      const s = new ComponentStore<number>();
      s.set(1, 10);
      s.set(2, 20);
      s.clear();
      expect(s.size).toBe(0);
      expect(s.hasChanges()).toBe(false);
    });
  });

  describe('serialization', () => {
    it('toSerialized produces [id, serialized] tuples', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.set(2, 99);
      const serialized = s.toSerialized(NumDef);
      expect(serialized).toContainEqual([1, 42]);
      expect(serialized).toContainEqual([2, 99]);
    });

    it('fromSerialized reconstructs a store', () => {
      const raw = [[1, 42], [2, 99]];
      const store = ComponentStore.fromSerialized(raw, 'test', NumDef);
      expect(store.get(1)).toBe(42);
      expect(store.get(2)).toBe(99);
      expect(store.size).toBe(2);
    });

    it('fromSerialized throws on invalid tuple length', () => {
      const raw = [[1]];
      expect(() => ComponentStore.fromSerialized(raw, 'test', NumDef))
        .toThrow('test[0] must contain an id and value.');
    });

    it('fromSerialized throws on non-array input', () => {
      expect(() => ComponentStore.fromSerialized('bad', 'test', NumDef))
        .toThrow('test must be an array.');
    });

    it('round-trips through serialize/deserialize', () => {
      const s = new ComponentStore<number>();
      s.set(5, 77);
      const serialized = s.toSerialized(NumDef);
      const restored = ComponentStore.fromSerialized(serialized, 'test', NumDef);
      expect(restored.get(5)).toBe(77);
    });
  });
});

describe('tagStore', () => {
  it('add and has', () => {
    const t = new TagStore();
    t.add(1);
    expect(t.has(1)).toBe(true);
    expect(t.has(2)).toBe(false);
    expect(t.size).toBe(1);
  });

  it('delete returns true for existing, false for missing', () => {
    const t = new TagStore();
    t.add(1);
    expect(t.delete(1)).toBe(true);
    expect(t.delete(1)).toBe(false);
    expect(t.has(1)).toBe(false);
  });

  it('clear removes all entries and dirty flags', () => {
    const t = new TagStore();
    t.add(1);
    t.add(2);
    t.clear();
    expect(t.size).toBe(0);
    expect(t.hasChanges()).toBe(false);
  });

  describe('dirty tracking', () => {
    it('marks dirty on add', () => {
      const t = new TagStore();
      t.add(1);
      expect(t.isDirty(1)).toBe(true);
      expect(t.hasChanges()).toBe(true);
    });

    it('marks dirty on delete', () => {
      const t = new TagStore();
      t.add(1);
      t.clearDirty();
      t.delete(1);
      expect(t.isDirty(1)).toBe(true);
    });

    it('clearDirty resets flags', () => {
      const t = new TagStore();
      t.add(1);
      t.clearDirty();
      expect(t.isDirty(1)).toBe(false);
      expect(t.hasChanges()).toBe(false);
    });
  });

  it('iterates entity IDs', () => {
    const t = new TagStore();
    t.add(3);
    t.add(7);
    expect([...t]).toContain(3);
    expect([...t]).toContain(7);
  });

  describe('serialization', () => {
    it('toSerialized returns ID array', () => {
      const t = new TagStore();
      t.add(1);
      t.add(5);
      const s = t.toSerialized();
      expect(s).toContain(1);
      expect(s).toContain(5);
    });

    it('fromSerialized reconstructs a store', () => {
      const restored = TagStore.fromSerialized([2, 4, 6], 'tags');
      expect(restored.has(2)).toBe(true);
      expect(restored.has(4)).toBe(true);
      expect(restored.has(6)).toBe(true);
      expect(restored.size).toBe(3);
    });

    it('fromSerialized throws on non-array', () => {
      expect(() => TagStore.fromSerialized('nope', 'tags'))
        .toThrow('tags must be an array.');
    });

    it('round-trips through serialization', () => {
      const t = new TagStore();
      t.add(10);
      t.add(20);
      const restored = TagStore.fromSerialized(t.toSerialized(), 'tags');
      expect(restored.has(10)).toBe(true);
      expect(restored.has(20)).toBe(true);
      expect(restored.size).toBe(2);
    });
  });
});
