import type { ComponentDef } from './component-store';

import { describe, expect, it } from 'vitest';

import { createTestWorld, entity, GenericEntityBuilder } from './test-utils';

interface Pos { x: number; y: number }
const PosDef: ComponentDef<Pos> = {
  name: 'Position',
  deserialize: r => r as Pos,
  serialize: v => v,
};

describe('test-utils', () => {
  describe('createTestWorld', () => {
    it('returns an empty world', () => {
      const w = createTestWorld();
      expect(w.createEntity()).toBe(0);
    });

    it('supports normal component / tag registration', () => {
      const w = createTestWorld();
      w.registerComponent(PosDef);
      w.registerTag({ name: 'blocker' });
      expect(() => w.getStore(PosDef)).not.toThrow();
      expect(() => w.getTag({ name: 'blocker' })).not.toThrow();
    });
  });

  describe('genericEntityBuilder', () => {
    it('sets components via with()', () => {
      const w = createTestWorld();
      w.registerComponent(PosDef);
      const id = new GenericEntityBuilder(w)
        .with(PosDef, { x: 3, y: 4 })
        .build();
      expect(w.getStore(PosDef).get(id)).toEqual({ x: 3, y: 4 });
    });

    it('adds tags via tag()', () => {
      const w = createTestWorld();
      const Blocker = { name: 'blocker' };
      w.registerTag(Blocker);
      const id = entity(w).tag(Blocker).build();
      expect(w.getTag(Blocker).has(id)).toBe(true);
    });

    it('chains multiple components and tags', () => {
      const w = createTestWorld();
      w.registerComponent(PosDef);
      w.registerTag({ name: 'blocker' });
      w.registerTag({ name: 'player' });
      const id = entity(w)
        .with(PosDef, { x: 1, y: 2 })
        .tag({ name: 'blocker' })
        .tag({ name: 'player' })
        .build();
      expect(w.getStore(PosDef).get(id)).toEqual({ x: 1, y: 2 });
      expect(w.getTag({ name: 'blocker' }).has(id)).toBe(true);
      expect(w.getTag({ name: 'player' }).has(id)).toBe(true);
    });

    it('exposes the entity id before build()', () => {
      const w = createTestWorld();
      const b = new GenericEntityBuilder(w);
      expect(typeof b.id).toBe('number');
      expect(b.build()).toBe(b.id);
    });

    it('accepts a pre-created id', () => {
      const w = createTestWorld();
      w.registerComponent(PosDef);
      const existing = w.createEntity();
      const b = new GenericEntityBuilder(w, existing);
      expect(b.id).toBe(existing);
      b.with(PosDef, { x: 9, y: 9 });
      expect(w.getStore(PosDef).get(existing)).toEqual({ x: 9, y: 9 });
    });
  });
});
