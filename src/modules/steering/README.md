# `@pierre/ecs/modules/steering`

Reynolds steering behaviours as pure functions. Each behaviour takes an
agent's position / velocity (and, for flocking, its neighbours) and
returns a **steering force** — `desired − velocity` — in generic
`Vec2 {x, y}`. Blend several with `combine`, then apply the result as
acceleration and let `@pierre/ecs/modules/motion` integrate it.

Canon: Craig Reynolds, *Steering Behaviors For Autonomous Characters*
(1987) — the universal set shipped by Unity, Godot, Unreal, and every
boids demo. First consumer: [`examples/boids`](../../../examples/boids/).

## Force model (why forces, not desired velocities)

A behaviour returns `desired − velocity`, not the desired velocity
itself. Returning the *force* is what lets multiple behaviours blend with
momentum — the flocking-quality difference over "just set
`velocity = dir × speed`". The constant-speed snap case (an enemy that
instantly points at the player) is the degenerate form and is already
covered by `motion`'s `scaleToSpeed`; reach for steering when you want
**smoothed** or **composed** motion.

Per-tick application (what the consumer does):

```ts
const accel = combine([
  { force: separation(pos, neighbors, vel, maxSpeed), weight: 1.8 },
  { force: alignment(vel, neighbors, maxSpeed), weight: 1.0 },
  { force: cohesion(pos, neighbors, vel, maxSpeed), weight: 0.9 },
], maxForce);
vel = truncate({ x: vel.x + accel.x * dt, y: vel.y + accel.y * dt }, maxSpeed);
```

## API

```ts
interface Vec2 { x: number; y: number } // re-used from modules/motion
interface Neighbor { position: Vec2; velocity: Vec2 }
interface WeightedForce { force: Vec2; weight: number }
interface WanderState { angle: number }
interface WanderParams { distance: number; radius: number; jitter: number; random?: () => number }

// Target behaviours
function seek(pos, target, vel, maxSpeed): Vec2
function flee(pos, target, vel, maxSpeed): Vec2
function arrive(pos, target, vel, maxSpeed, slowRadius): Vec2
function pursue(pos, vel, targetPos, targetVel, maxSpeed): Vec2
function evade(pos, vel, targetPos, targetVel, maxSpeed): Vec2

// Meandering
function wander(vel, state, params, maxSpeed): Vec2 // mutates state.angle

// Flocking (Reynolds boids)
function separation(pos, neighbors, vel, maxSpeed): Vec2
function alignment(vel, neighbors, maxSpeed): Vec2
function cohesion(pos, neighbors, vel, maxSpeed): Vec2

// Composition
function combine(forces: WeightedForce[], maxForce): Vec2
function truncate(v: Vec2, max): Vec2
```

## Notes

- **ECS-decoupled.** Steering takes plain `Vec2` / `Neighbor` values, not
  component stores. The consumer builds neighbour arrays from its own
  spatial index (e.g. `ContinuousHashGrid2D.queryNear`) and adapts its
  `VelocityDef {vx, vy}` to `Vec2 {x, y}` at the call boundary.
- **Cross-module dependency.** Imports `normalize` / `scaleToSpeed` /
  `Vec2` from `@pierre/ecs/modules/motion` (same pattern as
  `collision → math`). No other module dependency.
- **Zero-neighbour safety.** The flocking behaviours return the zero
  vector when the neighbour list is empty; `normalize` / `scaleToSpeed`
  return zero for a zero-length input, so degenerate inputs never produce
  `NaN`.
