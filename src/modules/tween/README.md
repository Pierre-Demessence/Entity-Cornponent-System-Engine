# `@pierre/ecs/modules/tween`

The `Tween` value primitive — interpolates a number `from → to` over a duration
along an easing curve. Canon: Godot `Tween`, Unity DOTween, Pixi / Phaser, GSAP.

It **composes** existing primitives rather than reinventing them: a
[`Timer`](../timer/README.md) tracks time, an [`Easing`](../easing/README.md)
curve reshapes progress, and `lerp` from [`modules/math`](../math/README.md)
does the value interpolation.

A pure value (like `Timer` / `Spawner`), **not** an ECS component — read the
current value each tick wherever you animate (render code, a system, a
callback). Single-channel; for multi-channel (x + y, RGB) run one tween per
channel.

## API

```ts
interface Tween {
  from: number;
  to: number;
  readonly easing: Easing;
  readonly timer: Timer;
}

makeTween(durationMs, from, to, easing?, mode?): Tween   // default easing linear, mode 'once'
tickTween(tw, dtMs): number   // advance + return current eased value
tweenValue(tw): number        // current eased value without advancing
tweenDone(tw): boolean        // finished ('once') / per-wrap edge ('repeating')
resetTween(tw, { from?, to?, durationMs? }?): void   // restart, optionally retarget
```

`tickTween` is `tickTimer(timer, dt)` then `lerp(from, to, easing(fraction(timer)))`.

## Usage

```ts
import { makeTween, tickTween, tweenDone } from '@pierre/ecs/modules/tween';
import { easeOutBack } from '@pierre/ecs/modules/easing';

// Pop a pickup in with a little overshoot:
const pop = makeTween(250, 0, 1, easeOutBack);
// each frame:
const scale = tickTween(pop, dtMs);
if (tweenDone(pop)) { /* settle */ }

// Re-aim a value mid-flight (e.g. chase a new target):
resetTween(pop, { from: scale, to: 1.2, durationMs: 120 });
```

## Not included

- **`TweenDef` ECS component + system** — deferred. No current consumer animates
  via a component (they read `tweenValue` inline), and the ECS-wrapper shape is
  not single-canon (Godot node vs DOTween fluent chain). Add when a consumer
  needs declarative per-entity tweens.
- **Multi-channel / vector tweens** — run one `Tween` per channel for now.

Import via `@pierre/ecs/modules/tween`. Depends on `modules/timer`,
`modules/easing`, and `modules/math`.
