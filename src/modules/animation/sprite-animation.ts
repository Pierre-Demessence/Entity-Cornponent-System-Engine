/**
 * The `SpriteAnimation` value primitive — cycles through an ordered list of
 * atlas frame names at a given FPS. Embeddable as an ECS component (see
 * {@link SpriteAnimationDef}) or used standalone via the pure functions
 * {@link tickSpriteAnimation} / {@link currentFrame}.
 *
 * Follows the `Cooldown` / `Lifetime` pattern: a flat-primitive value type,
 * an ECS component def, and a system that auto-advances the animation and
 * writes the current frame name into the entity's `RenderableDef`.
 *
 * Canon: Godot `AnimatedSprite2D`, Unity `Animator` / `Animation` clips,
 * Phaser `sprite.anims`, PixiJS `AnimatedSprite`, Bevy `bevy_animation`.
 */
import type { ComponentDef, EcsWorld, SchedulableSystem } from '#index';

import { asArray, asBoolean, asNumber, asObject, asString } from '#validation';

/** Ordered frame names (atlas frame keys) cycled at `fps` frames per second. */
export interface SpriteAnimation {
  /** Mutable: index into `frames` of the current frame. */
  currentIndex: number;
  /** Mutable: elapsed time accumulator in ms. */
  elapsedMs: number;
  /** Frames per second. */
  fps: number;
  /** Ordered frame names — atlas keys resolved by `SpriteFrameSource`. */
  frames: string[];
  /** `true` restarts from frame 0 when the last frame elapses. `false` latches. */
  loop: boolean;
}

export const SpriteAnimationDef: ComponentDef<SpriteAnimation> = {
  name: 'spriteAnimation',
  deserialize(raw, label) {
    const obj = asObject(raw, label);
    return {
      currentIndex: asNumber(obj.currentIndex, `${label}.currentIndex`),
      elapsedMs: asNumber(obj.elapsedMs, `${label}.elapsedMs`),
      fps: asNumber(obj.fps, `${label}.fps`),
      loop: asBoolean(obj.loop, `${label}.loop`),
      frames: asArray(obj.frames, `${label}.frames`).map((f, i) =>
        asString(f, `${label}.frames[${i}]`),
      ),
    };
  },
  serialize(value) {
    return { ...value };
  },
};

/**
 * Create a {@link SpriteAnimation} that cycles through `frames` at `fps`.
 * Starts at frame 0. Defaults to `loop = true`.
 */
export function makeSpriteAnimation(
  frames: string[],
  fps: number,
  loop = true,
): SpriteAnimation {
  return { currentIndex: 0, elapsedMs: 0, fps, frames, loop };
}

/** Advance the animation by `dtMs`, mutating it in place. */
export function tickSpriteAnimation(
  anim: SpriteAnimation,
  dtMs: number,
): void {
  if (anim.frames.length === 0)
    return;
  anim.elapsedMs += dtMs;
  const frameMs = 1000 / anim.fps;
  while (anim.elapsedMs >= frameMs) {
    anim.elapsedMs -= frameMs;
    if (anim.currentIndex < anim.frames.length - 1) {
      anim.currentIndex++;
    }
    else if (anim.loop) {
      anim.currentIndex = 0;
    }
    else {
      anim.elapsedMs = 0;
      break;
    }
  }
}

/** The frame name at the animation's current position. */
export function currentFrame(anim: SpriteAnimation): string {
  if (anim.frames.length === 0)
    return '';
  return anim.frames[anim.currentIndex]!;
}

export interface SpriteAnimationTickCtx { dtMs: number; world: EcsWorld }

export interface SpriteAnimationSystemOptions {
  name?: string;
  runAfter?: string[];
}

/**
 * Build a schedulable system that advances every {@link SpriteAnimationDef}
 * and writes the current frame name into the entity's `RenderableDef`.
 *
 * The system preserves all other `Renderable` fields — it only mutates
 * `frame`. Entities without a `RenderableDef` are skipped (the animation
 * still advances, but no renderable write occurs).
 */
export function makeSpriteAnimationSystem<
  TCtx extends SpriteAnimationTickCtx,
>(
  options: SpriteAnimationSystemOptions = {},
): SchedulableSystem<TCtx> {
  const { name = 'spriteAnimation', runAfter } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const world = ctx.world;
      const animStore = world.getStore(SpriteAnimationDef);
      const renderableStore = world.getStoreByName('renderable');
      for (const id of animStore.keys()) {
        const anim = animStore.get(id)!;
        tickSpriteAnimation(anim, ctx.dtMs);
        if (renderableStore) {
          const r = renderableStore.get(id);
          if (r) {
            renderableStore.set(id, { ...r, frame: currentFrame(anim) });
          }
        }
      }
    },
  };
}
