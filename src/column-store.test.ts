import type { ColumnField, ComponentDef } from '#component-store';
import type { EntityId } from '#entity-id';

import { describe, expect, it } from 'vitest';

import { ChangeClock } from '#change-clock';
import { ColumnStore } from '#column-store';
import { ComponentStore, simpleComponent } from '#component-store';
import { packEntityId } from '#entity-id';
import { eid } from '#test-utils';

interface Vec2 { x: number; y: number }
const FIELDS: ColumnField[] = [{ field: 'x', kind: 'f32' }, { field: 'y', kind: 'f32' }];
const PosDef = simpleComponent<Vec2>('pos', { x: 'number', y: 'number' });

describe('columnStore', () => {
  it('set and get', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 3, y: 4 });
    expect(s.get(eid(1))).toMatchObject({ x: 3, y: 4 });
    expect(s.has(eid(1))).toBe(true);
    expect(s.size).toBe(1);
  });

  it('get returns undefined for missing entities', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    expect(s.get(eid(9))).toBeUndefined();
    expect(s.has(eid(9))).toBe(false);
  });

  it('view writes through to storage', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 1, y: 2 });
    const p = s.get(eid(1))!;
    p.x += 5;
    expect(s.get(eid(1))!.x).toBe(6);
  });

  it('two views are independent (no aliasing footgun)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 1, y: 1 });
    s.set(eid(2), { x: 2, y: 2 });
    const a = s.get(eid(1))!;
    const b = s.get(eid(2))!;
    expect(a.x).toBe(1);
    expect(b.x).toBe(2);
    a.x = b.x;
    expect(s.get(eid(1))!.x).toBe(2);
    expect(s.get(eid(2))!.x).toBe(2);
  });

  it('view exposes only the declared fields (spread / keys)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 7, y: 8 });
    expect({ ...s.get(eid(1))! }).toEqual({ x: 7, y: 8 });
    expect(Object.keys(s.get(eid(1))!)).toEqual(['x', 'y']);
  });

  it('replace updates in place, keeps size', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 1, y: 1 });
    s.set(eid(1), { x: 9, y: 9 });
    expect(s.get(eid(1))).toMatchObject({ x: 9, y: 9 });
    expect(s.size).toBe(1);
  });

  it('delete preserves other entities (swap-remove integrity)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 1, y: 1 });
    s.set(eid(2), { x: 2, y: 2 });
    s.set(eid(3), { x: 3, y: 3 });
    expect(s.delete(eid(2))).toBe(true);
    expect(s.has(eid(2))).toBe(false);
    expect(s.size).toBe(2);
    expect(s.get(eid(1))).toMatchObject({ x: 1, y: 1 });
    expect(s.get(eid(3))).toMatchObject({ x: 3, y: 3 });
    expect(s.delete(eid(2))).toBe(false);
  });

  it('delete of the last (only) entity', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 1, y: 1 });
    expect(s.delete(eid(1))).toBe(true);
    expect(s.size).toBe(0);
    expect(s.get(eid(1))).toBeUndefined();
  });

  it('a held view survives another entity being deleted (id-bound, not slot-bound)', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 10, y: 10 });
    s.set(eid(2), { x: 20, y: 20 });
    s.set(eid(3), { x: 30, y: 30 });
    const view3 = s.get(eid(3))!;
    // Deleting 2 swap-removes 3 into 2's old slot; an id-bound view must still
    // read and write entity 3, not whatever now sits in the old slot.
    s.delete(eid(2));
    expect(view3.x).toBe(30);
    view3.x = 99;
    expect(s.get(eid(3))!.x).toBe(99);
  });

  it('repeated get and iteration return the same cached view', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 1, y: 1 });
    const view = s.get(eid(1))!;
    expect(s.get(eid(1))).toBe(view);
    expect([...s][0][1]).toBe(view);
    s.set(eid(1), { x: 5, y: 5 });
    expect(s.get(eid(1))).toBe(view);
    expect(view.x).toBe(5);
  });

  it('delete and clear drop the cached view; a re-added row gets a fresh one', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(1), { x: 1, y: 1 });
    const first = s.get(eid(1))!;
    s.delete(eid(1));
    expect(first.x).toBeUndefined();
    s.set(eid(1), { x: 2, y: 2 });
    const second = s.get(eid(1))!;
    expect(second).not.toBe(first);
    expect(second.x).toBe(2);
    s.clear();
    s.set(eid(1), { x: 3, y: 3 });
    expect(s.get(eid(1))).not.toBe(second);
    expect(s.get(eid(1))!.x).toBe(3);
  });

  it('held views stay bound across swap-remove, grow and page boundaries', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    const far = eid(1 << 12);
    s.set(eid(0), { x: 0, y: 0 });
    s.set(eid(1), { x: 1, y: 1 });
    s.set(far, { x: 2, y: 2 });
    const v1 = s.get(eid(1))!;
    const vFar = s.get(far)!;
    s.delete(eid(0));
    for (let i = 2; i < 100; i++) s.set(eid(i), { x: i, y: i });
    expect(v1.x).toBe(1);
    expect(vFar.x).toBe(2);
    vFar.x = 42;
    expect(s.get(far)).toBe(vFar);
    expect(s.get(far)!.x).toBe(42);
  });

  it('grows beyond initial capacity and keeps all data', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    for (let i = 0; i < 100; i++) s.set(eid(i), { x: i, y: -i });
    expect(s.size).toBe(100);
    for (let i = 0; i < 100; i++) expect(s.get(eid(i))).toMatchObject({ x: i, y: -i });
  });

  it('handles sparse and large entity ids across sparse-set pages', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    // 4095/4096 straddle a page boundary (page size 4096); others are far apart.
    const ids = [0, 4095, 4096, 5000, 1_000_000].map(i => eid(i));
    ids.forEach((id, i) => s.set(id, { x: id, y: i }));
    expect(s.size).toBe(5);
    for (const id of ids) expect(s.get(id)!.x).toBe(id);
    s.delete(eid(4096));
    expect(s.has(eid(4096))).toBe(false);
    expect(s.get(eid(4095))!.x).toBe(4095);
    expect(s.get(eid(1_000_000))!.x).toBe(1_000_000);
    expect(new Set(s.keys())).toEqual(new Set([0, 4095, 5000, 1_000_000]));
  });

  it('stores per-field typed columns (f64 exact, i32 truncates)', () => {
    const s = new ColumnStore<{ big: number; flag: number }>([
      { field: 'big', kind: 'f64' },
      { field: 'flag', kind: 'i32' },
    ]);
    s.set(eid(1), { big: 2 ** 40 + 1, flag: 3.9 });
    expect(s.get(eid(1))!.big).toBe(2 ** 40 + 1); // f64 keeps a large integer exact
    expect(s.get(eid(1))!.flag).toBe(3); // i32 truncates toward zero
    expect(s.column('big')).toBeInstanceOf(Float64Array);
    expect(s.column('flag')).toBeInstanceOf(Int32Array);
  });

  it('shared:true backs columns with SharedArrayBuffer (and stays shared across grow)', () => {
    const s = new ColumnStore<Vec2>(FIELDS, { shared: true });
    s.set(eid(1), { x: 3, y: 4 });
    expect(s.get(eid(1))).toMatchObject({ x: 3, y: 4 });
    expect(s.column('x').buffer).toBeInstanceOf(SharedArrayBuffer);
    for (let i = 0; i < 100; i++) s.set(eid(i), { x: i, y: -i });
    expect(s.column('x').buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(s.get(eid(50))).toMatchObject({ x: 50, y: -50 });
  });

  it('column() + slotOf() fast path writes through', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(10), { x: 1, y: 1 });
    s.set(eid(20), { x: 2, y: 2 });
    const xs = s.column('x');
    xs[s.slotOf(eid(20))!] += 100;
    expect(s.get(eid(20))!.x).toBe(102);
  });

  it('keys and iteration', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    s.set(eid(5), { x: 1, y: 1 });
    s.set(eid(6), { x: 2, y: 2 });
    expect(new Set(s.keys())).toEqual(new Set([5, 6]));
    const seen = new Map<number, number>();
    for (const [id, v] of s) seen.set(id, v.x);
    expect(seen).toEqual(new Map([[5, 1], [6, 2]]));
  });

  describe('recycled ids', () => {
    const stale = packEntityId(5, 0);
    const current = packEntityId(5, 1);

    function recycled(): ColumnStore<Vec2> {
      const s = new ColumnStore<Vec2>(FIELDS);
      s.set(stale, { x: 1, y: 1 });
      s.delete(stale);
      s.set(current, { x: 2, y: 2 });
      return s;
    }

    it('a stale id misses on every read', () => {
      const s = recycled();
      expect(s.has(stale)).toBe(false);
      expect(s.get(stale)).toBeUndefined();
      expect(s.getMut(stale)).toBeUndefined();
      expect(s.slotOf(stale)).toBeUndefined();
      expect(s.addedTick(stale)).toBe(0);
      expect(s.get(current)).toMatchObject({ x: 2, y: 2 });
    });

    it('a stale id never deletes or marks the new occupant', () => {
      const clock = new ChangeClock();
      const s = new ColumnStore<Vec2>(FIELDS, { clock });
      s.set(stale, { x: 1, y: 1 });
      s.delete(stale);
      s.set(current, { x: 2, y: 2 });
      const changed = s.changedTick(current);
      clock.tick++;
      expect(s.delete(stale)).toBe(false);
      s.markChanged(stale);
      expect(s.has(current)).toBe(true);
      expect(s.changedTick(current)).toBe(changed);
    });

    it('setting a stale id while its index is held by another entity throws', () => {
      const s = recycled();
      expect(() => s.set(stale, { x: 9, y: 9 })).toThrow(/index 5/);
      expect(s.get(current)).toMatchObject({ x: 2, y: 2 });
    });

    it('a view kept from the previous occupant does not read or write the new one', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      s.set(stale, { x: 1, y: 1 });
      const old = s.get(stale)!;
      s.delete(stale);
      s.set(current, { x: 2, y: 2 });
      expect(old.x).toBeUndefined();
      old.x = 50;
      expect(s.get(current)).toMatchObject({ x: 2, y: 2 });
      expect(s.get(current)).not.toBe(old);
    });

    it('works for shared-memory stores', () => {
      const s = new ColumnStore<Vec2>(FIELDS, { shared: true });
      s.set(stale, { x: 1, y: 1 });
      s.delete(stale);
      s.set(current, { x: 2, y: 2 });
      expect(s.has(stale)).toBe(false);
      expect(s.get(current)).toMatchObject({ x: 2, y: 2 });
    });
  });

  describe('subscribe', () => {
    it('fires validate → delete → set in order when replacing', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      const log: string[] = [];
      s.subscribe('validate', id => log.push(`val:${id}`));
      s.subscribe('delete', (id, old) => log.push(`del:${id}:${old.x}`));
      s.subscribe('set', (id, v) => log.push(`set:${id}:${v.x}`));
      s.set(eid(1), { x: 10, y: 0 });
      s.set(eid(1), { x: 20, y: 0 });
      expect(log).toEqual(['val:1', 'set:1:10', 'val:1', 'del:1:10', 'set:1:20']);
    });

    it('delete fires delete with the old value', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      const dels: Array<[number, number]> = [];
      s.subscribe('delete', (id, old) => dels.push([id, old.x]));
      s.set(eid(1), { x: 7, y: 0 });
      s.delete(eid(1));
      expect(dels).toEqual([[1, 7]]);
    });

    it('unsubscribe stops the handler', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      const calls: number[] = [];
      const off = s.subscribe('set', id => calls.push(id));
      s.set(eid(1), { x: 0, y: 0 });
      off();
      s.set(eid(2), { x: 0, y: 0 });
      expect(calls).toEqual([1]);
    });
  });

  describe('change ticks', () => {
    it('stamps insert, replace, view write, getMut and markChanged', () => {
      const clock = new ChangeClock();
      const s = new ColumnStore<Vec2>(FIELDS, { clock });
      expect(s.clock).toBe(clock);
      s.set(eid(1), { x: 1, y: 1 });
      expect(s.addedTick(eid(1))).toBe(1);
      expect(s.changedTick(eid(1))).toBe(1);

      clock.tick = 2;
      s.set(eid(1), { x: 2, y: 2 });
      expect(s.addedTick(eid(1))).toBe(1);
      expect(s.changedTick(eid(1))).toBe(2);

      clock.tick = 3;
      const view = s.get(eid(1))!;
      expect(s.changedTick(eid(1))).toBe(2);
      view.x = 5;
      expect(s.changedTick(eid(1))).toBe(3);

      clock.tick = 4;
      expect(s.getMut(eid(1))).toBe(view);
      expect(s.changedTick(eid(1))).toBe(4);

      clock.tick = 5;
      s.markChanged(eid(1));
      s.markChanged(eid(99));
      expect(s.changedTick(eid(1))).toBe(5);
      expect(s.changedTick(eid(99))).toBe(0);
    });

    it('stamps follow the entity across a swap-remove', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      s.set(eid(1), { x: 1, y: 1 });
      s.clock.tick = 8;
      s.set(eid(2), { x: 2, y: 2 });
      s.delete(eid(1));
      expect(s.addedTick(eid(2))).toBe(8);
      expect(s.changedTick(eid(2))).toBe(8);
      expect(s.addedTick(eid(1))).toBe(0);
    });

    it('stamps survive a grow', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      for (let i = 0; i < 40; i++) {
        s.clock.tick = i + 1;
        s.set(eid(i), { x: i, y: i });
      }
      expect(s.addedTick(eid(0))).toBe(1);
      expect(s.changedTick(eid(39))).toBe(40);
    });

    it('a stale view write after delete stamps nothing', () => {
      const s = new ColumnStore<Vec2>(FIELDS);
      s.set(eid(1), { x: 1, y: 1 });
      const view = s.get(eid(1))!;
      s.delete(eid(1));
      view.x = 3;
      expect(s.changedTick(eid(1))).toBe(0);
    });
  });

  describe('toSerialized parity with ComponentStore', () => {
    it('unversioned emits identical [id, value] tuples', () => {
      const col = new ColumnStore<Vec2>(FIELDS);
      const map = new ComponentStore<Vec2>();
      for (const [id, v] of [[1, { x: 1, y: 2 }], [2, { x: 3, y: 4 }]] as [EntityId, Vec2][]) {
        col.set(id, v);
        map.set(id, v);
      }
      expect(col.toSerialized(PosDef)).toEqual(map.toSerialized(PosDef));
    });

    it('versioned emits identical { version, entries }', () => {
      const def: ComponentDef<Vec2> = simpleComponent<Vec2>('pos', { x: 'number', y: 'number' }, { version: 2 });
      const col = new ColumnStore<Vec2>(FIELDS);
      const map = new ComponentStore<Vec2>();
      col.set(eid(1), { x: 5, y: 6 });
      map.set(eid(1), { x: 5, y: 6 });
      expect(col.toSerialized(def)).toEqual(map.toSerialized(def));
    });
  });

  it('clear emits delete for each entry and empties the store', () => {
    const s = new ColumnStore<Vec2>(FIELDS);
    const dels: number[] = [];
    s.subscribe('delete', id => dels.push(id));
    s.set(eid(1), { x: 1, y: 1 });
    s.set(eid(2), { x: 2, y: 2 });
    s.clear();
    expect(s.size).toBe(0);
    expect(new Set(dels)).toEqual(new Set([1, 2]));
    expect(s.get(eid(1))).toBeUndefined();
  });
});
