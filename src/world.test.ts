import type { ComponentDef, TagDef } from '#component-store';
import type { EntityId } from '#entity-id';
import type { SpatialStructure } from '#spatial-structure';
import type { EntityTemplate } from '#template';

import { describe, expect, it, vi } from 'vitest';

import { EcsWorld } from '#world';

interface Pos { x: number; y: number }

/** Minimal exact-position index over any numeric shape — core tests stay free of module imports. */
class CellIndex<P extends object = Pos> implements SpatialStructure<P> {
  private readonly cells = new Map<string, Set<EntityId>>();
  add(id: EntityId, pos: P): void {
    const key = keyOf(pos);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(id);
  }

  at(...coords: number[]): EntityId[] { return [...this.cells.get(coords.join(',')) ?? []]; }
  clear(): void { this.cells.clear(); }
  move(id: EntityId, from: P, to: P): void {
    this.remove(id, from);
    this.add(id, to);
  }

  queryAt(pos: P): Iterable<EntityId> { return this.cells.get(keyOf(pos)) ?? []; }
  queryNear(): Iterable<EntityId> { return []; }
  queryRect(): Iterable<EntityId> { return []; }
  remove(id: EntityId, pos: P): void { this.cells.get(keyOf(pos))?.delete(id); }
}

function keyOf(pos: object): string {
  return Object.values(pos).join(',');
}
interface Health { hp: number }

const PosDef: ComponentDef<Pos> = {
  name: 'pos',
  serialize: v => v,
  deserialize: (raw) => {
    const r = raw as Pos;
    return { x: r.x, y: r.y };
  },
};

const HealthDef: ComponentDef<Health> = {
  name: 'health',
  requires: ['pos'],
  serialize: v => v,
  deserialize: (raw) => {
    const r = raw as Health;
    return { hp: r.hp };
  },
};

const FlagTag: TagDef = { name: 'flag' };
const MarkTag: TagDef = { name: 'mark' };

