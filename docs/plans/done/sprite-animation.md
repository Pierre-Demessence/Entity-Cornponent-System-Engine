# Sprite-Frame Animation Module

Plan for `modules/animation` — the sprite-frame animation slice of the
deferred `modules/animation` backlog entry.

## Motivation

`@pierre/ecs` already ships easing + tween (`modules/easing`,
`modules/tween`) but has **no sprite-frame animation** — cycling through
a list of atlas frame names at a given FPS, looping or one-shot. Every
mature 2D engine ships this:

- Godot — `AnimatedSprite2D` + `AnimationPlayer`
- Unity — `Animator` / `Animation` clips
- Phaser — `sprite.anims.create()` + `sprite.play()`
- PixiJS — `AnimatedSprite`
- Bevy — `bevy_animation`

**Canon strength: Unanimous universal → 0 internal consumers needed.**

All dependencies are already in place:

- Sprite rendering (`Renderable.kind: 'sprite'`) shipped ✅
- Texture atlas loading + frame resolution (`TextureAtlasRegistry`) shipped ✅
- `Timer` value primitive (for frame timing) shipped ✅
- `simpleComponent` (for flat-schema component defs) shipped ✅

## Shape

A **value primitive** + **ECS component** + **system**, following the
`Cooldown` / `Lifetime` pattern (not the `Tween` pure-value pattern,
because sprite animation is per-entity state that writes to
`RenderableDef`).

### Value type

```typescript
interface SpriteAnimation {
  frames: string[];      // ordered frame names (atlas frame keys)
  fps: number;           // frames per second
  loop: boolean;         // restart from frame 0 when done?
  currentIndex: number;  // mutable: current frame position
  elapsedMs: number;     // mutable: time accumulator
}
```

### Pure helpers

| Function | Signature |
|---|---|
| `makeSpriteAnimation` | `(frames: string[], fps: number, loop?: boolean) => SpriteAnimation` |
| `tickSpriteAnimation` | `(anim: SpriteAnimation, dtMs: number) => void` |
| `currentFrame` | `(anim: SpriteAnimation) => string` |

`tickSpriteAnimation` accumulates `dtMs`, advances `currentIndex` when
`elapsedMs >= 1000/fps`, and wraps (loop) or latches at last frame
(non-loop). `currentFrame` returns `frames[currentIndex]`.

### ECS component + system

```typescript
const SpriteAnimationDef: ComponentDef<SpriteAnimation>

function makeSpriteAnimationSystem<TCtx extends SpriteAnimationTickCtx>(
  options?: SpriteAnimationSystemOptions,
): SchedulableSystem<TCtx>
```

The system:

1. Queries all entities with `SpriteAnimationDef` + `RenderableDef`
2. Calls `tickSpriteAnimation(anim, ctx.dtMs)`
3. Writes `currentFrame(anim)` into `renderable.frame`
4. Preserves all other `Renderable` fields (atlas, kind, anchor, dw, dh, etc.)

### Module layout

```
src/modules/animation/
  index.ts                  — barrel re-export
  sprite-animation.ts       — value type + component + system
  sprite-animation.test.ts  — tests
  README.md                 — module docs
```

No `package.json` change needed — the wildcard export
`"./modules/*": "./src/modules/*/index.ts"` covers it.

## Consumer integration: RPG example

The RPG example currently uses a static sprite at frame `'100'`. Replace
with the `tiny-16-basic/characters.png` sprite sheet and 4-directional
walk animations.

Sprite sheet layout (12×8 tiles of 16×16px, 8 characters arranged 4×2):

| Direction | Character 0 frames |
|---|---|
| Down  | 0, 1, 2 |
| Left  | 12, 13, 14 |
| Right | 24, 25, 26 |
| Up    | 36, 37, 38 |

Each direction is its own `SpriteAnimation` (3 frames, ~8 FPS, loop).
The input system swaps the animation when direction changes.

## Implementation checklist

- [x] Create `src/modules/animation/index.ts`
- [x] Create `src/modules/animation/sprite-animation.ts`
- [x] Create `src/modules/animation/sprite-animation.test.ts`
- [x] Create `src/modules/animation/README.md`
- [x] Run `npm test` — all tests pass
- [x] Run `npm run docs:api` — regenerate engine API catalog
- [x] Integrate into RPG example
- [x] Update `docs/roadmap/ecs-module-backlog.md` — mark sprite-animation as shipped
- [x] Update `docs/roadmap/engine-gap-ledger.md` — add resolved entry (B18 resolved)

## Decisions

### Decision — 2026-06-07

**Decision:** Ship sprite-frame animation as a value primitive + ECS
component + system, not as an animation-clip registry model.

**Context:** Godot/Unity/Phaser use a registry model (named animation
clips that are referenced by key). A registry is more powerful but
heavier — it requires a global animation-clip store, clip lookup by name,
and lifecycle management.

**Options:**

- A. Value primitive only (like `Timer`) — consumer manages frame lists
  and writes to `Renderable` manually. Minimal engine surface, but every
  consumer reinvents the same tick-accumulate-write loop.
- B. Value primitive + ECS component + auto-write system (chosen) — the
  engine ships the tick loop; consumers just set the animation on the
  entity. Slightly more opinionated, but the auto-write to `Renderable`
  is what every consumer does anyway.
- C. Full animation-clip registry — named clips, cross-entity sharing,
  playback control (play/pause/stop). Over-engineered for V1; a registry
  can layer on top later if ≥2 consumers need clip sharing.

**Rationale:** B is the minimal useful surface that still eliminates the
hand-rolled tick-accumulate-write loop. It follows the established
`CooldownDef`/`makeCooldownSystem` pattern. A registry (C) is a V2
concern — add it when a second consumer proves the shape.

**Impact:** No renderer changes. The system writes to `RenderableDef`,
which the existing `Canvas2DRenderer` already draws.

**Review:** When a second consumer needs animation-clip sharing (lookup
by name, cross-entity reuse), revisit for a registry layer.

### Decision — 2026-06-07

**Decision:** Embed `SpriteAnimation` fields in a `simpleComponent`, not
a `registryComponent`.

**Context:** `simpleComponent` auto-generates serialize/deserialize from
flat primitives. `SpriteAnimation` has `string[]`, `number`, `boolean` —
all `simpleComponent`-compatible. A `registryComponent` would store only
an id and look up the animation definition elsewhere — but that's the
clip-registry model we're deferring.

**Rationale:** `simpleComponent` is the right fit for flat, self-contained
component data. Every field is a primitive or array-of-primitive.

**Impact:** `SpriteAnimation` is serializable out of the box — save/load
preserves animation state.
