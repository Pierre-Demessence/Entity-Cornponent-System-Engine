import type { EntityId } from '#entity-id';

import type { KinematicsTickCtx } from './kinematics-system';

import { EcsWorld } from '#world';
import { beforeEach, describe, expect, it } from 'vitest';

import { ShapeAabbDef } from '../collision/shape-aabb';
import { PositionDef } from '../transform/position';
import { VelocityDef } from '../transform/velocity';
import { GroundedDef } from './grounded';
import { makeKinematicsSystem } from './kinematics-system';

const StaticBodyTag = { name: 'static-body' };

interface Ctx extends KinematicsTickCtx { dtMs: number; world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(VelocityDef);
  world.registerComponent(ShapeAabbDef);
  world.registerComponent(GroundedDef);
  world.registerTag(StaticBodyTag);
  return { dtMs: 1000, world };
}

function spawnDynamic(
  world: EcsWorld,
  x: number,
  y: number,
  vx: number,
  vy: number,
  w = 10,
  h = 10,
): EntityId {
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getStore(VelocityDef).set(id, { vx, vy });
  world.getStore(ShapeAabbDef).set(id, { h, w });
  world.getStore(GroundedDef).set(id, { onGround: false });
  return id;
}

function spawnStatic(
  world: EcsWorld,
  x: number,
  y: number,
  w: number,
  h: number,
): EntityId {
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getStore(ShapeAabbDef).set(id, { h, w });
  world.getTag(StaticBodyTag).add(id);
  return id;
}

function allStatics(world: EcsWorld): (ctx: Ctx) => Iterable<EntityId> {
  return () => world.getTag(StaticBodyTag);
}

