# `@pierre/ecs/modules/math`

The engine's value-primitive module — the `Mathf` / `Math*` equivalent, holding
scalars and every vector and rotation dimension in one place. Every export is
domain-free, dependency-free and pure, so any module or app can import it
freely. **Depends on nothing.**

| Block | File | Contents |
| --- | --- | --- |
| scalars | `math.ts` | `clamp`, `lerp`, `wrap`, … — unprefixed |
| `Vec2` | `vec2.ts` | `vec2Normalize`, `vec2ScaleToLength`, `vec2MoveToward` |
| `Vec3` | `vec3.ts` | `vec3Add`, `vec3Cross`, `vec3Normalize`, `vec3MoveToward`, … |
| `Quat` | `quat.ts` | `quatFromAxisAngle`, `quatMul`, `quatRotate`, `quatSlerp`, … |
| `Mat4` | `mat4.ts` | `mat4Multiply`, `mat4Invert`, `mat4Compose`, `mat4Perspective`, `mat4LookAt`, … |

**Why one module.** Scalars, vectors and rotations are one value layer;
splitting math by dimension across modules would just scatter closely related
helpers. `vec3MoveToward` lives beside `vec2MoveToward`, and `clamp` / `lerp`
sit next to both.

The `-3d` **module** suffix is therefore reserved for a mirrored system family —
`motion`/`motion-3d`, `transform`/`transform-3d`, `collision`/`collision-3d`,
`kinematics`/`kinematics-3d` — never for math.

## Scalars

```ts
clamp(value, min, max)                       // -> [min, max]
clamp01(value)                               // -> [0, 1]
lerp(a, b, t)                                // a + (b - a) * t, unclamped
inverseLerp(a, b, value)                     // t such that lerp(a,b,t) == value; 0 if a == b
remap(value, inMin, inMax, outMin, outMax)   // lerp ∘ inverseLerp, unclamped
smoothstep(edge0, edge1, x)                  // GLSL Hermite, clamped to 0..1
wrap(value, min, max)                        // toroidal into [min, max)
pingPong(t, length)                          // triangle wave, period 2 * length
lerpAngle(a, b, t)                           // shortest-path angular lerp (radians)
degToRad(deg)  /  radToDeg(rad)              // angle conversions
approximately(a, b, epsilon = 1e-6)          // |a - b| <= epsilon
```

### Scalar notes

- `lerp` / `inverseLerp` / `remap` are **unclamped** — compose with `clamp` /
  `clamp01` when you need to bound the result (e.g. a difficulty ramp:
  `lerp(start, min, clamp01(inverseLerp(0, rampMs, elapsed)))`).
- `inverseLerp` and `wrap` return a safe value (`0` / `min`) for a degenerate
  range rather than `NaN` / `Infinity`.
- `smoothstep` clamps internally, so `x` outside `[edge0, edge1]` saturates.
- `approximately` uses an **absolute** tolerance — pass an `epsilon` scaled to
  your magnitudes when comparing large numbers.

## Vectors and rotations

```ts
interface Vec2 { x: number; y: number }
interface Vec3 { x: number; y: number; z: number }
interface Quat { w: number; x: number; y: number; z: number }

vec2Normalize(v)               vec2ScaleToLength(v, length)
vec2MoveToward(current, target, delta)

vec3Add(a, b)                  vec3Sub(a, b)             vec3Scale(v, s)
vec3AddScaled(a, b, s)         vec3Negate(v)             vec3Lerp(a, b, t)
vec3Dot(a, b)                  vec3Cross(a, b)
vec3Length(v)                  vec3LengthSq(v)           vec3Distance(a, b)
vec3Normalize(v)               vec3ScaleToLength(v, length)
vec3MoveToward(current, target, delta)
vec3Reflect(v, normal)         vec3ClampLength(v, max)   vec3RandomUnit(rand?)

QUAT_IDENTITY                  quatMul(a, b)             quatNormalize(q)
quatFromAxisAngle(axis, angle) quatRotate(q, v)
quatForward(q)                 quatUp(q)                 quatSlerp(a, b, t)
quatLookRotation(forward, up?) // -Z along forward, +Y toward up
```

## Matrices

```ts
type Mat4 = number[]; // 16 entries, column-major

mat4Identity()                 mat4Multiply(a, b)        mat4Transpose(m)
mat4Invert(m)                  // null when singular
mat4Compose(translation, rotation, scale?)                // local-to-world
mat4Perspective(fovY, aspect, near, far)
mat4Orthographic(left, right, bottom, top, near, far)
mat4LookAt(eye, target, up?)   // a view matrix: world to camera space
mat4TransformPoint(m, p)       mat4TransformDirection(m, v)
mat4TransformVec4(m, x, y, z, w)
```

`Mat4` is the WebGL / three.js `Matrix4.elements` layout, so a matrix built here
goes to three.js with `matrix.fromArray(m)` and to WebGL with
`uniformMatrix4fv(location, false, m)`, with no transposing.

