import type { EntityId } from '#entity-id';

import type { VelocityIntegrationTickCtx } from './motion';

import { EcsWorld } from '#world';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PositionDef } from '../transform/position';
import { VelocityDef } from '../transform/velocity';
import { makeVelocityIntegrationSystem } from './motion';

interface Ctx extends VelocityIntegrationTickCtx { dtMs: number; world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(VelocityDef);
  return { dtMs: 1000, world };
}

function spawn(world: EcsWorld, pos: { x: number; y: number }, vel: { vx: number; vy: number }): EntityId {
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, pos);
  world.getStore(VelocityDef).set(id, vel);
  return id;
}

describe('makeVelocityIntegrationSystem', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
  });

  it('has default name "motion"', () => {
    const sys = makeVelocityIntegrationSystem<Ctx>();
    expect(sys.name).toBe('motion');
  });

  it('propagates custom name and runAfter', () => {
    const sys = makeVelocityIntegrationSystem<Ctx>({ name: 'physics', runAfter: ['input'] });
    expect(sys.name).toBe('physics');
    expect(sys.runAfter).toEqual(['input']);
  });

  it('integrates position by velocity * dt', () => {
    const sys = makeVelocityIntegrationSystem<Ctx>();
    const id = spawn(ctx.world, { x: 10, y: 20 }, { vx: 5, vy: -3 });

    sys.run({ ...ctx, dtMs: 1000 });

    const pos = ctx.world.getStore(PositionDef).get(id)!;
    expect(pos).toEqual({ x: 15, y: 17 });
  });

  it('skips entities with zero velocity', () => {
    const sys = makeVelocityIntegrationSystem<Ctx>();
    const id = spawn(ctx.world, { x: 10, y: 20 }, { vx: 0, vy: 0 });

    sys.run(ctx);

    expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 10, y: 20 });
  });

  it('skips entities missing a position store entry', () => {
    const sys = makeVelocityIntegrationSystem<Ctx>();
    const id = ctx.world.createEntity();
    ctx.world.getStore(VelocityDef).set(id, { vx: 10, vy: 10 });

    expect(() => sys.run(ctx)).not.toThrow();
  });

  it('does nothing when dtMs is 0', () => {
    const sys = makeVelocityIntegrationSystem<Ctx>();
    const id = spawn(ctx.world, { x: 10, y: 20 }, { vx: 5, vy: -3 });

    sys.run({ ...ctx, dtMs: 0 });

    expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 10, y: 20 });
  });

  describe('boundary: wrap', () => {
    it('wraps positive overflow', () => {
      const sys = makeVelocityIntegrationSystem<Ctx>({
        boundary: { bounds: { height: 50, width: 100 }, mode: 'wrap' },
      });
      const id = spawn(ctx.world, { x: 95, y: 45 }, { vx: 10, vy: 10 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 5, y: 5 });
    });

    it('wraps negative overflow', () => {
      const sys = makeVelocityIntegrationSystem<Ctx>({
        boundary: { bounds: { height: 50, width: 100 }, mode: 'wrap' },
      });
      const id = spawn(ctx.world, { x: 5, y: 5 }, { vx: -10, vy: -10 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 95, y: 45 });
    });

    it('wraps correctly when velocity magnitude exceeds bounds in one tick', () => {
      const sys = makeVelocityIntegrationSystem<Ctx>({
        boundary: { bounds: { height: 50, width: 100 }, mode: 'wrap' },
      });
      const id = spawn(ctx.world, { x: 50, y: 25 }, { vx: 250, vy: 125 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('boundary: clamp', () => {
    it('clamps at maximum', () => {
      const sys = makeVelocityIntegrationSystem<Ctx>({
        boundary: { bounds: { height: 50, width: 100 }, mode: 'clamp' },
      });
      const id = spawn(ctx.world, { x: 95, y: 45 }, { vx: 10, vy: 10 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 100, y: 50 });
    });

    it('clamps at minimum', () => {
      const sys = makeVelocityIntegrationSystem<Ctx>({
        boundary: { bounds: { height: 50, width: 100 }, mode: 'clamp' },
      });
      const id = spawn(ctx.world, { x: 5, y: 5 }, { vx: -10, vy: -10 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(ctx.world.getStore(PositionDef).get(id)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('onMove hook', () => {
    it('is invoked with prev + next when position changes', () => {
      const onMove = vi.fn();
      const sys = makeVelocityIntegrationSystem<Ctx>({ onMove });
      const id = spawn(ctx.world, { x: 10, y: 20 }, { vx: 5, vy: -3 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith(
        expect.anything(),
        id,
        { x: 10, y: 20 },
        { x: 15, y: 17 },
      );
    });

    it('is not invoked for zero-velocity entities', () => {
      const onMove = vi.fn();
      const sys = makeVelocityIntegrationSystem<Ctx>({ onMove });
      spawn(ctx.world, { x: 10, y: 20 }, { vx: 0, vy: 0 });

      sys.run(ctx);

      expect(onMove).not.toHaveBeenCalled();
    });

    it('is not invoked when boundary handling produces no net change', () => {
      const onMove = vi.fn();
      const sys = makeVelocityIntegrationSystem<Ctx>({
        boundary: { bounds: { height: 50, width: 100 }, mode: 'clamp' },
        onMove,
      });
      spawn(ctx.world, { x: 100, y: 50 }, { vx: 10, vy: 10 });

      sys.run({ ...ctx, dtMs: 1000 });

      expect(onMove).not.toHaveBeenCalled();
    });
  });
});
