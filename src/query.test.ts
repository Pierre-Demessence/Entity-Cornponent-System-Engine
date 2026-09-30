import type { ComponentDef, ComponentStoreLike } from '#component-store';

import { describe, expect, it } from 'vitest';

import { ChangeClock } from '#change-clock';
import { ComponentStore, simpleComponent, TagStore } from '#component-store';
import { Query } from '#query';
import { eid } from '#test-utils';
import { EcsWorld } from '#world';

function numStore(entries: Array<[number, number]>): ComponentStore<number> {
  const s = new ComponentStore<number>();
  for (const [id, val] of entries) s.set(eid(id), val);
  return s;
}

function strStore(entries: Array<[number, string]>): ComponentStore<string> {
  const s = new ComponentStore<string>();
  for (const [id, val] of entries) s.set(eid(id), val);
  return s;
}

function tagStore(ids: number[]): TagStore {
  const t = new TagStore();
  for (const id of ids) t.add(eid(id));
  return t;
}

describe('query', () => {
  it('yields entities present in all stores', () => {
    const nums = numStore([[1, 10], [2, 20], [3, 30]]);
    const strs = strStore([[2, 'b'], [3, 'c']]);
    const q = new Query<[number, string]>([nums as ComponentStore<unknown>, strs as ComponentStore<unknown>]);
    const results = q.run();
    expect(results).toHaveLength(2);
    expect(results).toContainEqual([2, 20, 'b']);
    expect(results).toContainEqual([3, 30, 'c']);
  });

  it('single store returns all entries', () => {
    const nums = numStore([[1, 10], [2, 20]]);
    const results = new Query<[number]>([nums as ComponentStore<unknown>]).run();
    expect(results).toHaveLength(2);
  });

  it('returns empty for zero stores', () => {
    const results = new Query<[]>([]).run();
    expect(results).toEqual([]);
  });

  it('count() returns match count without allocating', () => {
    const nums = numStore([[1, 10], [2, 20], [3, 30]]);
    const strs = strStore([[1, 'a'], [3, 'c']]);
    const q = new Query<[number, string]>([nums as ComponentStore<unknown>, strs as ComponentStore<unknown>]);
    expect(q.count()).toBe(2);
  });

  it('first() returns first match or undefined', () => {
    const nums = numStore([[5, 50]]);
    const q = new Query<[number]>([nums as ComponentStore<unknown>]);
    const result = q.first();
    expect(result).toEqual([5, 50]);
  });

  it('first() returns undefined when no matches', () => {
    const nums = numStore([[1, 10]]);
    const strs = strStore([[2, 'no-match']]);
    const q = new Query<[number, string]>([nums as ComponentStore<unknown>, strs as ComponentStore<unknown>]);
    expect(q.first()).toBeUndefined();
  });

  describe('tag filtering', () => {
    it('withTag() filters to entities with required tags', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const tag = tagStore([1, 3]);
      const q = new Query<[number]>([nums as ComponentStore<unknown>]).withTag(tag);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).toContainEqual([1, 10]);
      expect(results).toContainEqual([3, 30]);
    });

    it('without() excludes entities with given tags', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const dead = tagStore([2]);
      const q = new Query<[number]>([nums as ComponentStore<unknown>]).without(dead);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).not.toContainEqual(expect.arrayContaining([2]));
    });

    it('combines withTag and without', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const alive = tagStore([1, 2, 3]);
      const special = tagStore([2]);
      const q = new Query<[number]>([nums as ComponentStore<unknown>])
        .withTag(alive)
        .without(special);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).toContainEqual([1, 10]);
      expect(results).toContainEqual([3, 30]);
    });
  });

  it('iterates smallest store first for performance', () => {
    const big = numStore([[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]]);
    const small = strStore([[3, 'c']]);
    const q = new Query<[number, string]>([big as ComponentStore<unknown>, small as ComponentStore<unknown>]);
    const results = q.run();
    expect(results).toEqual([[3, 30, 'c']]);
  });

  describe('component and optional filters', () => {
    it('tag-only query yields [EntityId] tuples', () => {
      const tag = tagStore([1, 3]);
      const results = new Query<[]>([]).withTag(tag).run();
      expect(results).toContainEqual([1]);
      expect(results).toContainEqual([3]);
      expect(results).toHaveLength(2);
    });

    it('withComponent requires a component without yielding it', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const gate = numStore([[1, 0], [3, 0]]);
      const q = new Query<[number]>([nums as ComponentStore<unknown>])
        .withComponent(gate as ComponentStore<unknown>);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).toContainEqual([1, 10]);
      expect(results).toContainEqual([3, 30]);
    });

    it('withoutComponent excludes entities holding a component', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const frozen = numStore([[2, 0]]);
      const q = new Query<[number]>([nums as ComponentStore<unknown>])
        .withoutComponent(frozen as ComponentStore<unknown>);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).not.toContainEqual(expect.arrayContaining([2]));
    });

    it('optional appends the value or undefined and never filters', () => {
      const nums = numStore([[1, 10], [2, 20]]);
      const labels = strStore([[1, 'a']]);
      const q = new Query<[number]>([nums as ComponentStore<unknown>])
        .optional(labels as ComponentStore<string>);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).toContainEqual([1, 10, 'a']);
      expect(results).toContainEqual([2, 20, undefined]);
    });

    it('chained optional() accumulates result-tuple columns in call order', () => {
      const nums = numStore([[1, 10]]);
      const labels = strStore([[1, 'a']]);
      const extra = numStore([]);
      const results = new Query<[number]>([nums as ComponentStore<unknown>])
        .optional(labels as ComponentStore<string>)
        .optional(extra as ComponentStore<number>)
        .run();
      expect(results).toEqual([[1, 10, 'a', undefined]]);
    });

    it('anyOf groups require at least one member and AND across groups', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30], [4, 40]]);
      const groupA1 = tagStore([1, 2]);
      const groupA2 = tagStore([3]);
      const groupB = tagStore([2, 3]);
      // (A1 or A2) and B → entity 2 (A1,B) and 3 (A2,B); 1 fails B, 4 fails both.
      const q = new Query<[number]>([nums as ComponentStore<unknown>])
        .anyOf(groupA1, groupA2)
        .anyOf(groupB);
      const ids = q.run().map(r => r[0]).sort((a, b) => a - b);
      expect(ids).toEqual([2, 3]);
    });

    it('pure any-of query with no mandatory source scans the group union', () => {
      const a = tagStore([1, 2]);
      const b = tagStore([2, 3]);
      const q = new Query<[]>([]).anyOf(a, b);
      const ids = q.run().map(r => r[0]).sort((x, y) => x - y);
      expect(ids).toEqual([1, 2, 3]);
    });
  });
});

