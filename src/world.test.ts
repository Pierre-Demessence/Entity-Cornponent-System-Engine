import type { ComponentDef, TagDef } from '#component-store';
import type { EntityTemplate } from '#template';

import { EcsWorld } from '#world';
import { describe, expect, it, vi } from 'vitest';

interface Pos { x: number; y: number }
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

    it('queueDestroy defers until flushDestroys', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const id = w.createEntity();
      pos.set(id, { x: 1, y: 2 });

      w.queueDestroy(id);
      expect(pos.has(id)).toBe(true);

      w.flushDestroys();
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
      w.flushDestroys();

      expect(deletes).toEqual([id]);
    });

    it('flushDestroys is a no-op when queue is empty', () => {
      const w = new EcsWorld();
      expect(() => w.flushDestroys()).not.toThrow();
    });

    it('flushDestroys allows safe iteration-then-destroy', () => {
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
      w.flushDestroys();

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

  describe('enableSpatial', () => {
    it('keeps the spatial index in sync with set/delete', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.enableSpatial(PosDef);

      const id = w.createEntity();
      pos.set(id, { x: 3, y: 4 });

      expect(w.spatial.getAt(3, 4)?.has(id)).toBe(true);

      pos.delete(id);
      expect(w.spatial.getAt(3, 4)).toBeUndefined();
    });

    it('move() updates both position and spatial index', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.enableSpatial(PosDef);

      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });
      w.move(id, 5, 6);

      expect(pos.get(id)).toEqual({ x: 5, y: 6 });
      expect(w.spatial.getAt(0, 0)).toBeUndefined();
      expect(w.spatial.getAt(5, 6)?.has(id)).toBe(true);
    });

    it('throws if enableSpatial is called twice', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      w.enableSpatial(PosDef);
      expect(() => w.enableSpatial(PosDef)).toThrow(/already enabled/);
    });

    it('move() throws if spatial was never enabled', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      expect(() => w.move(0, 1, 1)).toThrow(/enableSpatial/);
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

  describe('clearAllDirty', () => {
    it('clears dirty flags on all component and tag stores', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      const tag = w.registerTag(FlagTag);

      const id = w.createEntity();
      pos.set(id, { x: 0, y: 0 });
      tag.add(id);

      expect(pos.hasChanges()).toBe(true);
      expect(tag.hasChanges()).toBe(true);

      w.clearAllDirty();

      expect(pos.hasChanges()).toBe(false);
      expect(tag.hasChanges()).toBe(false);
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

    it('clears the spatial index when spatial is enabled', () => {
      const w = new EcsWorld();
      const pos = w.registerComponent(PosDef);
      w.enableSpatial(PosDef);

      const id = w.createEntity();
      pos.set(id, { x: 5, y: 7 });
      expect(w.spatial.getAt(5, 7)?.has(id)).toBe(true);

      w.clearAll();

      expect(w.spatial.getAt(5, 7)).toBeUndefined();
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
    it('runs flushDestroys before lifecycle.flush', () => {
      const w = new EcsWorld();
      w.registerComponent(PosDef);
      const events: string[] = [];
      w.lifecycle.on('EntityCreated', () => events.push('Created'));
      w.lifecycle.on('EntityDestroyed', () => events.push('Destroyed'));

      const id = w.createEntity();
      w.queueDestroy(id);
      w.endOfTick();

      // Both the queued destroy and the lifecycle events dispatch in one call,
      // with Destroyed arriving because flushDestroys ran first.
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
  });
});
