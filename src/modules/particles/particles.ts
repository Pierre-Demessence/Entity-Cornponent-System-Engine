/**
 * Particle bursts and emitters — short-lived entities spawned in a radial,
 * cone, or shaped pattern and animated over their lifetime (fade, shrink, spin,
 * gravity, damping). Canon: Godot `CPUParticles2D` + `ParticleProcessMaterial`,
 * Unity `ParticleSystem`, Phaser / Pixi emitters.
 *
 * No special renderer — particles are ordinary `RenderableDef` rects drawn by
 * `modules/render-canvas2d`, moved by `modules/motion`, and reaped by
 * `modules/lifetime`. This module composes those plus `modules/easing` (curve),
 * `modules/rng` (params), and `modules/spawner` (continuous emit cadence).
 */
import type { ComponentDef, ComponentStore, EcsWorld, EntityId, SchedulableSystem, TagDef } from '#index';
import type { Easing } from '../easing';
import type { RandomFn } from '../rng';
import type { Spawner } from '../spawner';

import { simpleComponent } from '#index';

import { linear } from '../easing';
import { LifetimeDef, makeLifetime } from '../lifetime';
import { clamp01, lerp } from '../math';
import { OpacityDef, RenderableDef, RenderOrderDef } from '../render-canvas2d';
import { pick } from '../rng';
import { tickSpawner } from '../spawner';
import { fraction } from '../timer';
import { PositionDef, RotationDef, ScaleDef, VelocityDef } from '../transform';

/** Tag attached to every particle this module spawns. */
export const ParticleTag: TagDef = { name: 'particle' };

/** Emission region: a point, or a circle / ring of `radius` around `position`. */
export type EmissionShape
  = | { kind: 'point' }
    | { kind: 'circle'; radius: number }
    | { kind: 'ring'; radius: number };

/** Inclusive `[min, max]` range sampled uniformly per particle. */
export type Range = readonly [min: number, max: number];

/** Configuration for {@link burst} (and the per-emission config of an emitter). */
export interface BurstConfig {
  /** Centre launch direction (radians). Omit for a full-circle radial spray. */
  angle?: number;
  /** Fill colour, or a palette to pick from per particle. */
  colors: string | readonly string[];
  /** Number of particles to spawn. */
  count: number;
  /** Fractional velocity decay per second (`0` = none, `1` = fully damped in 1s). */
  damping?: number;
  /**
   * Fade alpha `1 → 0` over life (adds `OpacityDef`). The curve is the
   * system-global `fadeEasing` of {@link makeParticleSystem} (default linear).
   */
  fadeOut?: boolean;
  /** Constant acceleration (world units / second²) applied to velocity each tick. */
  gravity?: { x: number; y: number };
  /**
   * Jitter (radians) added to each particle's launch direction. Defaults to a
   * small `0.4` in radial mode (no `angle`) and to `spread` in cone mode.
   */
  jitter?: number;
  /** Lifetime range (ms). */
  lifetimeMs: Range;
  /** Emission centre in world coords. */
  position: { x: number; y: number };
  /** `RenderOrderDef` value. Default `0`. */
  renderOrder?: number;
  /** Random source for all sampling. Default `Math.random`; pass a seeded rng for determinism. */
  rng?: RandomFn;
  /** Where particles spawn relative to `position`. Default `{ kind: 'point' }`. */
  shape?: EmissionShape;
  /**
   * Shrink scale `1 → to` over life (adds `ScaleDef`); `true` shrinks to `0`.
   * The curve is the system-global `shrinkEasing` of {@link makeParticleSystem}.
   */
  shrink?: boolean | { to: number };
  /** Square particle size range (px); width and height are sampled together. */
  size: Range;
  /** Initial speed range (world units / second). */
  speed: Range;
  /** Angular velocity (radians / second); adds `RotationDef` and spins the particle. */
  spin?: number;
  /** Cone half-width (radians) around `angle`. Default `Math.PI` (full circle). */
  spread?: number;
}

/**
 * Per-particle runtime fields the {@link makeParticleSystem} reads to drive
 * over-lifetime animation. Flat primitives so it embeds in a `simpleComponent`;
 * easing curves are applied by the system, not stored per particle.
 */
export interface Particle {
  baseH: number;
  baseW: number;
  damping: number;
  fade: boolean;
  gravityX: number;
  gravityY: number;
  shrink: boolean;
  shrinkTo: number;
  spin: number;
}