describe('makeKinematicsSystem', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('has default name "kinematics"', () => {
    const sys = makeKinematicsSystem<Ctx>({
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
      broadphase: () => [],
    });
    expect(sys.name).toBe('kinematics');
  });

  it('propagates custom name/runAfter/runBefore/phase', () => {
    const sys = makeKinematicsSystem<Ctx>({
      name: 'physics',
      gravity: 0,
      phase: 'simulate',
      runAfter: ['input'],
      runBefore: ['render'],
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
      broadphase: () => [],
    });
    expect(sys.name).toBe('physics');
    expect(sys.phase).toBe('simulate');
    expect(sys.runAfter).toEqual(['input']);
    expect(sys.runBefore).toEqual(['render']);
  });

  it('applies gravity and clamps at terminalVelocity', () => {
    const sys = makeKinematicsSystem<Ctx>({
      gravity: 1000,
      staticTag: StaticBodyTag,
      terminalVelocity: 300,
      broadphase: () => [],
    });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 0);
    sys.run({ ...ctx, dtMs: 500 });
    expect(ctx.world.getStore(VelocityDef).get(id)!.vy).toBe(300);
  });

  it('lands on a floor and sets onGround=true', () => {
    const sys = makeKinematicsSystem<Ctx>({
      broadphase: allStatics(ctx.world),
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
    });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 200);
    spawnStatic(ctx.world, 0, 50, 100, 500);
    sys.run({ ...ctx, dtMs: 1000 });
    const pos = ctx.world.getStore(PositionDef).get(id)!;
    const vel = ctx.world.getStore(VelocityDef).get(id)!;
    const grounded = ctx.world.getStore(GroundedDef).get(id)!;
    expect(pos.y).toBe(40);
    expect(vel.vy).toBe(0);
    expect(grounded.onGround).toBe(true);
  });

  it('resolves horizontal collision and zeroes vx', () => {
    const sys = makeKinematicsSystem<Ctx>({
      broadphase: allStatics(ctx.world),
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
    });
    const id = spawnDynamic(ctx.world, 0, 0, 200, 0);
    spawnStatic(ctx.world, 50, 0, 500, 20);
    sys.run({ ...ctx, dtMs: 1000 });
    const pos = ctx.world.getStore(PositionDef).get(id)!;
    const vel = ctx.world.getStore(VelocityDef).get(id)!;
    expect(pos.x).toBe(40);
    expect(vel.vx).toBe(0);
  });

  it('clears onGround when no floor is hit', () => {
    const sys = makeKinematicsSystem<Ctx>({
      broadphase: allStatics(ctx.world),
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
    });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 10);
    ctx.world.getStore(GroundedDef).set(id, { onGround: true });
    sys.run({ ...ctx, dtMs: 1000 });
    expect(ctx.world.getStore(GroundedDef).get(id)!.onGround).toBe(false);
  });

  it('ignores non-static entities yielded by broadphase', () => {
    const other = ctx.world.createEntity();
    const sys = makeKinematicsSystem<Ctx>({
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
      broadphase: () => [other],
    });
    const id = spawnDynamic(ctx.world, 0, 0, 200, 0);
    ctx.world.getStore(PositionDef).set(other, { x: 50, y: 0 });
    ctx.world.getStore(ShapeAabbDef).set(other, { h: 20, w: 10 });
    sys.run({ ...ctx, dtMs: 1000 });
    expect(ctx.world.getStore(PositionDef).get(id)!.x).toBe(200);
  });

  it('resolves upward collision against a ceiling', () => {
    const sys = makeKinematicsSystem<Ctx>({
      broadphase: allStatics(ctx.world),
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
    });
    const id = spawnDynamic(ctx.world, 0, 100, 0, -200);
    spawnStatic(ctx.world, 0, -500, 100, 540);
    sys.run({ ...ctx, dtMs: 1000 });
    const pos = ctx.world.getStore(PositionDef).get(id)!;
    const vel = ctx.world.getStore(VelocityDef).get(id)!;
    expect(pos.y).toBe(40);
    expect(vel.vy).toBe(0);
    expect(ctx.world.getStore(GroundedDef).get(id)!.onGround).toBe(false);
  });

  it('skips self when broadphase yields the moving entity id', () => {
    const sys = makeKinematicsSystem<Ctx>({
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
      broadphase: c => [...c.world.getTag(StaticBodyTag)],
    });
    const id = spawnDynamic(ctx.world, 0, 0, 200, 0);
    ctx.world.getTag(StaticBodyTag).add(id);
    sys.run({ ...ctx, dtMs: 1000 });
    expect(ctx.world.getStore(PositionDef).get(id)!.x).toBe(200);
  });

  it('snaps to the nearest of multiple overlapping statics', () => {
    const sys = makeKinematicsSystem<Ctx>({
      broadphase: allStatics(ctx.world),
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
    });
    const id = spawnDynamic(ctx.world, 0, 0, 200, 0);
    spawnStatic(ctx.world, 100, 0, 500, 20);
    spawnStatic(ctx.world, 50, 0, 500, 20);
    sys.run({ ...ctx, dtMs: 1000 });
    expect(ctx.world.getStore(PositionDef).get(id)!.x).toBe(40);
  });

  it('filters over-yielded broadphase candidates via aabbVsAabb', () => {
    const sys = makeKinematicsSystem<Ctx>({
      broadphase: allStatics(ctx.world),
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
    });
    const id = spawnDynamic(ctx.world, 0, 0, 200, 0);
    spawnStatic(ctx.world, 0, 500, 500, 20);
    sys.run({ ...ctx, dtMs: 1000 });
    expect(ctx.world.getStore(PositionDef).get(id)!.x).toBe(200);
  });

  it('does nothing when dtMs is 0', () => {
    const sys = makeKinematicsSystem<Ctx>({
      gravity: 1000,
      staticTag: StaticBodyTag,
      terminalVelocity: 500,
      broadphase: () => [],
    });
    const id = spawnDynamic(ctx.world, 10, 20, 5, -3);
    ctx.world.getStore(GroundedDef).set(id, { onGround: true });
    sys.run({ ...ctx, dtMs: 0 });
    expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 10, y: 20 });
    expect(ctx.world.getStore(VelocityDef).get(id)).toEqual({ vx: 5, vy: -3 });
    expect(ctx.world.getStore(GroundedDef).get(id)!.onGround).toBe(true);
  });

  it('skips entities missing Position, Velocity, or ShapeAabb', () => {
    const sys = makeKinematicsSystem<Ctx>({
      gravity: 0,
      staticTag: StaticBodyTag,
      terminalVelocity: 1000,
      broadphase: () => [],
    });
    const id = ctx.world.createEntity();
    ctx.world.getStore(GroundedDef).set(id, { onGround: false });
    expect(() => sys.run({ ...ctx, dtMs: 1000 })).not.toThrow();
  });
});
