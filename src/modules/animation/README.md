# `modules/animation`

Sprite-frame animation — cycles through an ordered list of atlas frame
names at a given FPS. Follows the `Cooldown` / `Lifetime` pattern: a
flat-primitive value type, an ECS component, and a system that
auto-advances the animation and writes the current frame into the
entity's `RenderableDef`.

The **easing + tween** slice of `modules/animation` shipped separately
as `modules/easing` and `modules/tween`. Skeletal / 2D-rig animation
remains deferred.

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
import { PositionDef } from '@pierre/ecs/modules/transform';

// Register — Renderable requires position
world.registerComponent(PositionDef);
world.registerComponent(RenderableDef);
world.registerComponent(SpriteAnimationDef);
scheduler.add(makeSpriteAnimationSystem());

// Create an animated sprite entity
const eid = world.createEntity();
world.getStore(PositionDef).set(eid, { x: 0, y: 0 });
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

## Shared clips: the clip registry

`SpriteAnimation` embeds its frame list in every component — ideal for one-off
or procedural animations. When many entities share the same named clips, use the
**clip registry** instead: define each clip once, and give each entity a light
`SpriteAnimator` that references a clip by key and holds only playback state.

### Exports

- **`SpriteClip`** — immutable shared clip: `{ frames: readonly string[]; fps: number; loop: boolean }`
- **`SpriteClipRegistry`** — `register(name, clip)` (throws on empty name,
  duplicate key, or non-positive fps), `get`, `has`, `require`
- **`SpriteAnimator`** — per-entity state: `{ clip: string; currentIndex: number; elapsedMs: number; playing: boolean }`
- **`SpriteAnimatorDef`** — `ComponentDef<SpriteAnimator>`
- **`makeSpriteAnimator(clip, playing?)`** → `SpriteAnimator`
- **`playClip(animator, clip, restart?)`** — switch clip + reset cursor; no-op
  when already playing that clip (pass `restart` to force)
- **`tickSpriteAnimator(animator, clip, dtMs)`** — advance; paused animators
  do not move
- **`currentAnimatorFrame(animator, clip)`** → `string`
- **`makeSpriteClipAnimationSystem({ registry, onMissingClip?, … })`** → `SchedulableSystem`

```typescript
import {
  makeSpriteAnimator,
  makeSpriteClipAnimationSystem,
  playClip,
  SpriteAnimatorDef,
  SpriteClipRegistry,
} from '@pierre/ecs/modules/animation';

const clips = new SpriteClipRegistry()
  .register('walk', { frames: ['walk-0', 'walk-1', 'walk-2'], fps: 8, loop: true })
  .register('idle', { frames: ['idle-0', 'idle-1'], fps: 2, loop: true });

world.registerComponent(SpriteAnimatorDef);
scheduler.add(makeSpriteClipAnimationSystem({ registry: clips }));

const eid = world.createEntity();
world.getStore(SpriteAnimatorDef).set(eid, makeSpriteAnimator('idle'));

// On input, switch clips — pausing is just `animator.playing = false`.
playClip(world.getStore(SpriteAnimatorDef).get(eid)!, 'walk');
```

An animator whose `clip` key is not in the registry is skipped for that tick and
reported to the optional `onMissingClip(entityId, clip)` callback.

## Design notes

- The **clip registry** above is the shared-clip counterpart to the inline
  `SpriteAnimation`: use inline for procedural / one-off clips, the registry for
  clips shared across entities.
- The `frames` array stores atlas frame **names** (strings), matching
  the `Renderable.frame` field contract.
- Zero-fps animations never advance (no division by zero).
- Empty `frames` arrays return `''` from `currentFrame` and never
  advance.
