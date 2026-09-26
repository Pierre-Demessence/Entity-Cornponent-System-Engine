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
covered by `math`'s `vec2ScaleToLength`; reach for steering when you want
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
interface Vec2 { x: number; y: number } // re-used from modules/math
interface Neighbor { position: Vec2; velocity: Vec2 }
interface WeightedForce { force: Vec2; weight: number }
interface WanderState { angle: number }
interface WanderParams { distance: number; radius: number; jitter: number; random?: () => number }
interface CircleObstacle { position: Vec2; radius: number }
interface Segment { start: Vec2; end: Vec2 }
interface WallFollowParams { desiredDistance: number; range: number }
interface Path { points: readonly Vec2[]; radius: number }

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

// Environment
function obstacleAvoidance(pos, vel, obstacles, maxSpeed, maxSeeAhead): Vec2
function wallFollowing(pos, vel, walls, params, maxSpeed): Vec2
function pathFollowing(pos, vel, path, maxSpeed, predictDistance): Vec2

// Composition
function combine(forces: WeightedForce[], maxForce): Vec2
function truncate(v: Vec2, max): Vec2
```

## Environment behaviours

- **`obstacleAvoidance`** steers laterally around the nearest circular obstacle
  in the agent's path. It projects each `CircleObstacle` centre onto the
  heading ray and, for those within `maxSeeAhead` whose perpendicular distance
  is inside the radius, pushes away from the closest one ahead. Returns the
  zero vector when nothing threatens — or when the agent is stationary, since
  there is no heading to project. Obstacles are circles because that is the
  canonical avoidance primitive (Reynolds' unaligned obstacle avoidance, Unity
  `NavMeshObstacle`, Godot RVO agent radius); polygon obstacles are a separate,
  heavier shape and are out of scope.
- **`wallFollowing`** follows the nearest wall `Segment` within `params.range`,
  holding `params.desiredDistance`. It blends a tangential term (move along the
  wall in the direction the agent already travels) with a normal correction
  that restores the gap. Returns zero when no wall is in range, or when the
  agent sits exactly on the wall (no side to pick). Wall following has no single
  engine-canon shape — it is a robotics-era behaviour — so this shape is ours.
- **`pathFollowing`** is Reynolds' stateless predictive form: predict where the
  agent is heading, and if that point strays outside the corridor
  (`path.radius`), seek back toward a target nudged forward along the nearest
  segment; otherwise return zero. No waypoint index is threaded through — the
  nearest segment is re-derived each call. It keeps the agent *on* the path but
  does not stop at the final point; compose with `arrive` for the last leg.


## Notes

- **ECS-decoupled.** Steering takes plain `Vec2` / `Neighbor` values, not
  component stores. The consumer builds neighbour arrays from its own
  spatial index (e.g. `ContinuousHashGrid2D.queryNear`) and adapts its
  `VelocityDef {vx, vy}` to `Vec2 {x, y}` at the call boundary.
- **Cross-module dependency.** Imports `vec2Normalize` / `vec2ScaleToLength` /
  `Vec2` from `@pierre/ecs/modules/math` (same pattern as
  `collision → math`). No other module dependency.
- **Zero-neighbour safety.** The flocking behaviours return the zero
  vector when the neighbour list is empty; `vec2Normalize` /
  `vec2ScaleToLength` return zero for a zero-length input, so degenerate inputs
  never produce `NaN`.
