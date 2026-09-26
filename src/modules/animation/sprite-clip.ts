import type { EntityId } from '#entity-id';
import type { ComponentDef, EcsWorld, SchedulableSystem } from '#index';

import { asBoolean, asNumber, asObject, asString } from '#validation';

import { stepFrameCursor } from './sprite-animation';

/**
 * An immutable, shareable animation clip: an ordered list of atlas frame names
 * cycled at `fps`, looping or latching on the last frame. Unlike the inline
 * `SpriteAnimation`, a clip carries no playback state — that lives per-entity on
 * a {@link SpriteAnimator}, so one clip can drive many entities.
 */
export interface SpriteClip {
  /** Frames per second. */
  fps: number;
  /** Ordered frame names — atlas keys resolved by the renderer. */
  frames: readonly string[];
  /** `true` restarts from frame 0 when the last frame elapses. `false` latches. */
  loop: boolean;
}

/**
 * A registry of named {@link SpriteClip}s shared across entities. Populate it
 * once, then reference clips by key from a {@link SpriteAnimator}. Injected into
 * {@link makeSpriteClipAnimationSystem}, mirroring how the audio system takes a
 * provider.
 */
export class SpriteClipRegistry {
  private readonly clips = new Map<string, SpriteClip>();

  get(name: string): SpriteClip | undefined {
    return this.clips.get(name);
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  /** Register a clip under `name`. Throws on an empty name, non-positive `fps`, or a duplicate key. */
  register(name: string, clip: SpriteClip): this {
    if (name.trim().length === 0)
      throw new Error('SpriteClipRegistry.register: name must not be empty.');
    if (this.clips.has(name))
      throw new Error(`SpriteClipRegistry.register: clip "${name}" is already registered.`);
    if (!Number.isFinite(clip.fps) || clip.fps <= 0)
      throw new Error(`SpriteClipRegistry.register: clip "${name}" fps must be a positive finite number.`);
    this.clips.set(name, clip);
    return this;
  }

  /** Look up a clip, throwing when it is missing. */
  require(name: string): SpriteClip {
    const clip = this.clips.get(name);
    if (clip === undefined)
      throw new Error(`SpriteClipRegistry.require: unknown clip "${name}".`);
    return clip;
  }
}

/**
 * Per-entity playback state for a {@link SpriteClip} selected by `clip` key.
 * Holds only the cursor and play/pause flag; the frames themselves live in the
 * {@link SpriteClipRegistry}.
 */
export interface SpriteAnimator {
  /** The registry key of the clip being played. */
  clip: string;
  /** Mutable: index into the clip's frames of the current frame. */
  currentIndex: number;
  /** Mutable: elapsed time accumulator in ms. */
  elapsedMs: number;
  /** `false` pauses playback; the cursor holds its position. */
  playing: boolean;
}

/** ECS component wrapping a {@link SpriteAnimator} — per-entity clip playback state. */
export const SpriteAnimatorDef: ComponentDef<SpriteAnimator> = {
  name: 'spriteAnimator',
  deserialize(raw, label) {
    const obj = asObject(raw, label);
    const clip = asString(obj.clip, `${label}.clip`);
    if (clip.trim().length === 0)
      throw new Error(`${label}.clip must not be empty.`);
    return {
      clip,
      currentIndex: asNumber(obj.currentIndex, `${label}.currentIndex`),
      elapsedMs: asNumber(obj.elapsedMs, `${label}.elapsedMs`),
      playing: asBoolean(obj.playing, `${label}.playing`),
    };
  },
  serialize(value) {
    return { ...value };
  },
};

/** Create a {@link SpriteAnimator} playing `clip` from frame 0. Defaults to playing. */
export function makeSpriteAnimator(clip: string, playing = true): SpriteAnimator {
  return { clip, currentIndex: 0, elapsedMs: 0, playing };
}

/**
 * Switch `animator` to `clip` and (re)start it from frame 0. A no-op when the
 * animator is already playing that clip, so calling it every tick from input
 * handling does not stutter — pass `restart: true` to force a restart of the
 * clip already playing. This is the supported way to change an animator's clip;
 * to pause or resume in place (keeping the cursor), toggle `animator.playing`.
 */
export function playClip(animator: SpriteAnimator, clip: string, restart = false): void {
  if (!restart && animator.clip === clip && animator.playing)
    return;
  animator.clip = clip;
  animator.currentIndex = 0;
  animator.elapsedMs = 0;
  animator.playing = true;
}

/** Advance `animator` over its `clip` by `dtMs`, mutating it in place. Paused animators do not advance. */
export function tickSpriteAnimator(animator: SpriteAnimator, clip: SpriteClip, dtMs: number): void {
  if (!animator.playing)
    return;
  stepFrameCursor(animator, clip.frames.length, clip.fps, clip.loop, dtMs);
}

/** The frame name at `animator`'s current position within `clip`. */
export function currentAnimatorFrame(animator: SpriteAnimator, clip: SpriteClip): string {
  if (clip.frames.length === 0)
    return '';
  const index = animator.currentIndex < clip.frames.length ? animator.currentIndex : clip.frames.length - 1;
  return clip.frames[index]!;
}

/** The tick-context {@link makeSpriteClipAnimationSystem} reads: `dtMs` and `world`. */
export interface SpriteClipAnimationTickCtx { dtMs: number; world: EcsWorld }

/** Options for {@link makeSpriteClipAnimationSystem}. */
export interface SpriteClipAnimationSystemOptions {
  name?: string;
  animatorDef?: ComponentDef<SpriteAnimator>;
  /** The clip registry animators resolve their `clip` key against. */
  registry: SpriteClipRegistry;
  runAfter?: string[];
  /** Reports an animator whose `clip` key is not in the registry; the entity is skipped that tick. */
  onMissingClip?: (entityId: EntityId, clip: string) => void;
}

/**
 * Build a schedulable system that advances every {@link SpriteAnimatorDef} by
 * resolving its `clip` key in the `registry`, then writes the current frame name
 * into the entity's `RenderableDef` (preserving all other `Renderable` fields).
 *
 * An animator whose clip key is missing from the registry is skipped for that
 * tick and reported to `onMissingClip`. Entities without a `RenderableDef`
 * still advance, but no renderable write occurs.
 */
export function makeSpriteClipAnimationSystem<TCtx extends SpriteClipAnimationTickCtx>(
  options: SpriteClipAnimationSystemOptions,
): SchedulableSystem<TCtx> {
  const { name = 'spriteClipAnimation', animatorDef = SpriteAnimatorDef, onMissingClip, registry, runAfter } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const world = ctx.world;
      const animatorStore = world.getStore(animatorDef);
      const renderableStore = world.getStoreByName('renderable');
      for (const id of animatorStore.keys()) {
        const animator = animatorStore.get(id)!;
        const clip = registry.get(animator.clip);
        if (clip === undefined) {
          onMissingClip?.(id, animator.clip);
          continue;
        }
        tickSpriteAnimator(animator, clip, ctx.dtMs);
        if (renderableStore) {
          const r = renderableStore.get(id);
          if (r) {
            renderableStore.set(id, { ...r, frame: currentAnimatorFrame(animator, clip) });
          }
        }
      }
    },
  };
}