export const ParticleDef: ComponentDef<Particle> = simpleComponent<Particle>('particle', {
  baseH: 'number',
  baseW: 'number',
  damping: 'number',
  fade: 'boolean',
  gravityX: 'number',
  gravityY: 'number',
  shrink: 'boolean',
  shrinkTo: 'number',
  spin: 'number',
});

function sample(range: Range, rng: RandomFn): number {
  return range[0] + (range[1] - range[0]) * rng();
}

/** Resolve a store by name, or `null` when the component is not registered. */
function tryGetStore<T>(world: EcsWorld, def: ComponentDef<T>): ComponentStore<T> | null {
  return (world.getStoreByName(def.name) as ComponentStore<T> | undefined) ?? null;
}

function resolveShrinkTo(shrink: BurstConfig['shrink']): number {
  if (shrink === undefined || shrink === false)
    return 1;
  if (shrink === true)
    return 0;
  return shrink.to;
}

/**
 * Spawn `config.count` particles in one shot and return their entity ids. Each
 * particle carries `PositionDef`, `VelocityDef`, `LifetimeDef`, `RenderableDef`
 * (rect), `RenderOrderDef`, `ParticleDef`, and `ParticleTag` — plus `OpacityDef`
 * / `ScaleDef` / `RotationDef` when `fadeOut` / `shrink` / `spin` are set.
 *
 * Schedule `makeVelocityIntegrationSystem` (motion), `makeLifetimeSystem`
 * (reaping), and — when any over-life option is used — {@link makeParticleSystem}.
 */
export function burst(world: EcsWorld, config: BurstConfig): EntityId[] {
  const rng = config.rng ?? Math.random;
  const shape = config.shape ?? { kind: 'point' };
  const spread = config.spread ?? Math.PI;
  const hasAngle = config.angle !== undefined;
  const jitter = config.jitter ?? (hasAngle ? spread : 0.4);
  const renderOrder = config.renderOrder ?? 0;
  const palette = typeof config.colors === 'string' ? [config.colors] : config.colors;
  const fade = config.fadeOut !== undefined && config.fadeOut !== false;
  const shrink = config.shrink !== undefined && config.shrink !== false;
  const shrinkTo = resolveShrinkTo(config.shrink);
  const spin = config.spin ?? 0;
  const gx = config.gravity?.x ?? 0;
  const gy = config.gravity?.y ?? 0;
  const damping = config.damping ?? 0;

  const positions = world.getStore(PositionDef);
  const velocities = world.getStore(VelocityDef);
  const lifetimes = world.getStore(LifetimeDef);
  const renderables = world.getStore(RenderableDef);
  const orders = world.getStore(RenderOrderDef);
  const particles = world.getStore(ParticleDef);
  const opacities = fade ? world.getStore(OpacityDef) : null;
  const scales = shrink ? world.getStore(ScaleDef) : null;
  const rotations = spin !== 0 ? world.getStore(RotationDef) : null;

  const ids: EntityId[] = [];
  for (let i = 0; i < config.count; i++) {
    // Direction: an evenly-spread radial fan when no angle is given, else a
    // jittered cone around `angle`.
    const dir = hasAngle
      ? config.angle! + (rng() * 2 - 1) * jitter
      : (Math.PI * 2 * i) / config.count + (rng() * 2 - 1) * jitter;
    const speed = sample(config.speed, rng);

    let px = config.position.x;
    let py = config.position.y;
    if (shape.kind !== 'point') {
      const a = rng() * Math.PI * 2;
      const r = shape.kind === 'ring' ? shape.radius : shape.radius * Math.sqrt(rng());
      px += Math.cos(a) * r;
      py += Math.sin(a) * r;
    }

    const size = sample(config.size, rng);
    const id = world.createEntity();
    positions.set(id, { x: px, y: py });
    velocities.set(id, { vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed });
    lifetimes.set(id, makeLifetime(sample(config.lifetimeMs, rng)));
    renderables.set(id, {
      anchor: 'center',
      fill: pick(palette, rng) ?? '#ffffff',
      h: size,
      kind: 'rect',
      w: size,
    });
    orders.set(id, { value: renderOrder });
    particles.set(id, {
      baseH: size,
      baseW: size,
      damping,
      fade,
      gravityX: gx,
      gravityY: gy,
      shrink,
      shrinkTo,
      spin,
    });
    if (opacities)
      opacities.set(id, { value: 1 });
    if (scales)
      scales.set(id, { x: 1, y: 1 });
    if (rotations)
      rotations.set(id, { angle: 0 });
    world.getTag(ParticleTag).add(id);
    ids.push(id);
  }
  return ids;
}

