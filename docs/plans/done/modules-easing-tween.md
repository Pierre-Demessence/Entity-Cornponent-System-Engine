# Plan: `modules/easing` + `modules/tween`

**Status:** validated; awaiting commit

## Scope (resolved with user)

Ship two layers, defer the third — built **canon-first** (the easing curves are
unanimous universal canon: Robert Penner, Godot `Tween`, Unity DOTween, Pixi /
Phaser, GSAP), validated by 6 consumers that currently hand-roll linear interp
because no easing ships.

1. **`modules/easing`** — pure easing functions (~30, the Penner canon set).
   A domain-free, zero-dependency leaf (math-tier), independently useful to
   tween / particles / camera / animation. Mirrors the `modules/math` leaf.
2. **`modules/tween`** — the `Tween` **value primitive** (`makeTween` /
   `tickTween`), composing `modules/timer` (time) + `modules/easing` (curve) +
   `modules/math` (`lerp`). Mirrors the `Timer` / `Spawner` value pattern.
3. **`TweenDef` ECS component + `makeTweenSystem`** — **DEFERRED.** None of the
   6 consumers animate via a component; they read an interpolated value inline.
   A string-keyed `targetProperty` dispatch is over-fit with 0 consumers, and
   the ECS-wrapper shape (Godot node vs DOTween fluent chain) is **not** a
   single canon. Ship when a consumer wants declarative per-entity tweens.

## Why these compose, not duplicate

- `math.lerp(a, b, t)` does the value interpolation; easing only reshapes `t`.
- `Timer` (`tickTimer` / `fraction → [0,1]`) tracks time; a tween is
  `lerp(from, to, easing(fraction(timer)))`. No new accumulator.

## `modules/easing` API

```ts
type Easing = (t: number) => number; // t ∈ [0,1] → eased [0,1] (may overshoot for back/elastic)

linear
easeInQuad / easeOutQuad / easeInOutQuad
easeInCubic / easeOutCubic / easeInOutCubic
easeInQuart / easeOutQuart / easeInOutQuart
easeInQuint / easeOutQuint / easeInOutQuint
easeInSine / easeOutSine / easeInOutSine
easeInExpo / easeOutExpo / easeInOutExpo
easeInCirc / easeOutCirc / easeInOutCirc
easeInBack / easeOutBack / easeInOutBack
easeInElastic / easeOutElastic / easeInOutElastic
easeInBounce / easeOutBounce / easeInOutBounce
```

Penner-standard formulas. `back`/`elastic` overshoot `[0,1]` by design (callers
that need a clamped result compose `clamp01`).

## `modules/tween` API

```ts
interface Tween {
  from: number;
  to: number;
  easing: Easing;       // default linear
  timer: Timer;         // 'once' by default; 'repeating' for loop
}

makeTween(durationMs, from, to, easing?, mode?: TimerMode): Tween
tickTween(tw: Tween, dtMs: number): number   // advances + returns current eased value
tweenValue(tw: Tween): number                // current value without advancing
tweenDone(tw: Tween): boolean                // finished (once-mode)
resetTween(tw: Tween): void                  // restart the timer
```

`tickTween` = `tickTimer(tw.timer, dt)` then `lerp(from, to, easing(fraction(timer)))`.
Numeric single-channel; multi-channel (x+y / color) = the consumer runs N tweens
(a vec-tween can follow later if a consumer needs it).

## Checklist

- [x] `src/modules/easing/easing.ts` (~30 fns) + `index.ts` + `easing.test.ts` + README
- [x] `src/modules/tween/tween.ts` (Tween, makeTween, tickTween, tweenValue, tweenDone, resetTween) + `index.ts` + `tween.test.ts` + README (documents deps: timer/easing/math)
- [x] Migrate rhythm fades to prove the primitive end-to-end (lane flash, hit/miss/judgement fades → easeOut; note scroll-in stays linear or easeIn)
- [x] `npm run docs:api` (new exports) — drift test green
- [x] Lint + full test green
- [x] Browser-smoke rhythm (fades render, eased)
- [x] Backlog: split `modules/animation` → `easing` + `tween` ✅ shipped; note component-layer deferral; ledger if applicable
- [x] Peer review (subagent, no-edit/no-askQuestions) → LGTM
- [ ] Move plan to `docs/plans/done/` in same commit

## Peer review → LGTM

Reviewer verified all **31 easing formulas** coefficient-by-coefficient against
the Penner/easings.net canon (constants, segment boundaries, t=0/t=1 special
cases) — no errors. Tween composition confirmed correct: `lerp(from, to,
easing(fraction(timer)))` goes from→to (not reversed), once-mode clamps at `to`,
repeating wraps; no reinvented interpolation/accumulator. rhythm timing
preserved (the `*4`/`/0.6` magic numbers map exactly to `/LANE_FLASH_S` (0.125),
`/NOTE_FADE_S` (0.25), `/JUDGEMENT_FADE_S` (0.6); scroll-in left linear). Deps
acyclic + documented (easing→∅; tween→{timer,easing,math}). Nit fixed: N1 —
added golden-midpoint assertions (quart/quint/expo/sine/circ/back) to pin
interior coefficients the endpoint/midpoint checks miss; N2 — tightened a
rhythm comment. N3 ("6 consumers" count) is a shipping justification, verified
in exploration. Browser-smoked rhythm (4 lanes, notes scroll, MISS popup + note
fades animate via easeOutCubic), 0 errors.

## Consumer migration

Migrate **rhythm** (5 fade/scroll sites) to prove the primitive end-to-end:
- lane-flash decay, hit-note fade, miss-note fade, judgement-popup fade →
  `easeOut*` (snappier visual juice than linear).
- note scroll-in → keep linear (or `easeIn`) — constant-speed approach reads
  best for a rhythm game; decide on review.
Other hand-rolled sites (frogger flash, the spawn/scroll ramps already on
`math.lerp`, platformer-3d camera) are **optional** later polish — flag, don't
force.