describe('ecsWorld', () => {
  describe('entity lifecycle', () => {
    it('allocates sequential entity ids', () => {
      const w = new EcsWorld();
      expect(w.createEntity()).toBe(0);
      expect(w.createEntity()).toBe(1);
      expect(w.createEntity()).toBe(2);
    });

    it('destroyEntity clears all component and tag stores', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const tag = w.registerTag(FlagTag);
      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2 });
      tag.add(id);

      w.destroyEntity(id);

      expect(pos.has(id)).toBe(false);
      expect(tag.has(id)).toBe(false);
    });

    it('queueDestroy defers until flushCommands', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2 });

      w.queueDestroy(id);
      expect(pos.has(id)).toBe(true);

      w.flushCommands();
      expect(pos.has(id)).toBe(false);
    });

    it('queueDestroy dedupes repeated ids', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const deletes: number[] = [];
      pos.subscribe('delete', id => deletes.push(id));
      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });

      w.queueDestroy(id);
      w.queueDestroy(id);
      w.queueDestroy(id);
      w.flushCommands();

      expect(deletes).toEqual([id]);
    });

    it('flushCommands is a no-op when queue is empty', () => {
      const w = new EcsWorld();
      expect(() => w.flushCommands()).not.toThrow();
    });

    it('flushCommands allows safe iteration-then-destroy', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      const b = w.createEntity();
      pos.set(b, { x: 1, y: 1 });
      const c = w.createEntity();
      pos.set(c, { x: 2, y: 2 });

      // Simulate a system iterating then queuing destruction.
      for (const [id, p] of pos) {
        if (p.x >= 1)
          w.queueDestroy(id);
      }
      w.flushCommands();

      expect(pos.has(a)).toBe(true);
      expect(pos.has(b)).toBe(false);
      expect(pos.has(c)).toBe(false);
    });
  });

  describe('registration', () => {
    it('throws when registering the same component twice', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      expect(() => w.registerComponent(PosDef)).toThrow(/already registered/);
    });

    it('throws when registering the same tag twice', () => {
      const w = new EcsWorld();
      w.registerTag(FlagTag);
      expect(() => w.registerTag(FlagTag)).toThrow(/already registered/);
    });

    it('exposes stores via getStore and getStoreByName', () => {
      const w = new EcsWorld();
      const store = w.registerComponent(PosDef);
      expect(w.getStore(PosDef)).toBe(store);
      expect(w.getStoreByName('pos')).toBe(store);
      expect(w.getStoreByName('missing')).toBeUndefined();
    });
  });

  describe('entity liveness', () => {
    it('isAlive tracks create and destroy', () => {
      const w = new EcsWorld();
      const id = w.createEntity();
      expect(w.isAlive(id)).toBe(true);
      w.destroyEntity(id);
      expect(w.isAlive(id)).toBe(false);
    });

    it('isAlive is false for a never-created id', () => {
      const w = new EcsWorld();
      expect(w.isAlive(42)).toBe(false);
    });

    it('entityCount reflects create and destroy', () => {
      const w = new EcsWorld();
      expect(w.entityCount()).toBe(0);
      const a = w.createEntity();
      const b = w.createEntity();
      expect(w.entityCount()).toBe(2);
      w.destroyEntity(a);
      expect(w.entityCount()).toBe(1);
      void b;
    });

    it('queueDestroy keeps the entity alive until flushCommands', () => {
      const w = new EcsWorld();
      const id = w.createEntity();
      w.queueDestroy(id);
      expect(w.isAlive(id)).toBe(true);
      w.flushCommands();
      expect(w.isAlive(id)).toBe(false);
    });

    it('spawn marks the entity alive', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      w.registerComponent(HealthDef);
      w.registerTag(FlagTag);
      const id = w.spawn({ name: 't', components: { health: { hp: 1 }, pos: { x: 0, y: 0 } } });
      expect(w.isAlive(id)).toBe(true);
    });

    it('clearAll resets liveness', () => {
      const w = new EcsWorld();
      w.createEntity();
      w.createEntity();
      w.clearAll();
      expect(w.entityCount()).toBe(0);
      expect(w.isAlive(0)).toBe(false);
    });

    it('liveEntities iterates the live set', () => {
      const w = new EcsWorld();
      const a = w.createEntity();
      const b = w.createEntity();
      w.destroyEntity(a);
      expect([...w.liveEntities()]).toEqual([b]);
    });

    it('spawnBatch marks every entity alive', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      const ids = w.spawnBatch([
        { template: { name: 'a', components: { pos: { x: 0, y: 0 } } } },
        { template: { name: 'b', components: { pos: { x: 1, y: 1 } } } },
      ]);
      expect(ids.every(id => w.isAlive(id))).toBe(true);
      expect(w.entityCount()).toBe(2);
    });

    it('isAlive is already false inside an EntityDestroyed handler', () => {
      const w = new EcsWorld();
      const id = w.createEntity();
      let seen: boolean | undefined;
      w.lifecycle.on('EntityDestroyed', () => {
        seen = w.isAlive(id);
      });
      w.destroyEntity(id);
      w.lifecycle.flush();
      expect(seen).toBe(false);
    });

    it('loadJSON discards pending queued destroys', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      const saved = JSON.parse(JSON.stringify(w.toJSON()));

      w.queueDestroy(a);
      w.loadJSON(saved);
      w.flushCommands(); // must not destroy the reloaded entity

      expect(w.isAlive(a)).toBe(true);
    });

    it('transferEntity marks the entity alive on the destination', () => {
      const src = new EcsWorld();
      src.registerComponent(PosDef);
      const id = src.spawn({ name: 't', components: { pos: { x: 1, y: 2 } } });

      const dst = new EcsWorld();
      dst.registerComponent(PosDef);
      dst.transferEntity(id, src);

      expect(dst.isAlive(id)).toBe(true);
    });

    it('loadJSON rebuilds liveness from persisted membership', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const tag = w.registerTag(FlagTag);
      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      const b = w.createEntity();
      tag.add(b);
      const saved = JSON.parse(JSON.stringify(w.toJSON()));

      const restored = new EcsWorld();
      restored.registerComponent(PosDef);
      restored.registerTag(FlagTag);
      restored.loadJSON(saved);

      expect(restored.isAlive(a)).toBe(true);
      expect(restored.isAlive(b)).toBe(true);
      expect(restored.entityCount()).toBe(2);
    });
  });

  describe('deferred structural changes', () => {
    it('queueAdd and queueRemove apply at flushCommands', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const health = w.registerComponent(HealthDef);
      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });

      w.queueAdd(HealthDef, id, { hp: 7 });
      expect(health.has(id)).toBe(false);
      w.flushCommands();
      expect(health.get(id)).toEqual({ hp: 7 });

      w.queueRemove(HealthDef, id);
      expect(health.has(id)).toBe(true);
      w.flushCommands();
      expect(health.has(id)).toBe(false);
    });

    it('queueAddTag and queueRemoveTag apply at flushCommands', () => {
      const w = new EcsWorld();
      const tag = w.registerTag(FlagTag);
      const id = w.createEntity();

      w.queueAddTag(FlagTag, id);
      expect(tag.has(id)).toBe(false);
      w.flushCommands();
      expect(tag.has(id)).toBe(true);

      w.queueRemoveTag(FlagTag, id);
      w.flushCommands();
      expect(tag.has(id)).toBe(false);
    });

    it('queueSpawn reserves an id and applies at flush', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const id = w.queueSpawn({ name: 'p', components: { pos: { x: 2, y: 3 } } });

      expect(w.isAlive(id)).toBe(false);
      expect(pos.has(id)).toBe(false);

      w.flushCommands();
      expect(w.isAlive(id)).toBe(true);
      expect(pos.get(id)).toEqual({ x: 2, y: 3 });
    });

    it('queueAdd throws immediately for an unregistered component', () => {
      const w = new EcsWorld();
      expect(() => w.queueAdd(PosDef, 0, { x: 0, y: 0 })).toThrow(/not registered/);
    });

    it('applies commands in insertion order (spawn → add → destroy)', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const id = w.queueSpawn();
      w.queueAdd(PosDef, id, { x: 9, y: 9 });
      w.queueDestroy(id);

      w.flushCommands();
      expect(w.isAlive(id)).toBe(false);
      expect(pos.has(id)).toBe(false);
    });

    it('collapses repeated queued destroys to one destruction per flush', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const destroyed: number[] = [];
      w.lifecycle.on('EntityDestroyed', e => destroyed.push(e.id));
      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });

      w.queueDestroy(id);
      w.queueDestroy(id);
      w.queueDestroy(id);
      w.flushCommands();
      w.lifecycle.flush();

      expect(destroyed).toEqual([id]);
    });

    it('deferred queueDestroy in a query loop is safe and applies at flush', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      const b = w.createEntity();
      pos.set(b, { x: 5, y: 0 });

      for (const [id, p] of w.query(PosDef)) {
        if (p.x > 0)
          w.queueDestroy(id);
      }
      w.flushCommands();

      expect(w.isAlive(a)).toBe(true);
      expect(w.isAlive(b)).toBe(false);
    });

    it('spawning into a store during its own query loop is safe when deferred', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.createEntity();
      const seed = 0;
      pos.set(seed, { x: 1, y: 1 });

      for (const [, p] of w.query(PosDef)) {
        w.queueSpawn({ name: 'clone', components: { pos: { x: p.x, y: p.y } } });
      }
      w.flushCommands();

      expect(w.query(PosDef).count()).toBe(2);
    });

    it('throws in DEV when a store is mutated during query iteration', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      const b = w.createEntity();
      pos.set(b, { x: 1, y: 1 });

      expect(() => {
        for (const [id] of w.query(PosDef)) {
          pos.delete(id);
        }
      }).toThrow(/Structural change during query iteration/);
    });

    it('a value replace during query iteration does not trip the guard', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });

      expect(() => {
        for (const [id, p] of w.query(PosDef)) {
          pos.set(id, { x: p.x + 1, y: p.y });
        }
      }).not.toThrow();
    });

    it('a queued add after a queued destroy of the same id is dropped', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });

      w.queueDestroy(id);
      w.queueAdd(PosDef, id, { x: 9, y: 9 });
      w.flushCommands();

      expect(w.isAlive(id)).toBe(false);
      expect(pos.has(id)).toBe(false);
      expect(w.query(PosDef).count()).toBe(0);
    });

    it('a queued add ordered before its dependency does not warn (batched validation)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const w = new EcsWorld();
        w.registerComponent(PosDef);
        w.registerComponent(HealthDef); // requires pos
        const id = w.queueSpawn();
        w.queueAdd(HealthDef, id, { hp: 1 }); // enqueued before pos
        w.queueAdd(PosDef, id, { x: 0, y: 0 });
        w.flushCommands();
        expect(warn).not.toHaveBeenCalled();
      }
      finally {
        warn.mockRestore();
      }
    });

    it('flush validation still warns when a requirement is genuinely unmet', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const w = new EcsWorld();
        w.registerComponent(PosDef);
        w.registerComponent(HealthDef);
        const id = w.createEntity();
        w.queueAdd(HealthDef, id, { hp: 1 }); // pos never provided
        w.flushCommands();
        expect(warn).toHaveBeenCalled();
      }
      finally {
        warn.mockRestore();
      }
    });

    it('endOfTick applies queued structural changes then dispatches their events in one pass', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      const events: string[] = [];
      w.lifecycle.on('EntityCreated', () => events.push('Created'));

      const id = w.queueSpawn({ name: 'p', components: { pos: { x: 0, y: 0 } } });
      w.endOfTick();

      expect(events).toEqual(['Created']);
      expect(w.isAlive(id)).toBe(true);
    });
  });

  describe('enableSpatial', () => {
    it('keeps the spatial index in sync with set/delete', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const grid = w.enableSpatial(PosDef, new CellIndex());

      const id = w.createEntity();
      pos.set(id, { x: 3, y: 4 });
      expect(grid.at(3, 4)).toEqual([id]);

      pos.set(id, { x: 1, y: 1 });
      expect(grid.at(3, 4)).toEqual([]);
      expect(grid.at(1, 1)).toEqual([id]);

      pos.delete(id);
      expect(grid.at(1, 1)).toEqual([]);
    });

    it('returns the structure it was given', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      const grid = new CellIndex();
      expect(w.enableSpatial(PosDef, grid)).toBe(grid);
    });

    it('indexes entities that already hold the component', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const id = w.createEntity();
      pos.set(id, { x: 2, y: 2 });
      const grid = w.enableSpatial(PosDef, new CellIndex());
      expect(grid.at(2, 2)).toEqual([id]);
    });

    it('indexes a component of any shape', () => {
      interface Pos3 { x: number; y: number; z: number }
      const Pos3Def: ComponentDef<Pos3> = { name: 'pos3', deserialize: raw => raw as Pos3, serialize: v => v };
      const w = new EcsWorld();
      const pos = w.registerComponent(Pos3Def);
      const grid = w.enableSpatial(Pos3Def, new CellIndex<Pos3>());
      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2, z: 3 });
      w.move(Pos3Def, id, { x: 1, y: 2, z: 4 });
      expect(grid.at(1, 2, 3)).toEqual([]);
      expect(grid.at(1, 2, 4)).toEqual([id]);
      expect(pos.get(id)).toEqual({ x: 1, y: 2, z: 4 });
    });

    it('splits one component into several indexes by tag', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const flag = w.registerTag(FlagTag);
      const all = w.enableSpatial(PosDef, new CellIndex());
      const flagged = w.enableSpatial(PosDef, new CellIndex(), { withTag: FlagTag });

      const plain = w.createEntity();
      pos.set(plain, { x: 0, y: 0 });
      const tagFirst = w.createEntity();
      flag.add(tagFirst);
      pos.set(tagFirst, { x: 0, y: 0 });
      const tagLast = w.createEntity();
      pos.set(tagLast, { x: 0, y: 0 });
      flag.add(tagLast);

      expect(all.at(0, 0)).toEqual([plain, tagFirst, tagLast]);
      expect(flagged.at(0, 0)).toEqual([tagFirst, tagLast]);

      flag.delete(tagLast);
      expect(flagged.at(0, 0)).toEqual([tagFirst]);
      pos.delete(tagFirst);
      expect(flagged.at(0, 0)).toEqual([]);
      expect(all.at(0, 0)).toEqual([plain, tagLast]);
    });

    it('drops a destroyed entity from a tag-filtered index', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const flag = w.registerTag(FlagTag);
      const flagged = w.enableSpatial(PosDef, new CellIndex(), { withTag: FlagTag });
      const id = w.createEntity();
      pos.set(id, { x: 4, y: 4 });
      flag.add(id);
      w.destroyEntity(id);
      expect(flagged.at(4, 4)).toEqual([]);
    });

    it('move() updates the value and every index holding the entity, and no other', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const flag = w.registerTag(FlagTag);
      const all = w.enableSpatial(PosDef, new CellIndex());
      const flagged = w.enableSpatial(PosDef, new CellIndex(), { withTag: FlagTag });
      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });

      w.move(PosDef, id, { x: 5, y: 6 });
      expect(pos.get(id)).toEqual({ x: 5, y: 6 });
      expect(all.at(0, 0)).toEqual([]);
      expect(all.at(5, 6)).toEqual([id]);
      expect(flagged.at(5, 6)).toEqual([]);

      flag.add(id);
      w.move(PosDef, id, { x: 7, y: 7 });
      expect(flagged.at(5, 6)).toEqual([]);
      expect(flagged.at(7, 7)).toEqual([id]);
    });

    it('move() is a no-op for an entity without the component', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      const grid = w.enableSpatial(PosDef, new CellIndex());
      w.move(PosDef, w.createEntity(), { x: 1, y: 1 });
      expect(grid.at(1, 1)).toEqual([]);
    });

    it('throws when one structure backs two indexes', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      w.registerTag(FlagTag);
      const grid = w.enableSpatial(PosDef, new CellIndex());
      expect(() => w.enableSpatial(PosDef, grid, { withTag: FlagTag })).toThrow(/already backs an index/);
    });

    it('throws on an unregistered component or tag', () => {
      const w = new EcsWorld();
      expect(() => w.enableSpatial(PosDef, new CellIndex())).toThrow(/must be registered/);
      w.registerComponent(PosDef);
      expect(() => w.enableSpatial(PosDef, new CellIndex(), { withTag: FlagTag })).toThrow(/not registered/);
    });

    it('move() throws if the component has no index', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      expect(() => w.move(PosDef, 0, { x: 1, y: 1 })).toThrow(/enableSpatial\(\) for component "pos"/);
    });
  });

  describe('spawn', () => {
    const template: EntityTemplate = {
      name: 'test',
      components: { health: { hp: 10 }, pos: { x: 1, y: 2 } },
      tags: ['flag'],
    };

    it('creates an entity with template components and tags', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const health = w.registerComponent(HealthDef);
      const tag = w.registerTag(FlagTag);

      const id = w.spawn(template);

      expect(pos.get(id)).toEqual({ x: 1, y: 2 });
      expect(health.get(id)).toEqual({ hp: 10 });
      expect(tag.has(id)).toBe(true);
    });

    it('applies overrides merged over template data', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.registerComponent(HealthDef);
      w.registerTag(FlagTag);

      const id = w.spawn(template, { pos: { x: 99, y: 2 } });

      expect(pos.get(id)).toEqual({ x: 99, y: 2 });
    });

    it('clones template component data (no aliasing)', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.registerComponent(HealthDef);
      w.registerTag(FlagTag);

      const id1 = w.spawn(template);
      const id2 = w.spawn(template);
      const p1 = pos.get(id1)!;
      p1.x = 777;
      expect(pos.get(id2)!.x).toBe(1);
    });

    it('throws on unknown component or tag', () => {
      const w = new EcsWorld();
      expect(() => w.spawn({ name: 't', components: { missing: {} } })).toThrow(/not registered/);
      w.registerComponent(PosDef);
      expect(() => w.spawn({ name: 't', components: { pos: { x: 0, y: 0 } }, tags: ['missing'] })).toThrow(/not registered/);
    });
  });

  describe('spawnBatch', () => {
    const t1: EntityTemplate = {
      name: 'a',
      components: { pos: { x: 1, y: 1 } },
      tags: ['flag'],
    };
    const t2: EntityTemplate = {
      name: 'b',
      components: { health: { hp: 3 } },
    };

    it('spawns multiple entities and returns their ids in order', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      w.registerComponent(HealthDef);
      w.registerTag(FlagTag);

      const ids = w.spawnBatch([{ template: t1 }, { template: t2 }]);

      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(0);
      expect(ids[1]).toBe(1);
    });

    it('applies per-entry overrides', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.registerComponent(HealthDef);
      w.registerTag(FlagTag);

      const [a] = w.spawnBatch([
        { overrides: { pos: { x: 99, y: 1 } }, template: t1 },
      ]);

      expect(pos.get(a)).toEqual({ x: 99, y: 1 });
    });

    it('attaches tags from each entry', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      w.registerComponent(HealthDef);
      const tag = w.registerTag(FlagTag);

      const [a, b] = w.spawnBatch([{ template: t1 }, { template: t2 }]);

      expect(tag.has(a)).toBe(true);
      expect(tag.has(b)).toBe(false);
    });

    it('returns an empty array for an empty batch', () => {
      const w = new EcsWorld();
      expect(w.spawnBatch([])).toEqual([]);
    });
  });

  describe('transferEntity', () => {
    it('copies present components from another world, preserving the id', () => {
      const src = new EcsWorld();
      const pos1 = src.registerComponent(PosDef);
      const health1 = src.registerComponent(HealthDef);
      src.registerTag(FlagTag);
      const id = src.spawn({
        name: 't',
        components: { health: { hp: 8 }, pos: { x: 3, y: 4 } },
      });

      const dst = new EcsWorld();
      const pos2 = dst.registerComponent(PosDef);
      const health2 = dst.registerComponent(HealthDef);
      dst.registerTag(FlagTag);

      dst.transferEntity(id, src);

      expect(pos2.get(id)).toEqual({ x: 3, y: 4 });
      expect(health2.get(id)).toEqual({ hp: 8 });
      // Deep copy: mutating the source must not leak into the destination.
      pos1.get(id)!.x = 999;
      expect(pos2.get(id)!.x).toBe(3);
      // Tags are NOT transferred — that's a game-semantic choice.
      void health1;
    });

    it('does not transfer tags', () => {
      const src = new EcsWorld();
      src.registerComponent(PosDef);
      const srcTag = src.registerTag(FlagTag);
      const id = src.spawn({ name: 't', components: { pos: { x: 0, y: 0 } }, tags: ['flag'] });
      expect(srcTag.has(id)).toBe(true);

      const dst = new EcsWorld();
      dst.registerComponent(PosDef);
      const dstTag = dst.registerTag(FlagTag);
      dst.transferEntity(id, src);

      expect(dstTag.has(id)).toBe(false);
    });

    it('filters to a subset of component names', () => {
      const src = new EcsWorld();
      src.registerComponent(PosDef);
      src.registerComponent(HealthDef);
      const id = src.spawn({
        name: 't',
        components: { health: { hp: 2 }, pos: { x: 1, y: 2 } },
      });

      const dst = new EcsWorld();
      const pos = dst.registerComponent(PosDef);
      const health = dst.registerComponent(HealthDef);
      dst.transferEntity(id, src, ['pos']);

      expect(pos.get(id)).toEqual({ x: 1, y: 2 });
      expect(health.get(id)).toBeUndefined();
    });

    it('throws on unknown component name in the filter', () => {
      const src = new EcsWorld();
      src.registerComponent(PosDef);
      const id = src.createEntity();

      const dst = new EcsWorld();
      dst.registerComponent(PosDef);

      expect(() => dst.transferEntity(id, src, ['missing'])).toThrow(/not registered/);
    });

    it('bumps nextId so later createEntity() avoids collisions', () => {
      const src = new EcsWorld();
      src.registerComponent(PosDef);
      // Burn ids up to 5 in the source.
      for (let i = 0; i < 6; i++) src.createEntity();
      const id = 3;

      const dst = new EcsWorld();
      dst.registerComponent(PosDef);
      dst.transferEntity(id, src);

      expect(dst.createEntity()).toBeGreaterThan(id);
      expect(dst.createEntity()).toBeGreaterThan(id);
    });
  });

  describe('query', () => {
    it('iterates entities with all required components', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const health = w.registerComponent(HealthDef);

      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      health.set(a, { hp: 5 });

      const b = w.createEntity();
      pos.set(b, { x: 1, y: 1 });

      const results = w.query(PosDef, HealthDef).run();
      expect(results).toHaveLength(1);
      expect(results[0][0]).toBe(a);
    });

    it('throws on unregistered component', () => {
      const w = new EcsWorld();
      expect(() => w.query(PosDef).run()).toThrow(/not registered/);
    });

    it('query() with no components iterates entities by tag alone', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      const flag = w.registerTag(FlagTag);

      const a = w.createEntity();
      flag.add(a);
      w.createEntity(); // untagged — not selected

      expect(w.query().withTag(flag).run()).toEqual([[a]]);
    });

    it('withComponent requires a component without yielding it', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const health = w.registerComponent(HealthDef);

      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      health.set(a, { hp: 5 });
      const b = w.createEntity();
      pos.set(b, { x: 1, y: 1 });

      const results = w.query(PosDef).withComponent(health).run();
      expect(results).toEqual([[a, { x: 0, y: 0 }]]);
    });

    it('withoutComponent excludes entities holding a component', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const health = w.registerComponent(HealthDef);

      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      const b = w.createEntity();
      pos.set(b, { x: 1, y: 1 });
      health.set(b, { hp: 3 });

      const results = w.query(PosDef).withoutComponent(health).run();
      expect(results).toEqual([[a, { x: 0, y: 0 }]]);
    });

    it('optional yields the companion component or undefined', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const health = w.registerComponent(HealthDef);

      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      health.set(a, { hp: 5 });
      const b = w.createEntity();
      pos.set(b, { x: 1, y: 1 });

      const byId = new Map(w.query(PosDef).optional(health).run().map(r => [r[0], r]));
      expect(byId.get(a)).toEqual([a, { x: 0, y: 0 }, { hp: 5 }]);
      expect(byId.get(b)).toEqual([b, { x: 1, y: 1 }, undefined]);
    });

    it('anyOf matches entities holding at least one group member', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const flag = w.registerTag(FlagTag);
      const mark = w.registerTag(MarkTag);

      const a = w.createEntity();
      pos.set(a, { x: 0, y: 0 });
      flag.add(a);
      const b = w.createEntity();
      pos.set(b, { x: 1, y: 1 });
      mark.add(b);
      const c = w.createEntity();
      pos.set(c, { x: 2, y: 2 }); // neither tag — excluded

      const ids = w.query(PosDef).anyOf(flag, mark).run().map(r => r[0]).sort((x, y) => x - y);
      expect(ids).toEqual([a, b]);
      void c;
    });

    it('query() with no components selects by any-of tag union', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const flag = w.registerTag(FlagTag);
      const mark = w.registerTag(MarkTag);

      const a = w.createEntity();
      flag.add(a);
      const b = w.createEntity();
      mark.add(b);
      const c = w.createEntity();
      pos.set(c, { x: 0, y: 0 }); // tracked, but holds neither tag — excluded

      const ids = w.query().anyOf(flag, mark).run().map(r => r[0]).sort((x, y) => x - y);
      expect(ids).toEqual([a, b]);
      void c;
    });
  });

  describe('serialization round-trip', () => {
    it('toJSON/loadJSON restores components, tags, and nextId', () => {
      const w1 = new EcsWorld();
      const pos1 = w1.registerComponent(PosDef);
      const health1 = w1.registerComponent(HealthDef);
      const tag1 = w1.registerTag(FlagTag);

      const a = w1.createEntity();
      pos1.set(a, { x: 1, y: 2 });
      health1.set(a, { hp: 7 });
      tag1.add(a);
      w1.createEntity();

      const payload = w1.toJSON();

      const w2 = new EcsWorld();
      const pos2 = w2.registerComponent(PosDef);
      const health2 = w2.registerComponent(HealthDef);
      const tag2 = w2.registerTag(FlagTag);
      w2.loadJSON(payload);

      expect(pos2.get(a)).toEqual({ x: 1, y: 2 });
      expect(health2.get(a)).toEqual({ hp: 7 });
      expect(tag2.has(a)).toBe(true);
      expect(w2.createEntity()).toBe(2);
    });
  });

  describe('change clock', () => {
    it('shares one clock across every registered store', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const tag = w.registerTag(FlagTag);
      expect(pos.clock).toBe(w.clock);
      expect(tag.clock).toBe(w.clock);
    });

    it('move() stamps the position as changed', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.enableSpatial(PosDef, new CellIndex());
      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });
      w.clock.tick = 5;
      w.move(PosDef, id, { x: 1, y: 1 });
      expect(pos.changedTick(id)).toBe(5);
    });
  });

  describe('clearAll', () => {
    it('empties every component and tag store, resets nextId', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const tag = w.registerTag(FlagTag);

      const a = w.createEntity();
      const b = w.createEntity();
      pos.set(a, { x: 1, y: 2 });
      pos.set(b, { x: 3, y: 4 });
      tag.add(a);

      w.clearAll();

      expect(pos.has(a)).toBe(false);
      expect(pos.has(b)).toBe(false);
      expect(tag.has(a)).toBe(false);
      expect([...pos]).toEqual([]);
      expect(w.createEntity()).toBe(0);
    });

    it('clears every spatial index', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const flag = w.registerTag(FlagTag);
      const grid = w.enableSpatial(PosDef, new CellIndex());
      const flagged = w.enableSpatial(PosDef, new CellIndex(), { withTag: FlagTag });

      const id = w.createEntity();
      pos.set(id, { x: 5, y: 7 });
      flag.add(id);
      expect(grid.at(5, 7)).toEqual([id]);
      expect(flagged.at(5, 7)).toEqual([id]);

      w.clearAll();

      expect(grid.at(5, 7)).toEqual([]);
      expect(flagged.at(5, 7)).toEqual([]);
    });

    it('drops pending destroys and queued lifecycle events silently', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const events: string[] = [];
      w.lifecycle.on('EntityDestroyed', () => events.push('EntityDestroyed'));
      w.lifecycle.on('ComponentRemoved', () => events.push('ComponentRemoved'));

      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });
      w.queueDestroy(id);

      w.clearAll();
      w.lifecycle.flush();

      expect(events).toEqual([]);
    });

    it('is idempotent on an already-empty world', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      expect(() => {
        w.clearAll();
        w.clearAll();
      }).not.toThrow();
      expect(w.createEntity()).toBe(0);
    });

    it('preserves component and tag registrations', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      w.registerTag(FlagTag);

      w.clearAll();

      const id = w.createEntity();
      expect(() => w.getStore(PosDef).set(id, { x: 1, y: 1 })).not.toThrow();
      expect(() => w.getTag(FlagTag).add(id)).not.toThrow();
    });
  });

  describe('endOfTick', () => {
    it('runs flushCommands before lifecycle.flush', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      const events: string[] = [];
      w.lifecycle.on('EntityCreated', () => events.push('Created'));
      w.lifecycle.on('EntityDestroyed', () => events.push('Destroyed'));

      const id = w.createEntity();
      w.queueDestroy(id);
      w.endOfTick();

      // Both the queued destroy and the lifecycle events dispatch in one call,
      // with Destroyed arriving because flushCommands ran first.
      expect(events).toEqual(['Created', 'Destroyed']);
    });

    it('is safe to call with no pending work', () => {
      const w = new EcsWorld();
      expect(() => w.endOfTick()).not.toThrow();
    });
  });

  describe('requires validation (DEV only)', () => {
    it('warns when a required component is missing outside spawn', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const w = new EcsWorld();
        w.registerComponent(PosDef);
        const health = w.registerComponent(HealthDef);
        const id = w.createEntity();
        health.set(id, { hp: 1 });
        expect(warn).toHaveBeenCalled();
      }
      finally {
        warn.mockRestore();
      }
    });

    it('does not warn for proper template spawn order', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const w = new EcsWorld();
        w.registerComponent(PosDef);
        w.registerComponent(HealthDef);
        w.spawn({ name: 't', components: { health: { hp: 1 }, pos: { x: 0, y: 0 } } });
        expect(warn).not.toHaveBeenCalled();
      }
      finally {
        warn.mockRestore();
      }
    });
  });

  describe('lifecycle events', () => {
    it('emits EntityCreated on createEntity', () => {
      const w = new EcsWorld();
      const events: unknown[] = [];
      w.lifecycle.on('EntityCreated', e => events.push(e));

      const a = w.createEntity();
      const b = w.createEntity();
      w.lifecycle.flush();

      expect(events).toEqual([
        { id: a, type: 'EntityCreated' },
        { id: b, type: 'EntityCreated' },
      ]);
    });

    it('emits EntityDestroyed and per-component ComponentRemoved on destroyEntity', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const events: { type: string; id: number; component?: string }[] = [];
      w.lifecycle.on('EntityDestroyed', e => events.push(e));
      w.lifecycle.on('ComponentRemoved', e => events.push(e));

      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2 });
      w.lifecycle.flush();
      events.length = 0;

      w.destroyEntity(id);
      w.lifecycle.flush();

      expect(events).toEqual([
        { id, component: 'pos', type: 'ComponentRemoved' },
        { id, type: 'EntityDestroyed' },
      ]);
    });

    it('emits ComponentAdded on set and ComponentRemoved on delete', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const events: { type: string; component?: string }[] = [];
      w.lifecycle.on('ComponentAdded', e => events.push(e));
      w.lifecycle.on('ComponentRemoved', e => events.push(e));

      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2 });
      pos.delete(id);
      w.lifecycle.flush();

      expect(events).toEqual([
        { id, component: 'pos', type: 'ComponentAdded', value: { x: 1, y: 2 } },
        { id, component: 'pos', type: 'ComponentRemoved' },
      ]);
    });

    it('emits ComponentRemoved then ComponentAdded when set replaces an existing value', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2 });
      w.lifecycle.flush();

      const events: { type: string }[] = [];
      w.lifecycle.on('ComponentAdded', e => events.push(e));
      w.lifecycle.on('ComponentRemoved', e => events.push(e));

      pos.set(id, { x: 9, y: 9 });
      w.lifecycle.flush();

      expect(events.map(e => e.type)).toEqual(['ComponentRemoved', 'ComponentAdded']);
    });

    it('does not re-emit EntityDestroyed when destroying an already-dead id', () => {
      const w = new EcsWorld();
      const events: number[] = [];
      w.lifecycle.on('EntityDestroyed', e => events.push(e.id));
      const id = w.createEntity();
      w.destroyEntity(id);
      w.destroyEntity(id);
      w.destroyEntity(999);
      w.lifecycle.flush();
      expect(events).toEqual([id]);
    });

    it('queues no lifecycle event for a type nobody subscribes to', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const tag = w.registerTag(FlagTag);
      const emit = vi.spyOn(w.lifecycle, 'emit');
      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2 });
      tag.add(id);
      w.destroyEntity(id);
      expect(emit).not.toHaveBeenCalled();

      const added: number[] = [];
      w.lifecycle.on('ComponentAdded', e => added.push(e.id));
      const other = w.createEntity();
      pos.set(other, { x: 0, y: 0 });
      w.lifecycle.flush();
      expect(emit).toHaveBeenCalledOnce();
      expect(added).toEqual([other]);
    });
  });

  describe('tag lifecycle events', () => {
    it('emits TagAdded when a tag is added via spawn template', () => {
      const w = new EcsWorld();
      w.registerTag(FlagTag);

      const events: { type: string; tag?: string }[] = [];
      w.lifecycle.on('TagAdded', e => events.push(e));

      w.spawn({ name: 'test', components: {}, tags: ['flag'] });
      w.lifecycle.flush();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ tag: 'flag', type: 'TagAdded' });
    });

    it('emits TagRemoved when a tag is removed directly', () => {
      const w = new EcsWorld();
      const store = w.registerTag(FlagTag);
      const id = w.createEntity();
      store.add(id); // direct add — TagAdded fires but we clear before subscribing
      w.lifecycle.clear();

      const events: { type: string; tag?: string }[] = [];
      w.lifecycle.on('TagRemoved', e => events.push(e));

      store.delete(id);
      w.lifecycle.flush();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ id, tag: 'flag', type: 'TagRemoved' });
    });

    it('emits TagRemoved when tags are deleted individually', () => {
      const w = new EcsWorld();
      const store = w.registerTag(FlagTag);
      store.add(1);
      store.add(2);
      store.add(3);
      w.lifecycle.clear(); // drop the TagAdded events from the adds above

      const events: { id: number; tag?: string; type: string }[] = [];
      w.lifecycle.on('TagRemoved', e => events.push(e));

      store.delete(1);
      store.delete(2);
      store.delete(3);
      w.lifecycle.flush();

      expect(events.filter(e => e.tag === 'flag')).toHaveLength(3);
    });

    it('does not emit TagRemoved when delete returns false (id not present)', () => {
      const w = new EcsWorld();
      const store = w.registerTag(FlagTag);

      const events: { type: string }[] = [];
      w.lifecycle.on('TagRemoved', e => events.push(e));

      store.delete(999); // not present
      w.lifecycle.flush();

      expect(events).toHaveLength(0);
    });

    it('emits both TagAdded and EntityCreated during spawn', () => {
      const w = new EcsWorld();
      w.registerTag(FlagTag);

      const events: { id: number; tag?: string; type: string }[] = [];
      w.lifecycle.on('EntityCreated', e => events.push(e));
      w.lifecycle.on('TagAdded', e => events.push(e));

      const eid = w.spawn({ name: 'hero', components: {}, tags: ['flag'] });
      w.lifecycle.flush();

      expect(events.some(e => e.type === 'EntityCreated' && e.id === eid)).toBe(true);
      expect(events.some(e => e.type === 'TagAdded' && e.id === eid && e.tag === 'flag')).toBe(true);
    });
  });
});
