# `modules/animation`

Sprite-frame animation — cycles through an ordered list of atlas frame
names at a given FPS. Follows the `Cooldown` / `Lifetime` pattern: a
flat-primitive value type, an ECS component, and a system that
auto-advances the animation and writes the current frame into the
entity's `RenderableDef`.

The **easing + tween** slice of `modules/animation` shipped separately
as `modules/easing` and `modules/tween`. Skeletal / 2D-rig animation
remains deferred.

## Canon

- Godot — `AnimatedSprite2D` + `AnimationPlayer`
- Unity — `Animator` / `Animation` clips
- Phaser — `sprite.anims.create()` + `sprite.play()`
- PixiJS — `AnimatedSprite`
- Bevy — `bevy_animation`

## Exports

### Value type

- **`SpriteAnimation`** — `{ frames: string[], fps: number, loop: boolean, currentIndex: number, elapsedMs: number }`

### Pure helpers

- **`makeSpriteAnimation(frames, fps, loop?)`** → `SpriteAnimation`
- **`tickSpriteAnimation(anim, dtMs)`** — advance time, mutates in place
- **`currentFrame(anim)`** → `string` — frame name at current position

### ECS component + system

- **`SpriteAnimationDef`** — `ComponentDef<SpriteAnimation>`
- **`makeSpriteAnimationSystem(options?)`** → `SchedulableSystem`

## Usage

```typescript
import { SpriteAnimationDef, makeSpriteAnimation, makeSpriteAnimationSystem } from '@pierre/ecs/modules/animation';
import { RenderableDef } from '@pierre/ecs/modules/render-canvas2d';

// Register
world.registerComponent(SpriteAnimationDef);
world.scheduleSystem(makeSpriteAnimationSystem());

// Create an animated sprite entity
const eid = world.createEntity();
world.getStore(SpriteAnimationDef).set(eid, makeSpriteAnimation(
  ['walk-down-0', 'walk-down-1', 'walk-down-2'],
  8,   // 8 fps
  true // loop
));
world.getStore(RenderableDef).set(eid, {
  anchor: 'center',
  atlas: 'chars',
  frame: 'walk-down-0',  // initial frame — system will overwrite
  kind: 'sprite',
});

// Change direction: swap the animation
world.getStore(SpriteAnimationDef).set(eid, makeSpriteAnimation(
  ['walk-left-0', 'walk-left-1', 'walk-left-2'],
  8,
  true
));
```

The system writes `currentFrame(anim)` into `renderable.frame` each tick,
preserving all other `Renderable` fields (atlas, kind, anchor, dw, dh).

## Design notes

- A **clip registry** (named animation clips shared across entities) is
  deferred to V2 — add it when a second consumer proves the shape.
- The `frames` array stores atlas frame **names** (strings), matching
  the `Renderable.frame` field contract.
- Zero-fps animations never advance (no division by zero).
- Empty `frames` arrays return `''` from `currentFrame` and never
  advance.
