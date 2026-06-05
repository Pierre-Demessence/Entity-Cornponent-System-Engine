import type { EntityId } from '#entity-id';

import { beforeEach, describe, expect, it } from 'vitest';

import { EcsWorld } from '#world';

import {
  CooldownDef,
  makeCooldown,
  makeCooldownSystem,
  ready,
  trigger,
} from './cooldown';

interface Ctx { dtMs: number; world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(CooldownDef);
  return { dtMs: 16, world };
}

describe('makeCooldown', () => {
  it('starts ready (remainingMs zero)', () => {
    const c = makeCooldown(200);
    expect(c.remainingMs).toBe(0);
    expect(c.durationMs).toBe(200);
    expect(ready(c)).toBe(true);
  });
});

describe('cooldownDef', () => {
  it('has name "cooldown" and round-trips through simpleComponent', () => {
    expect(CooldownDef.name).toBe('cooldown');
    const raw = makeCooldown(200);
    const restored = CooldownDef.deserialize(CooldownDef.serialize(raw), 'cooldown');
    expect(restored).toEqual(raw);
  });
});

describe('trigger / ready', () => {
  it('trigger re-arms the cooldown so it is no longer ready', () => {
    const c = makeCooldown(200);
    trigger(c);
    expect(c.remainingMs).toBe(200);
    expect(ready(c)).toBe(false);
  });

  it('trigger can override the duration', () => {
    const c = makeCooldown(200);
    trigger(c, 500);
    expect(c.durationMs).toBe(500);
    expect(c.remainingMs).toBe(500);
  });
});

describe('makeCooldownSystem', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
  });

  it('defaults name to "cooldown" and forwards runAfter', () => {
    const sys = makeCooldownSystem<Ctx>({ runAfter: ['input'] });
    expect(sys.name).toBe('cooldown');
    expect(sys.runAfter).toEqual(['input']);
  });

  it('ticks an armed cooldown down to ready', () => {
    const sys = makeCooldownSystem<Ctx>();
    const store = ctx.world.getStore(CooldownDef);
    const id = ctx.world.createEntity();
    const c = makeCooldown(32);
    trigger(c);
    store.set(id, c);

    sys.run(ctx);
    expect(ready(store.get(id)!)).toBe(false);
    sys.run(ctx);
    expect(ready(store.get(id)!)).toBe(true);
  });

  it('leaves an already-ready cooldown ready', () => {
    const sys = makeCooldownSystem<Ctx>();
    const store = ctx.world.getStore(CooldownDef);
    const id: EntityId = ctx.world.createEntity();
    store.set(id, makeCooldown(200));

    sys.run(ctx);
    expect(ready(store.get(id)!)).toBe(true);
  });
});
