import type { ComponentDef, TagDef } from './component-store';
import type { EntityTemplate } from './template';

import { describe, expect, it, vi } from 'vitest';

import { EcsWorld } from './world';

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
