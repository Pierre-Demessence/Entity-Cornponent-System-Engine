import type { EntityId } from '#entity-id';
import type { TagDef } from '#index';
import type { VelocityIntegration3DTickCtx } from './motion-3d';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EcsWorld } from '#world';

import { Position3DDef } from '../transform-3d/position3d';
import { Velocity3DDef } from '../transform-3d/velocity3d';
import { makeVelocityIntegration3DSystem } from './motion-3d';

interface Ctx extends VelocityIntegration3DTickCtx { dtMs: number; world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(Position3DDef);
  world.registerComponent(Velocity3DDef);
  return { dtMs: 1000, world };
}

function spawn(
  world: EcsWorld,
  pos: { x: number; y: number; z: number },
  vel: { vx: number; vy: number; vz: number },
): EntityId {
  const id = world.createEntity();
  world.getStore(Position3DDef).set(id, pos);
  world.getStore(Velocity3DDef).set(id, vel);
  return id;
}

describe('makeVelocityIntegration3DSystem', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
  });

  it('has default name "motion3d"', () => {
    expect(makeVelocityIntegration3DSystem<Ctx>().name).toBe('motion3d');
  });

  it('propagates custom name and runAfter', () => {
    const sys = makeVelocityIntegration3DSystem<Ctx>({ name: 'flight', runAfter: ['input'] });
    expect(sys.name).toBe('flight');
    expect(sys.runAfter).toEqual(['input']);
  });

  it('integrates position by velocity * dt on all three axes', () => {
    const sys = makeVelocityIntegration3DSystem<Ctx>();
    const id = spawn(ctx.world, { x: 10, y: 20, z: -5 }, { vx: 5, vy: -3, vz: 2 });

    sys.run({ ...ctx, dtMs: 1000 });

    expect(ctx.world.getStore(Position3DDef).get(id)).toEqual({ x: 15, y: 17, z: -3 });
  });

  it('skips entities with zero velocity', () => {
    const sys = makeVelocityIntegration3DSystem<Ctx>();
    const id = spawn(ctx.world, { x: 10, y: 20, z: 30 }, { vx: 0, vy: 0, vz: 0 });

    sys.run(ctx);

    expect(ctx.world.getStore(Position3DDef).get(id)).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('skips entities missing a position store entry', () => {
    const sys = makeVelocityIntegration3DSystem<Ctx>();
    const id = ctx.world.createEntity();
    ctx.world.getStore(Velocity3DDef).set(id, { vx: 10, vy: 10, vz: 10 });

    expect(() => sys.run(ctx)).not.toThrow();
  });

  it('does nothing when dtMs is 0', () => {
    const sys = makeVelocityIntegration3DSystem<Ctx>();
    const id = spawn(ctx.world, { x: 10, y: 20, z: 30 }, { vx: 5, vy: -3, vz: 2 });

    sys.run({ ...ctx, dtMs: 0 });

    expect(ctx.world.getStore(Position3DDef).get(id)).toEqual({ x: 10, y: 20, z: 30 });
  });

  describe('boundary: wrap', () => {
    it('wraps positive overflow on every axis', () => {
      const sys = makeVelocityIntegration3DSystem<Ctx>({
        boundary: { bounds: { depth: 40, height: 50, width: 100 }, mode: 'wrap' },
      });
      const id = spawn(ctx.world, { x: 95, y: 45, z: 35 }, { vx: 10, vy: 10, vz: 10 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(Position3DDef).get(id)).toEqual({ x: 5, y: 5, z: 5 });
    });

    it('wraps negative overflow on every axis', () => {
      const sys = makeVelocityIntegration3DSystem<Ctx>({
        boundary: { bounds: { depth: 40, height: 50, width: 100 }, mode: 'wrap' },
      });
      const id = spawn(ctx.world, { x: 5, y: 5, z: 5 }, { vx: -10, vy: -10, vz: -10 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(Position3DDef).get(id)).toEqual({ x: 95, y: 45, z: 35 });
    });
  });

  describe('boundary: clamp', () => {
    it('clamps at maximum on every axis', () => {
      const sys = makeVelocityIntegration3DSystem<Ctx>({
        boundary: { bounds: { depth: 40, height: 50, width: 100 }, mode: 'clamp' },
      });
      const id = spawn(ctx.world, { x: 95, y: 45, z: 35 }, { vx: 100, vy: 100, vz: 100 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(Position3DDef).get(id)).toEqual({ x: 100, y: 50, z: 40 });
    });

    it('clamps at zero on every axis', () => {
      const sys = makeVelocityIntegration3DSystem<Ctx>({
        boundary: { bounds: { depth: 40, height: 50, width: 100 }, mode: 'clamp' },
      });
      const id = spawn(ctx.world, { x: 5, y: 5, z: 5 }, { vx: -100, vy: -100, vz: -100 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(Position3DDef).get(id)).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  it('invokes onMove with prev/next snapshots for moved entities', () => {
    const onMove = vi.fn();
    const sys = makeVelocityIntegration3DSystem<Ctx>({ onMove });
    const id = spawn(ctx.world, { x: 0, y: 0, z: 0 }, { vx: 1, vy: 2, vz: 3 });

    sys.run({ ...ctx, dtMs: 1000 });

    expect(onMove).toHaveBeenCalledWith(
      expect.anything(),
      id,
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: 3 },
    );
  });

  it('with a tag, integrates only tagged entities', () => {
    const MovingTag: TagDef = { name: 'moving' };
    ctx.world.registerTag(MovingTag);
    const sys = makeVelocityIntegration3DSystem<Ctx>({ tag: MovingTag });
    const tagged = spawn(ctx.world, { x: 0, y: 0, z: 0 }, { vx: 1, vy: 0, vz: 0 });
    const untagged = spawn(ctx.world, { x: 0, y: 0, z: 0 }, { vx: 1, vy: 0, vz: 0 });
    ctx.world.getTag(MovingTag).add(tagged);

    sys.run({ ...ctx, dtMs: 1000 });

    expect(ctx.world.getStore(Position3DDef).get(tagged)).toEqual({ x: 1, y: 0, z: 0 });
    expect(ctx.world.getStore(Position3DDef).get(untagged)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
