import type { ComponentDef } from '#component-store';

import { describe, expect, it } from 'vitest';

import { ChangeClock } from '#change-clock';
import { ComponentStore, TagStore } from '#component-store';

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

  describe('subscribe', () => {
    it('fires set handler after inserting', () => {
      const s = new ComponentStore<number>();
      const calls: Array<[number, number]> = [];
      s.subscribe('set', (id, val) => calls.push([id, val]));
      s.set(1, 42);
      expect(calls).toEqual([[1, 42]]);
    });

    it('fires delete then set when replacing', () => {
      const s = new ComponentStore<number>();
      const log: string[] = [];
      s.subscribe('delete', (id, old) => log.push(`del:${id}:${old}`));
      s.subscribe('set', (id, val) => log.push(`set:${id}:${val}`));
      s.set(1, 10);
      s.set(1, 20);
      expect(log).toEqual(['set:1:10', 'del:1:10', 'set:1:20']);
    });

    it('fires validate before set commits', () => {
      const s = new ComponentStore<number>();
      const validated: number[] = [];
      s.subscribe('validate', id => validated.push(id));
      s.set(5, 100);
      expect(validated).toEqual([5]);
    });

    it('fires delete on delete()', () => {
      const s = new ComponentStore<number>();
      const deleted: Array<[number, number]> = [];
      s.subscribe('delete', (id, old) => deleted.push([id, old]));
      s.set(1, 42);
      s.delete(1);
      expect(deleted).toEqual([[1, 42]]);
    });

    it('fires delete for each entry on clear()', () => {
      const s = new ComponentStore<number>();
      const deleted: number[] = [];
      s.subscribe('delete', id => deleted.push(id));
      s.set(1, 10);
      s.set(2, 20);
      s.clear();
      expect(deleted.sort()).toEqual([1, 2]);
      expect(s.size).toBe(0);
    });

    it('supports multiple handlers per event', () => {
      const s = new ComponentStore<number>();
      const a: number[] = [];
      const b: number[] = [];
      s.subscribe('set', id => a.push(id));
      s.subscribe('set', id => b.push(id));
      s.set(1, 10);
      s.set(2, 20);
      expect(a).toEqual([1, 2]);
      expect(b).toEqual([1, 2]);
    });

    it('returns an unsubscribe function', () => {
      const s = new ComponentStore<number>();
      const calls: number[] = [];
      const off = s.subscribe('set', id => calls.push(id));
      s.set(1, 10);
      off();
      s.set(2, 20);
      expect(calls).toEqual([1]);
    });

    it('validate() method fires validate handlers', () => {
      const s = new ComponentStore<number>();
      const ids: number[] = [];
      s.subscribe('validate', id => ids.push(id));
      s.validate(42);
      expect(ids).toEqual([42]);
    });
  });

  describe('change ticks', () => {
    it('stamps added and changed with the clock tick on insert', () => {
      const clock = new ChangeClock();
      clock.tick = 5;
      const s = new ComponentStore<number>(clock);
      s.set(1, 42);
      expect(s.clock).toBe(clock);
      expect(s.addedTick(1)).toBe(5);
      expect(s.changedTick(1)).toBe(5);
    });

    it('replace stamps changed but keeps the added tick', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.clock.tick = 9;
      s.set(1, 43);
      expect(s.addedTick(1)).toBe(1);
      expect(s.changedTick(1)).toBe(9);
    });

    it('getMut stamps changed and returns the stored value; get does not stamp', () => {
      const s = new ComponentStore<{ hp: number }>();
      const value = { hp: 3 };
      s.set(1, value);
      s.clock.tick = 4;
      expect(s.get(1)).toBe(value);
      expect(s.changedTick(1)).toBe(1);
      expect(s.getMut(1)).toBe(value);
      expect(s.changedTick(1)).toBe(4);
    });

    it('getMut on a missing entity returns undefined and stamps nothing', () => {
      const s = new ComponentStore<number>();
      expect(s.getMut(1)).toBeUndefined();
      expect(s.changedTick(1)).toBe(0);
    });

    it('markChanged stamps a present entity only', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.clock.tick = 7;
      s.markChanged(1);
      s.markChanged(2);
      expect(s.changedTick(1)).toBe(7);
      expect(s.changedTick(2)).toBe(0);
    });

    it('delete and clear drop the stamps', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.set(2, 43);
      s.delete(1);
      expect(s.addedTick(1)).toBe(0);
      expect(s.changedTick(1)).toBe(0);
      s.clear();
      expect(s.addedTick(2)).toBe(0);
    });

    it('re-adding after delete stamps added again', () => {
      const s = new ComponentStore<number>();
      s.set(1, 42);
      s.delete(1);
      s.clock.tick = 3;
      s.set(1, 42);
      expect(s.addedTick(1)).toBe(3);
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

  describe('clear without delete handler', () => {
    it('clears all entries', () => {
      const s = new ComponentStore<number>();
      s.set(1, 10);
      s.set(2, 20);
      s.clear();
      expect(s.size).toBe(0);
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
        .toThrow('test.entries[0] must contain an id and value.');
    });

    it('fromSerialized throws on non-array, non-object input', () => {
      expect(() => ComponentStore.fromSerialized('bad', 'test', NumDef))
        .toThrow(/test must be an object/);
    });

    it('round-trips through serialize/deserialize', () => {
      const s = new ComponentStore<number>();
      s.set(5, 77);
      const serialized = s.toSerialized(NumDef);
      const restored = ComponentStore.fromSerialized(serialized, 'test', NumDef);
      expect(restored.get(5)).toBe(77);
    });
  });

  describe('versioned migrations', () => {
    interface Fighter { hp: number; maxHp: number }

    const FighterV2Def: ComponentDef<Fighter> = {
      name: 'FighterV2',
      version: 2,
      migrations: {
        // v0 had { health }. v1 rename to hp.
        0: (raw) => {
          const o = raw as { health: number };
          return { hp: o.health };
        },
        // v1 had { hp } only. v2 adds maxHp defaulting to hp.
        1: (raw) => {
          const o = raw as { hp: number };
          return { hp: o.hp, maxHp: o.hp };
        },
      },
      serialize: v => ({ hp: v.hp, maxHp: v.maxHp }),
      deserialize: (raw) => {
        const o = raw as { hp: number; maxHp: number };
        return { hp: o.hp, maxHp: o.maxHp };
      },
    };

    it('toSerialized emits { version, entries } for versioned defs', () => {
      const s = new ComponentStore<Fighter>();
      s.set(1, { hp: 10, maxHp: 15 });
      const out = s.toSerialized(FighterV2Def) as { version: number; entries: unknown[] };
      expect(out.version).toBe(2);
      expect(out.entries).toEqual([[1, { hp: 10, maxHp: 15 }]]);
    });

    it('toSerialized keeps legacy array shape for unversioned defs', () => {
      const s = new ComponentStore<Fighter>();
      s.set(1, { hp: 10, maxHp: 15 });
      const unversioned: ComponentDef<Fighter> = {
        name: 'F',
        deserialize: r => r as Fighter,
        serialize: v => v,
      };
      expect(Array.isArray(s.toSerialized(unversioned))).toBe(true);
    });

    it('migrates from v0 (legacy array shape) to v2', () => {
      const legacy = [[1, { health: 7 }]];
      const store = ComponentStore.fromSerialized(legacy, 'F', FighterV2Def);
      expect(store.get(1)).toEqual({ hp: 7, maxHp: 7 });
    });

    it('migrates from v1 wrapped shape to v2', () => {
      const raw = { entries: [[1, { hp: 12 }]], version: 1 };
      const store = ComponentStore.fromSerialized(raw, 'F', FighterV2Def);
      expect(store.get(1)).toEqual({ hp: 12, maxHp: 12 });
    });

    it('passes through when saved version matches target', () => {
      const raw = { entries: [[1, { hp: 9, maxHp: 20 }]], version: 2 };
      const store = ComponentStore.fromSerialized(raw, 'F', FighterV2Def);
      expect(store.get(1)).toEqual({ hp: 9, maxHp: 20 });
    });

    it('throws when a migration step is missing', () => {
      const Partial: ComponentDef<Fighter> = {
        ...FighterV2Def,
        migrations: { 1: FighterV2Def.migrations![1] }, // missing 0->1
      };
      const legacy = [[1, { health: 7 }]];
      expect(() => ComponentStore.fromSerialized(legacy, 'F', Partial))
        .toThrow(/no migration from version 0 to 1/);
    });

    it('throws when saved version is newer than target', () => {
      const raw = { entries: [], version: 5 };
      expect(() => ComponentStore.fromSerialized(raw, 'F', FighterV2Def))
        .toThrow(/saved version 5 is newer than current version 2/);
    });

    it('round-trips a versioned store', () => {
      const s = new ComponentStore<Fighter>();
      s.set(1, { hp: 10, maxHp: 15 });
      const out = s.toSerialized(FighterV2Def);
      const restored = ComponentStore.fromSerialized(out, 'F', FighterV2Def);
      expect(restored.get(1)).toEqual({ hp: 10, maxHp: 15 });
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

  it('clear removes all entries and their added stamps', () => {
    const t = new TagStore();
    t.add(1);
    t.add(2);
    t.clear();
    expect(t.size).toBe(0);
    expect(t.addedTick(1)).toBe(0);
  });

  describe('change ticks', () => {
    it('stamps added on first add only', () => {
      const clock = new ChangeClock();
      const t = new TagStore(clock);
      expect(t.clock).toBe(clock);
      t.add(1);
      clock.tick = 6;
      t.add(1);
      expect(t.addedTick(1)).toBe(1);
    });

    it('delete drops the stamp; re-add stamps again', () => {
      const t = new TagStore();
      t.add(1);
      t.delete(1);
      expect(t.addedTick(1)).toBe(0);
      t.clock.tick = 4;
      t.add(1);
      expect(t.addedTick(1)).toBe(4);
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
