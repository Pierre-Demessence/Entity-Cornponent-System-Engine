import type { ComponentDef } from '#component-store';

import { describe, expect, it } from 'vitest';

import { ColumnStore } from '#column-store';
import { ComponentStore, simpleComponent } from '#component-store';

interface Vec2 { x: number; y: number }
const FIELDS = ['x', 'y'];
const PosDef = simpleComponent<Vec2>('pos', { x: 'number', y: 'number' });

describe('columnStore', () => {
  it('set and get', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 3, y: 4 });
    expect(s.get(1)).toMatchObject({ x: 3, y: 4 });
    expect(s.has(1)).toBe(true);
    expect(s.size).toBe(1);
  });

  it('get returns undefined for missing entities', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    expect(s.get(9)).toBeUndefined();
    expect(s.has(9)).toBe(false);
  });

  it('view writes through to storage', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 1, y: 2 });
    const p = s.get(1)!;
    p.x += 5;
    expect(s.get(1)!.x).toBe(6);
  });

  it('two views are independent (no aliasing footgun)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 1, y: 1 });
    s.set(2, { x: 2, y: 2 });
    const a = s.get(1)!;
    const b = s.get(2)!;
    expect(a.x).toBe(1);
    expect(b.x).toBe(2);
    a.x = b.x;
    expect(s.get(1)!.x).toBe(2);
    expect(s.get(2)!.x).toBe(2);
  });

  it('view exposes only the declared fields (spread / keys)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 7, y: 8 });
    expect({ ...s.get(1)! }).toEqual({ x: 7, y: 8 });
    expect(Object.keys(s.get(1)!)).toEqual(['x', 'y']);
  });

  it('replace updates in place, keeps size', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 1, y: 1 });
    s.set(1, { x: 9, y: 9 });
    expect(s.get(1)).toMatchObject({ x: 9, y: 9 });
    expect(s.size).toBe(1);
  });

  it('delete preserves other entities (swap-remove integrity)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 1, y: 1 });
    s.set(2, { x: 2, y: 2 });
    s.set(3, { x: 3, y: 3 });
    expect(s.delete(2)).toBe(true);
    expect(s.has(2)).toBe(false);
    expect(s.size).toBe(2);
    expect(s.get(1)).toMatchObject({ x: 1, y: 1 });
    expect(s.get(3)).toMatchObject({ x: 3, y: 3 });
    expect(s.delete(2)).toBe(false);
  });

  it('delete of the last (only) entity', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 1, y: 1 });
    expect(s.delete(1)).toBe(true);
    expect(s.size).toBe(0);
    expect(s.get(1)).toBeUndefined();
  });

  it('a held view survives another entity being deleted (id-bound, not slot-bound)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(1, { x: 10, y: 10 });
    s.set(2, { x: 20, y: 20 });
    s.set(3, { x: 30, y: 30 });
    const view3 = s.get(3)!;
    // Deleting 2 swap-removes 3 into 2's old slot; an id-bound view must still
    // read and write entity 3, not whatever now sits in the old slot.
    s.delete(2);
    expect(view3.x).toBe(30);
    view3.x = 99;
    expect(s.get(3)!.x).toBe(99);
  });

  it('grows beyond initial capacity and keeps all data', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    for (let i = 0; i < 100; i++) s.set(i, { x: i, y: -i });
    expect(s.size).toBe(100);
    for (let i = 0; i < 100; i++) expect(s.get(i)).toMatchObject({ x: i, y: -i });
  });

  it('column() + slotOf() fast path writes through', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(10, { x: 1, y: 1 });
    s.set(20, { x: 2, y: 2 });
    const xs = s.column('x');
    xs[s.slotOf(20)!] += 100;
    expect(s.get(20)!.x).toBe(102);
  });

  it('keys and iteration', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(5, { x: 1, y: 1 });
    s.set(6, { x: 2, y: 2 });
    expect(new Set(s.keys())).toEqual(new Set([5, 6]));
    const seen = new Map<number, number>();
    for (const [id, v] of s) seen.set(id, v.x);
    expect(seen).toEqual(new Map([[5, 1], [6, 2]]));
  });

  describe('subscribe', () => {
    it('fires validate → delete → set in order when replacing', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      const log: string[] = [];
      s.subscribe('validate', id => log.push(`val:${id}`));
      s.subscribe('delete', (id, old) => log.push(`del:${id}:${old.x}`));
      s.subscribe('set', (id, v) => log.push(`set:${id}:${v.x}`));
      s.set(1, { x: 10, y: 0 });
      s.set(1, { x: 20, y: 0 });
      expect(log).toEqual(['val:1', 'set:1:10', 'val:1', 'del:1:10', 'set:1:20']);
    });

    it('delete fires delete with the old value', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      const dels: Array<[number, number]> = [];
      s.subscribe('delete', (id, old) => dels.push([id, old.x]));
      s.set(1, { x: 7, y: 0 });
      s.delete(1);
      expect(dels).toEqual([[1, 7]]);
    });

    it('unsubscribe stops the handler', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      const calls: number[] = [];
      const off = s.subscribe('set', id => calls.push(id));
      s.set(1, { x: 0, y: 0 });
      off();
      s.set(2, { x: 0, y: 0 });
      expect(calls).toEqual([1]);
    });
  });

  describe('dirty tracking', () => {
    it('marks set, view-write, and delete dirty; clearDirty resets', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      s.set(1, { x: 1, y: 1 });
      expect(s.isDirty(1)).toBe(true);
      s.clearDirty();
      expect(s.hasChanges()).toBe(false);
      s.get(1)!.x = 5;
      expect(s.isDirty(1)).toBe(true);
      s.clearDirty();
      s.delete(1);
      expect(s.isDirty(1)).toBe(true);
    });
  });

  describe('toSerialized parity with ComponentStore', () => {
    it('unversioned emits identical [id, value] tuples', () => {
      const col = new ColumnStore<Vec2>(FIELDS);
      const map = new ComponentStore<Vec2>();
      for (const [id, v] of [[1, { x: 1, y: 2 }], [2, { x: 3, y: 4 }]] as [number, Vec2][]) {
        col.set(id, v);
        map.set(id, v);
      }
      expect(col.toSerialized(PosDef)).toEqual(map.toSerialized(PosDef));
    });

    it('versioned emits identical { version, entries }', () => {
      const def: ComponentDef<Vec2> = simpleComponent<Vec2>('pos', { x: 'number', y: 'number' }, { version: 2 });
      const col = new ColumnStore<Vec2>(FIELDS);
      const map = new ComponentStore<Vec2>();
      col.set(1, { x: 5, y: 6 });
      map.set(1, { x: 5, y: 6 });
      expect(col.toSerialized(def)).toEqual(map.toSerialized(def));
    });
  });

  it('clear emits delete for each entry and empties the store', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    const dels: number[] = [];
    s.subscribe('delete', id => dels.push(id));
    s.set(1, { x: 1, y: 1 });
    s.set(2, { x: 2, y: 2 });
    s.clear();
    expect(s.size).toBe(0);
    expect(new Set(dels)).toEqual(new Set([1, 2]));
    expect(s.get(1)).toBeUndefined();
  });
});