interface Hp { v: number }
const HpDef: ComponentDef<Hp> = {
  name: 'hp',
  deserialize: raw => raw as Hp,
  serialize: v => v,
};
const PosDef = simpleComponent<{ x: number; y: number }>('pos', { x: 'number', y: 'number' });

interface ChangeRig {
  clock: ChangeClock;
  hp: ComponentStoreLike<Hp>;
  tag: TagStore;
  bare: () => Query<[]>;
  query: () => Query<[Hp]>;
}

const rigs: Record<string, () => ChangeRig> = {
  'index path': () => {
    const w = new EcsWorld();
    const hp = w.registerComponent(HpDef);
    const tag = w.registerTag({ name: 'flag' });
    return { clock: w.clock, hp, tag, bare: () => w.query(), query: () => w.query(HpDef) };
  },
  'scan path': () => {
    const clock = new ChangeClock();
    const hp = new ComponentStore<Hp>(clock);
    const tag = new TagStore(clock);
    return {
      clock,
      hp,
      tag,
      bare: () => new Query<[]>([]),
      query: () => new Query<[Hp]>([hp as ComponentStoreLike<unknown>]),
    };
  },
};

function ids(q: Iterable<[number, ...unknown[]]>): number[] {
  return [...q].map(r => r[0]).sort((a, b) => a - b);
}

