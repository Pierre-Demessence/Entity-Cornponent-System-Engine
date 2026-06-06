# `@pierre/ecs/modules/particles`

One-shot bursts and continuous emitters of short-lived particle entities,
animated over their lifetime (fade, shrink, spin, gravity, damping). Canon:
Godot `CPUParticles2D` + `ParticleProcessMaterial`, Unity `ParticleSystem`,
Phaser `ParticleEmitter`, pixi-particles.

There is **no special particle renderer** — particles are ordinary
`RenderableDef` rects drawn by [`modules/render-canvas2d`](../render-canvas2d/README.md),
moved by [`modules/motion`](../motion/README.md), and reaped by
[`modules/lifetime`](../lifetime/README.md). This module supplies the emission
patterns and the over-lifetime animation.

## API

```ts
const ParticleTag: TagDef;        // on every spawned particle
const ParticleDef: ComponentDef;  // per-particle over-life fields (runtime)

// One-shot burst (returns the spawned entity ids):
burst(world: EcsWorld, config: BurstConfig): EntityId[]

// Update over-life animation (fade / shrink / spin / gravity / damping):
makeParticleSystem<TCtx>(opts?: {
  fadeEasing?: Easing;    // default linear
  shrinkEasing?: Easing;  // default linear
  name?; runAfter?;
}): SchedulableSystem<TCtx>

// Continuous emitter (a runtime component + system; cadence via a Spawner):
interface ParticleEmitter { config: BurstConfig; spawner: Spawner }
const ParticleEmitterDef: ComponentDef<ParticleEmitter>;
makeParticleEmitterSystem<TCtx>(opts?): SchedulableSystem<TCtx>
```

### `BurstConfig`

```ts
interface BurstConfig {
  position: { x: number; y: number };
  count: number;
  shape?: { kind: 'point' } | { kind: 'circle'; radius } | { kind: 'ring'; radius }; // default point
  angle?: number;        // centre direction (rad); omit ⇒ full-circle radial fan
  spread?: number;       // cone half-width (rad); default π (full circle)
  speed: [min, max];     // world units / s
  lifetimeMs: [min, max];
  size: [min, max];      // square px
  colors: string | readonly string[];   // single or random-pick palette
  renderOrder?: number;
  fadeOut?: boolean | Easing;            // alpha 1→0 (adds OpacityDef)
  shrink?: boolean | Easing | { to: number; easing? }; // scale 1→to (adds ScaleDef)
  spin?: number;                         // angular velocity rad/s (adds RotationDef)
  gravity?: { x: number; y: number };    // px/s² added to velocity each tick
  damping?: number;                      // fractional velocity decay / s
  rng?: RandomFn;                        // default Math.random; pass a seeded rng
}
```

`fadeOut` / `shrink` / `spin` only attach `OpacityDef` / `ScaleDef` /
`RotationDef` when used, so a plain burst stays minimal. Over-life curves read
each particle's `fraction(LifetimeDef)`, so no per-particle `Tween` object is
needed.

## Usage

```ts
import { burst, makeParticleSystem, ParticleTag } from '@pierre/ecs/modules/particles';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { easeOutQuad } from '@pierre/ecs/modules/easing';

// register Position/Velocity/Lifetime/Renderable/RenderOrder/ParticleDef
// (+ Opacity/Scale/Rotation if you use fade/shrink/spin), and ParticleTag.

// Explosion with fade-out:
burst(world, {
  position: { x, y }, count: 24, speed: [60, 280], lifetimeMs: [400, 800],
  size: [3, 7], colors: ['#ff7b00', '#ffd23f'], fadeOut: true,
});

scheduler
  .add(makeVelocityIntegrationSystem())  // moves particles
  .add(makeParticleSystem({ fadeEasing: easeOutQuad }))  // fades them
  .add(makeLifetimeSystem());            // destroys them on expiry
```

Continuous emitter (e.g. a thruster that only spouts while active):

```ts
import { makeSpawner } from '@pierre/ecs/modules/spawner';

world.getStore(ParticleEmitterDef).set(playerId, {
  config: { position: exhaustPoint, count: 1, angle: Math.PI / 2, spread: 0.3,
            speed: [80, 200], lifetimeMs: [280, 440], size: [3, 6], colors: '#9fd2ff' },
  spawner: makeSpawner(() => 30, { active: () => state.thrusting }),
});
// schedule makeParticleEmitterSystem() before the motion system.
```

## Out of scope

- **Sub-emitters / trails / collision** — Godot/Unity advanced features; add when
  a consumer needs them.
- **Non-rect particle shapes** beyond what `RenderableDef` already offers
  (sprites work — pass a sprite renderable is not yet wired; rects only in V1).

Import via `@pierre/ecs/modules/particles`. Depends on `modules/lifetime`,
`modules/timer`, `modules/math`, `modules/transform` components,
`modules/render-canvas2d`, `modules/easing`, `modules/rng`, and `modules/spawner`.