Both vector blocks are the same surface: `vec2X` pairs with `vec3X`, and both
take a value object rather than loose numbers. `vec2ScaleToLength` is the
canonical "normalize then multiply" for driving a body at a fixed speed from an
arbitrary direction — a WASD input axis (diagonals don't go faster), a
seek/steer delta, or a reflected ball velocity.

## Conventions

- **Right-handed axes**: `vec3Cross` follows the right-hand rule, and
  `quatFromAxisAngle` rotates counter-clockwise when the thumb of the right hand
  points along the axis. In a left-handed system (e.g. Unity), a port needs a
  handedness mirror, not just a sign flip.
- **`-Z` is forward.** `quatForward` returns the direction of the local `-Z` axis
  after rotation, which is the standard camera-facing convention.
  `quatUp` is the local `+Y` axis.
- **`Quat` is `{w, x, y, z}`** — scalar part first in the layout as well as in
  the name. Every library this follows spells its constructor `(x, y, z, w)`, so
  transcribe carefully on the way in.
- **`quatMul(a, b)` applies `b` first, then `a`** (Hamilton product). This is
  what makes integrating an angular velocity read `quatMul(quatFromAxisAngle(
  axis, w * dt), q)` — the new rotation is applied *after* the existing one.
  Swapping the operands silently gives the wrong rotation.
- **`Mat4` is column-major.** Entry `(row, col)` is `m[col * 4 + row]`, and the
  translation sits in `m[12], m[13], m[14]`.
- **`mat4Multiply(a, b)` applies `b` first, then `a`** — the same order as
  `quatMul`. A view-projection is `mat4Multiply(projection, view)`.
- **Projections target WebGL clip space**: NDC `x, y, z ∈ [-1, 1]` with the
  camera looking down `-Z`. `fovY` is the vertical field of view in radians,
  like every angle here. WebGPU and Bevy use a `[0, 1]` depth range instead.
- **`mat4LookAt` returns a view matrix** (world to camera, as in gl-matrix),
  not three.js `Matrix4.lookAt`'s rotation-only object orientation.
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
- **A zero-length vector normalises to zero**, not `NaN` — `vec2Normalize` and
  `vec3Normalize` both return the zero vector, and a caller that wants a
  fallback direction must supply it. `vec2ScaleToLength` /
  `vec3ScaleToLength` return zero and `quatNormalize` returns the identity for
  the same degenerate input (three.js resolves the zero quaternion the same
  way).
- **`vec2MoveToward` / `vec3MoveToward` take a *signed* `delta`.** A positive
  one steps toward the target and lands *exactly* on it rather than
  overshooting, so a repeated call converges and stays; a negative one walks
  **away** from the target; `0` leaves the position
  unchanged. A zero distance returns the target rather than `NaN`.
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
  Compose with `clamp01` when a bounded blend is wanted.
- **`vec3RandomUnit`'s `rand` is typed `() => number` structurally**, so the
  module needs no import for it. Pass a seeded `modules/rng` generator when the
  distribution must be reproducible.
- **`QUAT_IDENTITY` is frozen.** It is shared, so copy before modifying a
  quaternion obtained from it (no function here does, since all return new
  values).

## Not included

Deliberate exclusions.

- **3D ray/AABB tests** — `rayAabb` and the centre-based AABB overlap are
  `modules/collision-3d`'s primitives. This module
  stays a value-primitive module.
- **`forwardVec(yaw, pitch)` / a yaw-pitch rig.** It bakes in a convention —
  YXZ Euler order, `-Z` forward — and belongs with the camera rigs in
  `modules/camera-3d`. A generic math module must not own an Euler order.
- **Euler ↔ quaternion conversion.** Nothing hand-rolls it (the examples use
  three.js `Euler`), so it would be speculative, and Euler order is the exact
  can of worms the previous bullet avoids.
- **Float equality helpers** (`vec3IsZero`, `vec3Equals`). No hand-rolled
  consumer, and an epsilon-equality helper is a policy call — what epsilon? —
  that `approximately` already answers for scalars.
- **`sign`** — use the native `Math.sign`.

## Usage

```ts
import { clamp, quatForward, quatFromAxisAngle, quatMul, remap, vec2ScaleToLength, vec3AddScaled } from '@pierre/ecs/modules/math';

paddle.x = clamp(paddle.x, left, right - paddle.w);
const spawnMs = remap(scrollSpeed, slow, fast, slowIntervalMs, fastIntervalMs);

// Drive a body at a fixed speed, diagonals included.
const v = vec2ScaleToLength({ x: dx, y: dy }, PLAYER_SPEED);

// Integrate gravity into a velocity each tick.
const next = vec3AddScaled(vel, { x: 0, y: -1, z: 0 }, GRAVITY * dt);

// Build an orientation from a yaw about +Y and a pitch about local +X.
const yaw = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.8);
const applied = quatMul(yaw, quatFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.2));
const forward = quatForward(applied);
```

Import via `@pierre/ecs/modules/math`. Depended on by `modules/camera`,
`modules/camera-3d`, `modules/collision`, `modules/collision-3d`,
`modules/kinematics-3d`, `modules/transform-3d`, `modules/steering`,
`modules/particles` and `modules/tween`.
