import { describe, expect, it } from 'vitest';

import { ComponentStore, TagStore } from '#component-store';
import { QueryBuilder } from '#query';

function numStore(entries: Array<[number, number]>): ComponentStore<number> {
  const s = new ComponentStore<number>();
  for (const [id, val] of entries) s.set(id, val);
  return s;
}

function strStore(entries: Array<[number, string]>): ComponentStore<string> {
  const s = new ComponentStore<string>();
  for (const [id, val] of entries) s.set(id, val);
  return s;
}

function tagStore(ids: number[]): TagStore {
  const t = new TagStore();
  for (const id of ids) t.add(id);
  return t;
}

describe('queryBuilder', () => {
  it('yields entities present in all stores', () => {
    const nums = numStore([[1, 10], [2, 20], [3, 30]]);
    const strs = strStore([[2, 'b'], [3, 'c']]);
    const q = new QueryBuilder<[number, string]>([nums as ComponentStore<unknown>, strs as ComponentStore<unknown>]);
    const results = q.run();
    expect(results).toHaveLength(2);
    expect(results).toContainEqual([2, 20, 'b']);
    expect(results).toContainEqual([3, 30, 'c']);
  });

  it('single store returns all entries', () => {
    const nums = numStore([[1, 10], [2, 20]]);
    const results = new QueryBuilder<[number]>([nums as ComponentStore<unknown>]).run();
    expect(results).toHaveLength(2);
  });

  it('returns empty for zero stores', () => {
    const results = new QueryBuilder<[]>([]).run();
    expect(results).toEqual([]);
  });

  it('count() returns match count without allocating', () => {
    const nums = numStore([[1, 10], [2, 20], [3, 30]]);
    const strs = strStore([[1, 'a'], [3, 'c']]);
    const q = new QueryBuilder<[number, string]>([nums as ComponentStore<unknown>, strs as ComponentStore<unknown>]);
    expect(q.count()).toBe(2);
  });

  it('first() returns first match or undefined', () => {
    const nums = numStore([[5, 50]]);
    const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>]);
    const result = q.first();
    expect(result).toEqual([5, 50]);
  });

  it('first() returns undefined when no matches', () => {
    const nums = numStore([[1, 10]]);
    const strs = strStore([[2, 'no-match']]);
    const q = new QueryBuilder<[number, string]>([nums as ComponentStore<unknown>, strs as ComponentStore<unknown>]);
    expect(q.first()).toBeUndefined();
  });

  describe('tag filtering', () => {
    it('withTag() filters to entities with required tags', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const tag = tagStore([1, 3]);
      const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>]).withTag(tag);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).toContainEqual([1, 10]);
      expect(results).toContainEqual([3, 30]);
    });

    it('without() excludes entities with given tags', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const dead = tagStore([2]);
      const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>]).without(dead);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).not.toContainEqual(expect.arrayContaining([2]));
    });

    it('combines withTag and without', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const alive = tagStore([1, 2, 3]);
      const special = tagStore([2]);
      const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>])
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
    const q = new QueryBuilder<[number, string]>([big as ComponentStore<unknown>, small as ComponentStore<unknown>]);
    const results = q.run();
    expect(results).toEqual([[3, 30, 'c']]);
  });

  describe('component and optional filters', () => {
    it('tag-only query yields [EntityId] tuples', () => {
      const tag = tagStore([1, 3]);
      const results = new QueryBuilder<[]>([]).withTag(tag).run();
      expect(results).toContainEqual([1]);
      expect(results).toContainEqual([3]);
      expect(results).toHaveLength(2);
    });

    it('withComponent requires a component without yielding it', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const gate = numStore([[1, 0], [3, 0]]);
      const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>])
        .withComponent(gate as ComponentStore<unknown>);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).toContainEqual([1, 10]);
      expect(results).toContainEqual([3, 30]);
    });

    it('withoutComponent excludes entities holding a component', () => {
      const nums = numStore([[1, 10], [2, 20], [3, 30]]);
      const frozen = numStore([[2, 0]]);
      const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>])
        .withoutComponent(frozen as ComponentStore<unknown>);
      const results = q.run();
      expect(results).toHaveLength(2);
      expect(results).not.toContainEqual(expect.arrayContaining([2]));
    });

    it('optional appends the value or undefined and never filters', () => {
      const nums = numStore([[1, 10], [2, 20]]);
      const labels = strStore([[1, 'a']]);
      const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>])
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
      const results = new QueryBuilder<[number]>([nums as ComponentStore<unknown>])
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
      const q = new QueryBuilder<[number]>([nums as ComponentStore<unknown>])
        .anyOf(groupA1, groupA2)
        .anyOf(groupB);
      const ids = q.run().map(r => r[0]).sort((a, b) => a - b);
      expect(ids).toEqual([2, 3]);
    });

    it('pure any-of query with no mandatory source scans the group union', () => {
      const a = tagStore([1, 2]);
      const b = tagStore([2, 3]);
      const q = new QueryBuilder<[]>([]).anyOf(a, b);
      const ids = q.run().map(r => r[0]).sort((x, y) => x - y);
      expect(ids).toEqual([1, 2, 3]);
    });
  });
});
