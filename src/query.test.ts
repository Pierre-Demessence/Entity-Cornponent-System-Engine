import { describe, expect, it } from 'vitest';

import { ComponentStore, TagStore } from './component-store';
import { QueryBuilder } from './query';

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
});
