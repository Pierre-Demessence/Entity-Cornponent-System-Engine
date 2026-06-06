# `@pierre/ecs/modules/easing`

The Robert Penner easing-curve canon — the same set every tween system ships
(Godot `Tween`, Unity DOTween, Pixi / Phaser, GSAP). Pure, domain-free,
**zero-dependency** functions that reshape normalized time.

## API

```ts
type Easing = (t: number) => number; // t ∈ [0,1] → eased progress
```

Compose an easing with a value interpolation (`lerp` from
[`modules/math`](../math/README.md), or the [`modules/tween`](../tween/README.md)
primitive which does this for you):

```ts
import { easeOutCubic } from '@pierre/ecs/modules/easing';
import { lerp } from '@pierre/ecs/modules/math';

const value = lerp(from, to, easeOutCubic(t));
```

### Curves

Every family ships `easeIn*`, `easeOut*`, `easeInOut*`, plus `linear`:

`linear` · `Quad` · `Cubic` · `Quart` · `Quint` · `Sine` · `Expo` · `Circ` ·
`Back` · `Elastic` · `Bounce` (31 functions total).

- `easeIn*` accelerates from rest; `easeOut*` decelerates to rest; `easeInOut*`
  is symmetric (exactly `0.5` at `t = 0.5`).
- All pin `f(0) = 0` and `f(1) = 1`.
- **`Back` and `Elastic` deliberately overshoot `[0, 1]`** (anticipation /
  spring). Compose `clamp01` from `modules/math` if your target can't exceed its
  bounds.

## Usage

```ts
import { easeOutBack, easeInOutSine } from '@pierre/ecs/modules/easing';

// Pop-in with a little overshoot:
sprite.scale = lerp(0, 1, easeOutBack(progress));

// Smooth camera bob:
camera.y = lerp(low, high, easeInOutSine(progress));
```

Import via `@pierre/ecs/modules/easing`. Depends on nothing.