export interface ParticleTickCtx { dtMs: number; world: EcsWorld }

export interface ParticleSystemOptions {
  name?: string;
  /** Curve for the `fadeOut` alpha ramp. Default `linear`. */
  fadeEasing?: Easing;
  runAfter?: string[];
  /** Curve for the `shrink` scale ramp. Default `linear`. */
  shrinkEasing?: Easing;
}

/**
 * Advance over-lifetime particle animation each tick: applies gravity and
 * damping to velocity, and writes `OpacityDef` / `ScaleDef` / `RotationDef`
 * from each particle's `fraction(LifetimeDef)`. Schedule it after the lifetime
 * system has had a chance to run, but it reads the lifetime fraction directly
 * so ordering only affects a one-tick lag.
 */
export function makeParticleSystem<TCtx extends ParticleTickCtx>(
  options: ParticleSystemOptions = {},
): SchedulableSystem<TCtx> {
  const { name = 'particle', fadeEasing = linear, runAfter, shrinkEasing = linear } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const dt = ctx.dtMs / 1000;
      const store = ctx.world.getStore(ParticleDef);
      const lifetimes = ctx.world.getStore(LifetimeDef);
      const velocities = ctx.world.getStore(VelocityDef);
      // Optional visual stores — only consumers that use fade / shrink / spin
      // register them, so resolve gracefully rather than throwing.
      const opacities = tryGetStore(ctx.world, OpacityDef);
      const scales = tryGetStore(ctx.world, ScaleDef);
      const rotations = tryGetStore(ctx.world, RotationDef);
      for (const id of store.keys()) {
        const p = store.get(id)!;
        if (p.gravityX !== 0 || p.gravityY !== 0 || p.damping !== 0) {
          const vel = velocities.get(id);
          if (vel) {
            vel.vx += p.gravityX * dt;
            vel.vy += p.gravityY * dt;
            if (p.damping !== 0) {
              const keep = Math.max(0, 1 - p.damping * dt);
              vel.vx *= keep;
              vel.vy *= keep;
            }
          }
        }
        if (!p.fade && !p.shrink && p.spin === 0)
          continue;
        const life = lifetimes.get(id);
        if (!life)
          continue;
        const t = clamp01(fraction(life));
        if (p.fade) {
          const o = opacities?.get(id);
          if (o)
            o.value = 1 - fadeEasing(t);
        }
        if (p.shrink) {
          const s = scales?.get(id);
          if (s) {
            const f = lerp(1, p.shrinkTo, shrinkEasing(t));
            s.x = f;
            s.y = f;
          }
        }
        if (p.spin !== 0) {
          const r = rotations?.get(id);
          if (r)
            r.angle += p.spin * dt;
        }
      }
    },
  };
}

/** A continuous particle source: emits `config` on each `spawner` interval. */
export interface ParticleEmitter {
  config: BurstConfig;
  spawner: Spawner;
}

/**
 * Runtime-only component (holds live `Spawner` / config callbacks, so it is not
 * serializable — emitters are re-created on load, like any other system wiring).
 */
export const ParticleEmitterDef: ComponentDef<ParticleEmitter> = {
  name: 'particleEmitter',
  deserialize: () => {
    throw new Error('ParticleEmitterDef is a runtime component and cannot be deserialized.');
  },
  serialize: () => {
    throw new Error('ParticleEmitterDef is a runtime component and cannot be serialized.');
  },
};

export interface ParticleEmitterTickCtx { dtMs: number; world: EcsWorld }

export interface ParticleEmitterSystemOptions {
  name?: string;
  runAfter?: string[];
}

/**
 * Drive every {@link ParticleEmitterDef}: each tick advances its `spawner` and
 * fires a {@link burst} (centred on the emitter's current `config.position`) on
 * each elapsed interval. Set the spawner's `active` gate to pause emission
 * (e.g. a jetpack only spouts exhaust while thrusting).
 */
export function makeParticleEmitterSystem<TCtx extends ParticleEmitterTickCtx>(
  options: ParticleEmitterSystemOptions = {},
): SchedulableSystem<TCtx> {
  const { name = 'particle-emitter', runAfter } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const store = ctx.world.getStore(ParticleEmitterDef);
      for (const id of store.keys()) {
        const emitter = store.get(id);
        if (!emitter)
          continue;
        tickSpawner(emitter.spawner, ctx.dtMs, () => burst(ctx.world, emitter.config));
      }
    },
  };
}
