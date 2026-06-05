# `@pierre/ecs/modules/math`

Pure scalar-math helpers — the engine's `Mathf` / Godot `Math*` equivalent.
Every export is a domain-free, dependency-free pure number op, so any module
or app can import it freely. **Depends on nothing.**

Vector helpers (`normalize`, `scaleToSpeed`, …) live with
[`modules/motion`](../motion/README.md) as `vec`; this module is scalars only.

## Functions

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

### Notes

- `lerp` / `inverseLerp` / `remap` are **unclamped** — compose with `clamp` /
  `clamp01` when you need to bound the result (e.g. a difficulty ramp:
  `lerp(start, min, clamp01(inverseLerp(0, rampMs, elapsed)))`).
- `inverseLerp` and `wrap` return a safe value (`0` / `min`) for a degenerate
  range rather than `NaN` / `Infinity`.
- `smoothstep` clamps internally, so `x` outside `[edge0, edge1]` saturates.
- `approximately` uses an **absolute** tolerance — pass an `epsilon` scaled to
  your magnitudes when comparing large numbers.

## Not included (by design)

- **`sign`** — use the native `Math.sign`.
- **`moveToward`** — the game-useful form is the *vector* one
  (`Vector2.move_toward`); it belongs next to `vec` in `modules/motion`, not
  here. Deferred until a consumer needs it (camera follow).

## Usage

```ts
import { clamp, remap } from '@pierre/ecs/modules/math';

paddle.x = clamp(paddle.x, left, right - paddle.w);
const spawnMs = remap(scrollSpeed, slow, fast, slowIntervalMs, fastIntervalMs);
```

Import via `@pierre/ecs/modules/math`. Depended on by `modules/collision`
(closest-point clamp).
