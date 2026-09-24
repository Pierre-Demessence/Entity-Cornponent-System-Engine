# `@pierre/ecs/modules/math-3d`

Domain-free 3D value primitives: a `Vec3` vector block and a `Quat` rotation
block. Every function is pure and returns a new value rather than mutating its
inputs, so a `Vec3` read out of a component store can be passed around freely.
**Depends on nothing** — not even `modules/math`.

This is the 3D sibling of the `Vec2` helpers in
[`modules/motion/vec`](../motion/vec.ts), with the ops the 2D side never needed
(`cross`, `dot`, reflection, clamp-length) plus the quaternion block. For scalar
math (`lerp`, `clamp`, `approximately`) use [`modules/math`](../math/README.md);
it is a different primitive.

Canon pattern: three.js `Vector3` / `Quaternion`, Bevy `Vec3` / `Quat`, Unity
`Vector3` / `Quaternion`, Godot `Vector3` / `Quaternion`.

## API

```ts
interface Vec3 { x: number; y: number; z: number }

vec3Add(a, b)                  vec3Sub(a, b)             vec3Scale(v, s)
vec3AddScaled(a, b, s)         vec3Negate(v)             vec3Lerp(a, b, t)
vec3Dot(a, b)                  vec3Cross(a, b)
vec3Length(v)                  vec3LengthSq(v)           vec3Distance(a, b)
vec3Normalize(v)               vec3ScaleToLength(v, length)
vec3Reflect(v, normal)         vec3ClampLength(v, max)   vec3RandomUnit(rand?)

interface Quat { w: number; x: number; y: number; z: number }

QUAT_IDENTITY                  quatMul(a, b)             quatNormalize(q)
quatFromAxisAngle(axis, angle) quatRotate(q, v)
quatForward(q)                 quatUp(q)                 quatSlerp(a, b, t)
```

## Conventions

- **Right-handed axes**, matching three.js, Bevy and Godot: `vec3Cross` follows
  the right-hand rule, and `quatFromAxisAngle` rotates counter-clockwise when the
  thumb of the right hand points along the axis. Unity is left-handed, so a port
  to it needs a handedness mirror, not just a sign flip.
- **`-Z` is forward.** `quatForward` returns the direction of the local `-Z` axis
  after rotation, which is the camera-facing convention three.js and Godot use.
  `quatUp` is the local `+Y` axis.
- **`Quat` is `{w, x, y, z}`** — scalar part first in the layout as well as in
  the name. Every library this follows spells its constructor `(x, y, z, w)`, so
  transcribe carefully on the way in.
- **`quatMul(a, b)` applies `b` first, then `a`** (Hamilton product). This is
  what makes integrating an angular velocity read `quatMul(quatFromAxisAngle(
  axis, w * dt), q)` — the new rotation is applied *after* the existing one.
  Swapping the operands silently gives the wrong rotation.
- **Rotations must be unit-length.** `quatRotate` on a non-unit `q` scales the
  result instead of rotating it, and `vec3Reflect` on a non-unit `normal`
  skews. `quatFromAxisAngle` normalises its axis for you and `quatMul` /
  `quatNormalize` of unit inputs stay unit, so the usual path needs no care.
- **`quatSlerp` blends rotations, not numbers.** It turns at a constant angular
  speed along the **shortest path** — a pair more than a half turn apart has
  one quaternion negated first, so a quarter turn stays a quarter turn. That is
  what separates it from a component-wise lerp of `{w, x, y, z}` followed by a
  normalise, which is only accurate for nearly-parallel inputs (and is exactly
  the fallback `quatSlerp` uses there, since the rotation axis is undefined).
  Its `t` is unclamped like `vec3Lerp`'s.
- **`vec3Normalize({0, 0, 0})` returns `{0, 0, 0}`**, not `NaN` — a
  zero-length vector has no direction, and a caller that wants a fallback must
  supply it. This matches `modules/motion`'s `normalize` for `Vec2`.
  `vec3ScaleToLength` returns zero and `quatNormalize` returns the identity for
  the same degenerate inputs (three.js resolves the zero quaternion the same
  way).
- **`vec3ClampLength` returns its input object** when the vector is already
  short enough, rather than a copy — a cheap fast path that is safe only because
  nothing here mutates. Don't write to the result expecting a fresh object. A
  non-positive `max` yields the zero vector: a negative length budget means "no
  length allowed", not "reverse the direction".
- **Non-finite input propagates.** `NaN` in gives `NaN` out, as with any JS math
  function — the zero guards key on an exactly-zero magnitude, so a non-finite
  vector is never quietly turned into a zero one (and `Infinity / Infinity`
  yields `NaN`, not zero). A caller that can hold a bad position has to validate
  it itself.
- **`vec3Lerp`'s `t` is unclamped**, so `t = 2` is a legal extrapolation.
  Compose with `modules/math`'s `clamp01` when a bounded blend is wanted.
- **`vec3RandomUnit`'s `rand` is typed `() => number` structurally**, so the
  module needs no import for it. Pass a seeded `modules/rng` generator when the
  distribution must be reproducible.
- **`QUAT_IDENTITY` is frozen.** It is shared, so copy before modifying a
  quaternion obtained from it (no function here does, since all return new
  values).

## Not included

Deliberate exclusions.

- **3D ray/AABB tests** — `rayAabb` and the centre-based AABB overlap are
  `modules/collision-3d`'s primitives, per the 3D group table in the
  [module backlog](../../../docs/roadmap/ecs-module-backlog.md). This slice stays
  a value-primitive module, exactly like `modules/math` and `modules/noise`.
- **`forwardVec(yaw, pitch)` / a yaw-pitch rig.** Verbatim in two examples
  (`doom/src/systems/math.ts`, `portal/src/systems/portal-math.ts`), but it
  bakes in a convention — YXZ Euler order, `-Z` forward — and camera rigs are
  the 3D group's `camera-3d`. A generic math module must not own an Euler order.
- **Euler ↔ quaternion conversion.** Nothing hand-rolls it (the examples use
  three.js `Euler`), so it would be speculative, and Euler order is the exact
  can of worms the previous bullet avoids.
- **Float equality helpers** (`vec3IsZero`, `vec3Equals`). No hand-rolled
  consumer, and an epsilon-equality helper is a policy call — what epsilon? —
  that `modules/math`'s `approximately` already answers for scalars.

## Usage

```ts
import { makeSeededRng } from '@pierre/ecs/modules/rng';
import { quatForward, quatFromAxisAngle, quatMul, vec3AddScaled, vec3RandomUnit, vec3ScaleToLength } from '@pierre/ecs/modules/math-3d';

// Integrate gravity into a velocity each tick.
const next = vec3AddScaled(vel, GRAVITY, dt);

// Drive a body at a fixed speed along an arbitrary direction.
const chase = vec3ScaleToLength({ x: dx, y: 0, z: dz }, ENEMY_SPEED);

// Build an orientation from a yaw about +Y and a pitch about local +X, then
// read the forward direction back out.
const yaw = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.8);
const applied = quatMul(yaw, quatFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.2));
const forward = quatForward(applied);

// A uniform direction, reproducible from a seeded generator.
const spread = vec3RandomUnit(makeSeededRng(1337));
```
