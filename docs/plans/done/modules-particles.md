# Plan: `modules/particles`

**Status:** validated; awaiting commit

## Scope (resolved with user)

Build **canon-complete** (Godot `CPUParticles2D` + `ParticleProcessMaterial`,
Unity `ParticleSystem`, Phaser/Pixi emitters), not just the consumer subset —
the trigger is MET (ledger B8: 4 consumers hand-roll a radial `burst`), and per
canon-first we build the full canonical surface and let consumers exercise a
subset. Includes **both** the one-shot burst and the continuous emitter, plus
the over-lifetime curves (fade/shrink/spin) **no consumer has yet but every
engine ships**.

## Evidence

**3 consumers** do an **identical** radial burst (jetpack-explode 26,
space-invaders 12/22/6/20, frogger 16/14): `angle = 2π·i/count + rand·jitter`,
`speed ∈ [min,max]`, particle = `{Position, Velocity, Lifetime, Renderable rect,
RenderOrder, ParticleTag}`, updated by motion + lifetime systems. **None fade or
shrink** — they render constant then get destroyed, even though `OpacityDef` /
`ScaleDef` ship and the renderer already reads them. jetpack also spawns
continuous exhaust (1/frame while thrusting, directional).

> **Correction:** an exploration pass mis-reported asteroids as a 4th particle
> consumer (with fabricated line numbers). Verified: asteroids has **no**
> particle system — it splits rocks into smaller rocks. It's a candidate
> *adopter* (a rock-kill burst would be new juice) but not a current
> hand-roller. 3 real consumers + strong canon still clears the bar.

## Design

### `modules/particles` — emission

```ts
// One-shot radial/cone/shaped burst (the 4 consumers' pattern):
burst(world: EcsWorld, config: BurstConfig): EntityId[]

// Continuous emitter (jetpack exhaust): a component + system, cadence via Spawner.
interface ParticleEmitterDef { config: BurstConfig; spawner: Spawner; }
makeParticleEmitterSystem<TCtx>(opts?): SchedulableSystem<TCtx>

// Update fade/shrink/spin/damping from each particle's lifetime fraction:
makeParticleSystem<TCtx>(opts?): SchedulableSystem<TCtx>

const ParticleTag: TagDef   // module-owned tag the update/emitter systems query
```

### `BurstConfig` (canon-complete superset)

```ts
interface BurstConfig {
  position: { x: number; y: number };
  count: number;
  // Emission shape (Godot emission shapes): default 'point'.
  shape?: { kind: 'point' } | { kind: 'circle'; radius: number } | { kind: 'ring'; radius: number };
  // Direction: full-2π radial (default) or a directional cone.
  angle?: number;          // centre direction (rad); omit ⇒ full radial
  spread?: number;         // cone half-width (rad); default 2π (full circle)
  speed: [min: number, max: number];
  lifetimeMs: [min: number, max: number];
  size: [min: number, max: number];
  colors: string | readonly string[];   // single or random-pick palette
  renderOrder?: number;
  // Over-lifetime curves (the canon enhancement; opt-in):
  fadeOut?: boolean | Easing;            // alpha 1→0 (adds OpacityDef)
  shrink?: boolean | Easing | { to: number; easing?: Easing }; // scale 1→to (adds ScaleDef)
  spin?: number;                         // angular velocity rad/s (adds RotationDef)
  // Forces:
  gravity?: { x: number; y: number };    // px/s² applied each tick
  damping?: number;                      // velocity decay per second (0 = none)
  // Determinism:
  rng?: RandomFn;                        // default Math.random; pass a seeded rng
}
```

### Composition (all ship)

- `modules/lifetime` — each particle's TTL + auto-destroy; `fraction(lifetime)`
  drives the over-life curves.
- `modules/motion` — `makeVelocityIntegrationSystem` moves particles (consumer
  schedules it as today); `gravity`/`damping` handled in `makeParticleSystem`.
- `modules/render-canvas2d` — `RenderableDef` (rect), `OpacityDef`, `ScaleDef`,
  `RotationDef` (already renderer-read).
- `modules/easing` — fade/shrink curves (default `linear`/`easeOutQuad`).
- `modules/rng` — `randomInt`/`pick`/`makeSeededRng` for params (default
  `Math.random`).

`makeParticleSystem` reads each particle's `fraction(LifetimeDef)` and writes
`OpacityDef.value`, `ScaleDef`, rotation, and applies gravity/damping to
velocity — **no per-particle `Tween` object** (the lifetime Timer already tracks
progress; N tweens would be wasteful).

## Checklist

- [x] `src/modules/particles/particles.ts` (BurstConfig, burst, ParticleTag, makeParticleSystem, ParticleEmitterDef, makeParticleEmitterSystem) + `index.ts` + `particles.test.ts` + README (deps: lifetime/motion/render-canvas2d/easing/rng + spawner + timer)
- [x] Migrate space-invaders `explode` → `burst`
- [x] Migrate frogger `burst` → module `burst`
- [x] Migrate jetpack explosion → `burst`; exhaust stays local `spawnParticle` (continuous, recycle-tagged)
- [x] asteroids: ADD a fading+shrinking rock-kill `burst` as new juice (adopter)
- [x] `npm run docs:api` + docs (backlog particles → shipped; ledger B8 corrected to 3 + resolved)
- [x] Lint + full test green (808)
- [x] Browser-smoke the 4 games (bursts spawn; caught + fixed a `scale not registered` crash via tryGetStore)
- [x] Peer review (subagent, no-edit/no-askQuestions) → LGTM
- [ ] Move plan to `docs/plans/done/` in same commit

## Peer review → LGTM

Reviewer verified all emission math (radial fan / cone / circle-`r√rgng` / ring),
the over-life curve + force math (gravity / damping-clamp / fade / shrink / spin
off `fraction`), the `tryGetStore` fix completeness, all 4 migrations
behavior-preserving (ranges + wiring + jetpack dual-tag recycle + asteroids
despawn-safety via `grid.remove` no-op), and deps acyclic + documented. No
blocking issues. Fixed nits: N1 — narrowed `fadeOut`/`shrink` to honest booleans
(per-burst `Easing` was advertised but never stored — curves are system-global
via `makeParticleSystem`); N2 — replaced the `spread===π` jitter sentinel with an
explicit `jitter` field; N3 — README deps now list `modules/math`; N4 — added
cone-direction, ring, filled-circle, and damping-clamp tests (17 total).

## Browser smoke caught a real bug

`makeParticleSystem` fetched `ScaleDef`/`RotationDef`/`OpacityDef` via
`getStore` unconditionally → threw `Component "scale" not registered` in the
fade-only consumers (space-invaders/frogger/jetpack don't register Scale).
Fixed: the system now resolves the optional visual stores via `tryGetStore`
(graceful null), so a consumer only registers the components for the effects it
uses. Added a regression test. Static checks were all green — only the browser
surfaced it.

## Canon reference

Godot `CPUParticles2D` (emission shape, direction+spread, initial velocity,
scale/color curves over life, gravity, damping, angular velocity); Unity
`ParticleSystem` (emission/shape/velocity/color-over-lifetime/size-over-lifetime/
rotation modules); Phaser `ParticleEmitter`, pixi-particles.
