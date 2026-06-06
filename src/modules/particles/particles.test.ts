import { describe, expect, it } from 'vitest';

import { EcsWorld } from '#world';

import { easeOutQuad } from '../easing';
import { LifetimeDef, makeLifetimeSystem } from '../lifetime';
import { OpacityDef, RenderableDef, RenderOrderDef } from '../render-canvas2d';
import { makeSeededRng } from '../rng';
import { makeSpawner } from '../spawner';
import { PositionDef, RotationDef, ScaleDef, VelocityDef } from '../transform';
import {
  burst,
  makeParticleEmitterSystem,
  makeParticleSystem,
  ParticleDef,
  ParticleEmitterDef,
  ParticleTag,
} from './particles';

function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(VelocityDef);
  world.registerComponent(LifetimeDef);
  world.registerComponent(RenderableDef);
  world.registerComponent(RenderOrderDef);
  world.registerComponent(ParticleDef);
  world.registerComponent(OpacityDef);
  world.registerComponent(ScaleDef);
  world.registerComponent(RotationDef);
  world.registerComponent(ParticleEmitterDef);
  world.registerTag(ParticleTag);
  return world;
}

describe('burst', () => {
  it('spawns `count` tagged particles with the core components', () => {
    const world = makeWorld();
    const ids = burst(world, {
      colors: '#fff',
      count: 12,
      lifetimeMs: [400, 800],
      position: { x: 50, y: 50 },
      size: [3, 6],
      speed: [60, 200],
    });
    expect(ids).toHaveLength(12);
    expect([...world.getTag(ParticleTag)]).toHaveLength(12);
    for (const id of ids) {
      expect(world.getStore(PositionDef).get(id)).toEqual({ x: 50, y: 50 });
      expect(world.getStore(VelocityDef).get(id)).toBeDefined();
      expect(world.getStore(LifetimeDef).get(id)).toBeDefined();
      const r = world.getStore(RenderableDef).get(id)!;
      expect(r.kind).toBe('rect');
      expect(r.fill).toBe('#fff');
    }
  });

  it('is deterministic under a seeded rng', () => {
    const a = makeWorld();
    const b = makeWorld();
    const cfg = {
      colors: ['#a', '#b'],
      count: 8,
      lifetimeMs: [400, 800] as const,
      position: { x: 0, y: 0 },
      size: [3, 6] as const,
      speed: [60, 200] as const,
    };
    const ida = burst(a, { ...cfg, rng: makeSeededRng(123) });
    const idb = burst(b, { ...cfg, rng: makeSeededRng(123) });
    for (let i = 0; i < ida.length; i++) {
      expect(a.getStore(VelocityDef).get(ida[i]!)).toEqual(b.getStore(VelocityDef).get(idb[i]!));
      expect(a.getStore(RenderableDef).get(ida[i]!)).toEqual(b.getStore(RenderableDef).get(idb[i]!));
    }
  });

  it('omits Opacity/Scale/Rotation unless fade/shrink/spin requested', () => {
    const world = makeWorld();
    const [id] = burst(world, {
      colors: '#fff',
      count: 1,
      lifetimeMs: [500, 500],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [0, 0],
    });
    expect(world.getStore(OpacityDef).get(id!)).toBeUndefined();
    expect(world.getStore(ScaleDef).get(id!)).toBeUndefined();
    expect(world.getStore(RotationDef).get(id!)).toBeUndefined();
  });

  it('adds Opacity/Scale/Rotation when fade/shrink/spin requested', () => {
    const world = makeWorld();
    const [id] = burst(world, {
      colors: '#fff',
      count: 1,
      fadeOut: true,
      lifetimeMs: [500, 500],
      position: { x: 0, y: 0 },
      shrink: true,
      size: [4, 4],
      speed: [0, 0],
      spin: 1,
    });
    expect(world.getStore(OpacityDef).get(id!)).toEqual({ value: 1 });
    expect(world.getStore(ScaleDef).get(id!)).toEqual({ x: 1, y: 1 });
    expect(world.getStore(RotationDef).get(id!)).toEqual({ angle: 0 });
  });

  it('emits a full radial fan when no angle is given', () => {
    const world = makeWorld();
    const ids = burst(world, {
      colors: '#fff',
      count: 4,
      lifetimeMs: [500, 500],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [100, 100],
      rng: () => 0.5, // zero jitter (rng*2-1 = 0)
    });
    // i/4 of 2π → 0, π/2, π, 3π/2 → +x, +y, −x, −y.
    const v = ids.map(id => world.getStore(VelocityDef).get(id)!);
    expect(v[0]!.vx).toBeCloseTo(100, 5);
    expect(v[1]!.vy).toBeCloseTo(100, 5);
    expect(v[2]!.vx).toBeCloseTo(-100, 5);
    expect(v[3]!.vy).toBeCloseTo(-100, 5);
  });

  it('launches a directional cone within angle ± spread', () => {
    const world = makeWorld();
    const ids = burst(world, {
      angle: 0, // +x
      colors: '#fff',
      count: 20,
      lifetimeMs: [500, 500],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [100, 100],
      spread: 0.2,
    });
    for (const id of ids) {
      const v = world.getStore(VelocityDef).get(id)!;
      expect(Math.abs(Math.atan2(v.vy, v.vx))).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('spawns on a ring exactly `radius` from the centre', () => {
    const world = makeWorld();
    const ids = burst(world, {
      colors: '#fff',
      count: 12,
      lifetimeMs: [500, 500],
      position: { x: 100, y: 100 },
      shape: { kind: 'ring', radius: 20 },
      size: [4, 4],
      speed: [0, 0],
    });
    for (const id of ids) {
      const p = world.getStore(PositionDef).get(id)!;
      expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(20, 5);
    }
  });

  it('spawns within a filled circle of `radius`', () => {
    const world = makeWorld();
    const ids = burst(world, {
      colors: '#fff',
      count: 30,
      lifetimeMs: [500, 500],
      position: { x: 0, y: 0 },
      shape: { kind: 'circle', radius: 10 },
      size: [4, 4],
      speed: [0, 0],
    });
    for (const id of ids) {
      const p = world.getStore(PositionDef).get(id)!;
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});

describe('makeParticleSystem', () => {
  it('fades opacity from 1 → 0 across the lifetime', () => {
    const world = makeWorld();
    const [id] = burst(world, {
      colors: '#fff',
      count: 1,
      fadeOut: true,
      lifetimeMs: [1000, 1000],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [0, 0],
    });
    const sys = makeParticleSystem();
    // Advance the lifetime timer first, then the particle system reads fraction.
    world.getStore(LifetimeDef).get(id!)!.remainingMs = 750; // 25% elapsed → opacity 0.75
    sys.run({ dtMs: 0, world });
    expect(world.getStore(OpacityDef).get(id!)!.value).toBeCloseTo(0.75, 5);
    world.getStore(LifetimeDef).get(id!)!.remainingMs = 250; // 75% elapsed → opacity 0.25
    sys.run({ dtMs: 0, world });
    expect(world.getStore(OpacityDef).get(id!)!.value).toBeCloseTo(0.25, 5);
  });

  it('shrinks scale toward `to` with an easing', () => {
    const world = makeWorld();
    const [id] = burst(world, {
      colors: '#fff',
      count: 1,
      lifetimeMs: [1000, 1000],
      position: { x: 0, y: 0 },
      shrink: { to: 0 },
      size: [4, 4],
      speed: [0, 0],
    });
    const sys = makeParticleSystem({ shrinkEasing: easeOutQuad });
    world.getStore(LifetimeDef).get(id!)!.remainingMs = 500; // 50% elapsed
    sys.run({ dtMs: 0, world });
    // lerp(1, 0, easeOutQuad(0.5)=0.75) = 0.25.
    expect(world.getStore(ScaleDef).get(id!)!.x).toBeCloseTo(0.25, 5);
  });

  it('applies gravity to velocity', () => {
    const world = makeWorld();
    const [id] = burst(world, {
      colors: '#fff',
      count: 1,
      gravity: { x: 0, y: 100 },
      lifetimeMs: [1000, 1000],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [0, 0],
    });
    const sys = makeParticleSystem();
    sys.run({ dtMs: 100, world }); // +100 px/s² · 0.1s = +10 vy
    expect(world.getStore(VelocityDef).get(id!)!.vy).toBeCloseTo(10, 5);
  });

  it('damps velocity toward zero', () => {
    const world = makeWorld();
    const [id] = burst(world, {
      angle: 0,
      colors: '#fff',
      count: 1,
      damping: 1, // fully damped over 1s
      lifetimeMs: [1000, 1000],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [100, 100],
      spread: 0,
    });
    const sys = makeParticleSystem();
    const before = world.getStore(VelocityDef).get(id!)!.vx;
    sys.run({ dtMs: 500, world }); // keep = 1 − 1·0.5 = 0.5
    expect(world.getStore(VelocityDef).get(id!)!.vx).toBeCloseTo(before * 0.5, 5);
    // A huge dt clamps `keep` at 0 (never negative → no velocity reversal).
    world.getStore(VelocityDef).get(id!)!.vx = 100;
    sys.run({ dtMs: 5000, world }); // 1 − 1·5 = −4 → clamped to 0
    expect(world.getStore(VelocityDef).get(id!)!.vx).toBe(0);
  });

  it('spins rotation by angular velocity', () => {
    const world = makeWorld();
    const [id] = burst(world, {
      colors: '#fff',
      count: 1,
      lifetimeMs: [1000, 1000],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [0, 0],
      spin: Math.PI, // half-turn per second
    });
    const sys = makeParticleSystem();
    sys.run({ dtMs: 1000, world });
    expect(world.getStore(RotationDef).get(id!)!.angle).toBeCloseTo(Math.PI, 5);
  });

  it('does not require Scale/Rotation to be registered for a fade-only burst', () => {
    // A consumer that only fades registers OpacityDef but not Scale/Rotation.
    const world = new EcsWorld();
    world.registerComponent(PositionDef);
    world.registerComponent(VelocityDef);
    world.registerComponent(LifetimeDef);
    world.registerComponent(RenderableDef);
    world.registerComponent(RenderOrderDef);
    world.registerComponent(ParticleDef);
    world.registerComponent(OpacityDef);
    world.registerTag(ParticleTag);
    burst(world, {
      colors: '#fff',
      count: 3,
      fadeOut: true,
      lifetimeMs: [500, 500],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [0, 0],
    });
    const sys = makeParticleSystem();
    expect(() => sys.run({ dtMs: 100, world })).not.toThrow();
  });
});

describe('makeParticleEmitterSystem', () => {
  it('emits a burst on each spawner interval', () => {
    const world = makeWorld();
    const emitterId = world.createEntity();
    world.getStore(ParticleEmitterDef).set(emitterId, {
      spawner: makeSpawner(() => 100),
      config: {
        colors: '#fff',
        count: 3,
        lifetimeMs: [500, 500],
        position: { x: 0, y: 0 },
        size: [4, 4],
        speed: [0, 0],
      },
    });
    const sys = makeParticleEmitterSystem();
    // Two 100ms intervals over 250ms → 2 bursts × 3 = 6 particles.
    sys.run({ dtMs: 250, world });
    expect([...world.getTag(ParticleTag)]).toHaveLength(6);
  });

  it('does not emit while the spawner gate is closed', () => {
    const world = makeWorld();
    let active = false;
    const emitterId = world.createEntity();
    world.getStore(ParticleEmitterDef).set(emitterId, {
      spawner: makeSpawner(() => 100, { active: () => active }),
      config: {
        colors: '#fff',
        count: 3,
        lifetimeMs: [500, 500],
        position: { x: 0, y: 0 },
        size: [4, 4],
        speed: [0, 0],
      },
    });
    const sys = makeParticleEmitterSystem();
    sys.run({ dtMs: 250, world });
    expect([...world.getTag(ParticleTag)]).toHaveLength(0);
    active = true;
    sys.run({ dtMs: 250, world });
    expect([...world.getTag(ParticleTag)].length).toBeGreaterThan(0);
  });
});

describe('lifetime integration', () => {
  it('particles are reaped by the lifetime system when expired', () => {
    const world = makeWorld();
    burst(world, {
      colors: '#fff',
      count: 5,
      lifetimeMs: [100, 100],
      position: { x: 0, y: 0 },
      size: [4, 4],
      speed: [0, 0],
    });
    const life = makeLifetimeSystem();
    life.run({ dtMs: 100, world });
    world.flushDestroys();
    expect([...world.getTag(ParticleTag)]).toHaveLength(0);
  });
});