describe.each(Object.keys(rigs))('change filters (%s)', (path) => {
  const rig = rigs[path];

  it('a new query sees every entity as added and changed on its first pass', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.hp.set(eid(2), { v: 2 });
    expect(ids(r.query().changed(r.hp))).toEqual([1, 2]);
    expect(ids(r.query().added(r.hp))).toEqual([1, 2]);
  });

  it('a second pass with no writes sees nothing', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    const q = r.query().changed(r.hp);
    expect(ids(q)).toEqual([1]);
    expect(ids(q)).toEqual([]);
  });

  it('reports replace, getMut and markChanged once each', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.hp.set(eid(2), { v: 2 });
    r.hp.set(eid(3), { v: 3 });
    const q = r.query().changed(r.hp);
    q.run();
    r.hp.set(eid(1), { v: 10 });
    r.hp.getMut(eid(2))!.v = 20;
    r.hp.markChanged(eid(3));
    expect(ids(q)).toEqual([1, 2, 3]);
    expect(ids(q)).toEqual([]);
  });

  it('get() alone is not a change', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    const q = r.query().changed(r.hp);
    q.run();
    r.hp.get(eid(1));
    expect(ids(q)).toEqual([]);
  });

  it('added() ignores a replace but changed() reports it', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    const added = r.query().added(r.hp);
    const changed = r.query().changed(r.hp);
    added.run();
    changed.run();
    r.hp.set(eid(1), { v: 2 });
    r.hp.set(eid(2), { v: 2 });
    expect(ids(added)).toEqual([2]);
    expect(ids(changed)).toEqual([1, 2]);
  });

  it('two queries over one store keep independent windows', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    const a = r.query().changed(r.hp);
    const b = r.query().changed(r.hp);
    a.run();
    r.hp.set(eid(1), { v: 2 });
    expect(ids(a)).toEqual([1]);
    expect(ids(b)).toEqual([1]);
    expect(ids(a)).toEqual([]);
  });

  it('a query that skips passes catches up on everything since its last pass', () => {
    const r = rig();
    const q = r.query().changed(r.hp);
    q.run();
    r.hp.set(eid(1), { v: 1 });
    r.query().changed(r.hp).run();
    r.hp.set(eid(2), { v: 2 });
    expect(ids(q)).toEqual([1, 2]);
  });

  it('a write during its own pass is reported on the next pass', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.hp.set(eid(2), { v: 2 });
    const q = r.query().changed(r.hp);
    for (const [id] of q) r.hp.getMut(eid(id === 1 ? 2 : 1))!.v += 1;
    expect(ids(q)).toEqual([1, 2]);
  });

  it('delete is not a change; re-adding is reported as added', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.hp.set(eid(2), { v: 2 });
    const changed = r.query().changed(r.hp);
    const added = r.query().added(r.hp);
    changed.run();
    added.run();
    r.hp.delete(eid(1));
    expect(ids(changed)).toEqual([]);
    r.hp.set(eid(1), { v: 1 });
    expect(ids(added)).toEqual([1]);
  });

  it('first() and count() consume the window', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.hp.set(eid(2), { v: 2 });
    const q = r.query().changed(r.hp);
    expect(q.count()).toBe(2);
    expect(q.first()).toBeUndefined();
  });

  it('the filtered store is implicitly required', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.tag.add(eid(2));
    expect(ids(r.bare().changed(r.hp))).toEqual([1]);
  });

  it('added() accepts a tag store', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.hp.set(eid(2), { v: 2 });
    const q = r.query().added(r.tag);
    expect(ids(q)).toEqual([]);
    r.tag.add(eid(2));
    expect(ids(q)).toEqual([2]);
    r.tag.add(eid(2));
    expect(ids(q)).toEqual([]);
  });

  it('filters AND together', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    r.hp.set(eid(2), { v: 2 });
    r.tag.add(eid(1));
    r.tag.add(eid(2));
    const q = r.query().changed(r.hp).added(r.tag);
    q.run();
    r.hp.set(eid(1), { v: 5 });
    r.tag.delete(eid(2));
    r.tag.add(eid(2));
    r.hp.set(eid(2), { v: 6 });
    expect(ids(q)).toEqual([2]);
  });

  it('a query without change filters does not advance the clock', () => {
    const r = rig();
    r.hp.set(eid(1), { v: 1 });
    const before = r.clock.tick;
    r.query().run();
    expect(r.clock.tick).toBe(before);
  });

  it('throws when filtered stores hold different clocks', () => {
    const r = rig();
    const foreign = new ComponentStore<Hp>();
    foreign.set(eid(1), { v: 1 });
    r.hp.set(eid(1), { v: 1 });
    expect(() => r.query().changed(r.hp).changed(foreign).run()).toThrow(/clock/);
  });
});

describe('change filters on a columnar store', () => {
  it('reports a view field write', () => {
    const w = new EcsWorld();
    const pos = w.registerComponent(PosDef);
    pos.set(eid(1), { x: 0, y: 0 });
    const q = w.query(PosDef).changed(pos);
    q.run();
    pos.get(eid(1))!.x = 4;
    expect(ids(q)).toEqual([1]);
  });
});
