import type { EntityId } from '#index';

import { EcsWorld } from '#world';
import { describe, expect, it } from 'vitest';

import { PositionDef } from '../transform/position';
import { aabbVsAabb } from './narrowphase';
import { ShapeAabbDef } from './shape-aabb';
import { makeTriggerSystem } from './trigger';

interface Ctx { world: EcsWorld }

function spawn(world: EcsWorld, x: number, y: number, w: number, h: number): EntityId {
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getStore(ShapeAabbDef).set(id, { h, w });
  return id;
}

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(ShapeAabbDef);
  return { world };
}

describe('makeTriggerSystem', () => {
  it('fires onOverlap for each broadphase pair when no narrowphase is set', () => {
    const ctx = setup();
    const a = spawn(ctx.world, 0, 0, 10, 10);
    const b = spawn(ctx.world, 100, 100, 10, 10);

    const hits: Array<[EntityId, EntityId]> = [];
    const sys = makeTriggerSystem<Ctx>({
      broadphase: () => [[a, b] as const],
      onOverlap: (_, x, y) => { hits.push([x, y]); },
    });

    sys.run(ctx);

    expect(hits).toEqual([[a, b]]);
  });

  it('filters pairs through the narrowphase', () => {
    const ctx = setup();
    const a = spawn(ctx.world, 0, 0, 10, 10);
    const b = spawn(ctx.world, 5, 5, 10, 10);
    const c = spawn(ctx.world, 100, 100, 10, 10);

    const hits: Array<[EntityId, EntityId]> = [];
    const posStore = ctx.world.getStore(PositionDef);
    const shapeStore = ctx.world.getStore(ShapeAabbDef);
    const sys = makeTriggerSystem<Ctx>({
      broadphase: () => [[a, b] as const, [a, c] as const],
      onOverlap: (_, x, y) => { hits.push([x, y]); },
      overlaps: (_ctx, x, y) => {
        const px = posStore.get(x)!;
        const py = posStore.get(y)!;
        const sx = shapeStore.get(x)!;
        const sy = shapeStore.get(y)!;
        return aabbVsAabb(
          { h: sx.h, w: sx.w, x: px.x, y: px.y },
          { h: sy.h, w: sy.w, x: py.x, y: py.y },
        );
      },
    });

    sys.run(ctx);

    expect(hits).toEqual([[a, b]]);
  });

  it('preserves broadphase pair order', () => {
    const ctx = setup();
    const a = spawn(ctx.world, 0, 0, 10, 10);
    const b = spawn(ctx.world, 0, 0, 10, 10);
    const c = spawn(ctx.world, 0, 0, 10, 10);

    const seen: Array<[EntityId, EntityId]> = [];
    const sys = makeTriggerSystem<Ctx>({
      onOverlap: (_, x, y) => { seen.push([x, y]); },
      broadphase: () => [
        [c, a] as const,
        [b, c] as const,
        [a, b] as const,
      ],
    });

    sys.run(ctx);

    expect(seen).toEqual([[c, a], [b, c], [a, b]]);
  });

  it('passes through name, phase, runAfter, runBefore options', () => {
    const sys = makeTriggerSystem<Ctx>({
      name: 'pickup',
      phase: 'post-physics',
      runAfter: ['physics'],
      runBefore: ['render'],
      broadphase: () => [],
      onOverlap: () => {},
    });

    expect(sys.name).toBe('pickup');
    expect(sys.phase).toBe('post-physics');
    expect(sys.runAfter).toEqual(['physics']);
    expect(sys.runBefore).toEqual(['render']);
  });

  it('defaults name to "trigger" and omits optional scheduling metadata', () => {
    const sys = makeTriggerSystem<Ctx>({
      broadphase: () => [],
      onOverlap: () => {},
    });

    expect(sys.name).toBe('trigger');
    expect(sys.phase).toBeUndefined();
    expect(sys.runAfter).toBeUndefined();
    expect(sys.runBefore).toBeUndefined();
  });

  it('is a no-op when the broadphase yields nothing', () => {
    const ctx = setup();
    let calls = 0;
    const sys = makeTriggerSystem<Ctx>({
      broadphase: () => [],
      onOverlap: () => { calls++; },
    });

    sys.run(ctx);

    expect(calls).toBe(0);
  });
});
