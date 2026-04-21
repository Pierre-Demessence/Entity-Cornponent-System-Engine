import type { EntityId } from '#entity-id';

import { EcsWorld } from '#world';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LifetimeDef, makeLifetimeSystem } from './lifetime';

interface Ctx { dtMs: number; world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(LifetimeDef);
  return { dtMs: 16, world };
}

describe('lifetimeDef', () => {
  it('has name "lifetime" and round-trips through simpleComponent', () => {
    expect(LifetimeDef.name).toBe('lifetime');
    const raw = { remainingMs: 500 };
    const serialized = LifetimeDef.serialize(raw);
    const restored = LifetimeDef.deserialize(serialized, 'lifetime');
    expect(restored).toEqual(raw);
  });
});

describe('makeLifetimeSystem', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
  });

  it('has default name "lifetime"', () => {
    const sys = makeLifetimeSystem<Ctx>();
    expect(sys.name).toBe('lifetime');
  });

  it('propagates custom name and runAfter', () => {
    const sys = makeLifetimeSystem<Ctx>({ name: 'custom', runAfter: ['physics'] });
    expect(sys.name).toBe('custom');
    expect(sys.runAfter).toEqual(['physics']);
  });

  it('decrements remainingMs by dtMs', () => {
    const sys = makeLifetimeSystem<Ctx>();
    const store = ctx.world.getStore(LifetimeDef);
    const id = ctx.world.createEntity();
    store.set(id, { remainingMs: 100 });

    sys.run(ctx);

    expect(store.get(id)).toEqual({ remainingMs: 84 });
  });

  it('queues destroy when remainingMs reaches zero', () => {
    const sys = makeLifetimeSystem<Ctx>();
    const store = ctx.world.getStore(LifetimeDef);
    const id = ctx.world.createEntity();
    store.set(id, { remainingMs: 16 });

    sys.run(ctx);
    ctx.world.flushDestroys();

    expect(store.has(id)).toBe(false);
  });

  it('queues destroy when remainingMs goes below zero', () => {
    const sys = makeLifetimeSystem<Ctx>();
    const store = ctx.world.getStore(LifetimeDef);
    const id = ctx.world.createEntity();
    store.set(id, { remainingMs: 1 });

    sys.run(ctx);
    ctx.world.flushDestroys();

    expect(store.has(id)).toBe(false);
  });

  it('keeps entities alive while remainingMs > 0 across multiple ticks', () => {
    const sys = makeLifetimeSystem<Ctx>();
    const store = ctx.world.getStore(LifetimeDef);
    const id = ctx.world.createEntity();
    store.set(id, { remainingMs: 100 });

    for (let i = 0; i < 5; i++) sys.run(ctx);
    ctx.world.flushDestroys();

    expect(store.has(id)).toBe(true);
    expect(store.get(id)).toEqual({ remainingMs: 20 });
  });

  it('invokes onExpire instead of queueDestroy when provided', () => {
    const onExpire = vi.fn<(ctx: Ctx, id: EntityId) => void>();
    const sys = makeLifetimeSystem<Ctx>({ onExpire });
    const store = ctx.world.getStore(LifetimeDef);
    const id = ctx.world.createEntity();
    store.set(id, { remainingMs: 5 });

    sys.run(ctx);
    ctx.world.flushDestroys();

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith(ctx, id);
    expect(store.has(id)).toBe(true);
  });

  it('expires multiple entities in one tick', () => {
    const sys = makeLifetimeSystem<Ctx>();
    const store = ctx.world.getStore(LifetimeDef);
    const ids: EntityId[] = [];
    for (let i = 0; i < 3; i++) {
      const id = ctx.world.createEntity();
      store.set(id, { remainingMs: 10 });
      ids.push(id);
    }

    sys.run(ctx);
    ctx.world.flushDestroys();

    for (const id of ids) expect(store.has(id)).toBe(false);
  });
});
