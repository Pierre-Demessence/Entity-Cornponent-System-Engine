import type { EntityId } from '#entity-id';
import type { Renderable } from '#modules/render-canvas2d/index';
import type { SpriteClip } from './sprite-clip';

import { describe, expect, it, vi } from 'vitest';

import { RenderableDef } from '#modules/render-canvas2d/index';
import { EcsWorld } from '#world';

import {
  currentAnimatorFrame,
  makeSpriteAnimator,
  makeSpriteClipAnimationSystem,
  playClip,
  SpriteAnimatorDef,

  SpriteClipRegistry,
  tickSpriteAnimator,
} from './sprite-clip';

interface Ctx { dtMs: number; world: EcsWorld }

const WALK: SpriteClip = { fps: 10, frames: ['a', 'b', 'c'], loop: true };

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(SpriteAnimatorDef);
  world.registerComponent(RenderableDef);
  return { dtMs: 16, world };
}

function asSprite(r: Renderable | undefined) {
  if (r?.kind !== 'sprite')
    throw new Error('expected a sprite renderable');
  return r;
}

describe('spriteClipRegistry', () => {
  it('registers and looks up clips', () => {
    const reg = new SpriteClipRegistry();
    reg.register('walk', WALK);
    expect(reg.has('walk')).toBe(true);
    expect(reg.get('walk')).toBe(WALK);
    expect(reg.require('walk')).toBe(WALK);
  });

  it('returns undefined / false for unknown clips', () => {
    const reg = new SpriteClipRegistry();
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.has('nope')).toBe(false);
  });

  it('require throws for unknown clips', () => {
    const reg = new SpriteClipRegistry();
    expect(() => reg.require('nope')).toThrow(/unknown clip/);
  });

  it('rejects an empty name, duplicate key, or non-positive fps', () => {
    const reg = new SpriteClipRegistry();
    expect(() => reg.register('  ', WALK)).toThrow(/name/);
    reg.register('walk', WALK);
    expect(() => reg.register('walk', WALK)).toThrow(/already registered/);
    expect(() => reg.register('bad', { fps: 0, frames: ['a'], loop: true })).toThrow(/fps/);
  });

  it('rejects non-finite fps', () => {
    const reg = new SpriteClipRegistry();
    expect(() => reg.register('n', { fps: Number.NaN, frames: ['a'], loop: true })).toThrow(/fps/);
    expect(() => reg.register('i', { fps: Infinity, frames: ['a'], loop: true })).toThrow(/fps/);
    expect(() => reg.register('neg', { fps: -5, frames: ['a'], loop: true })).toThrow(/fps/);
  });

  it('is chainable', () => {
    const reg = new SpriteClipRegistry()
      .register('walk', WALK)
      .register('idle', { fps: 4, frames: ['i'], loop: true });
    expect(reg.has('idle')).toBe(true);
  });
});

describe('spriteAnimatorDef', () => {
  it('round-trips through serialize/deserialize', () => {
    const value = makeSpriteAnimator('walk');
    const restored = SpriteAnimatorDef.deserialize(SpriteAnimatorDef.serialize(value), 'spriteAnimator');
    expect(restored).toEqual(value);
  });

  it('rejects an empty clip key', () => {
    expect(() => SpriteAnimatorDef.deserialize(
      { clip: '', currentIndex: 0, elapsedMs: 0, playing: true },
      'spriteAnimator',
    )).toThrow(/clip/);
  });
});

describe('makeSpriteAnimator', () => {
  it('starts at frame 0, playing by default', () => {
    const a = makeSpriteAnimator('walk');
    expect(a).toEqual({ clip: 'walk', currentIndex: 0, elapsedMs: 0, playing: true });
  });

  it('accepts an explicit paused start', () => {
    expect(makeSpriteAnimator('walk', false).playing).toBe(false);
  });
});

describe('playClip', () => {
  it('switches clip and resets the cursor', () => {
    const a = { clip: 'walk', currentIndex: 2, elapsedMs: 40, playing: true };
    playClip(a, 'jump');
    expect(a).toEqual({ clip: 'jump', currentIndex: 0, elapsedMs: 0, playing: true });
  });

  it('is a no-op when already playing the same clip', () => {
    const a = { clip: 'walk', currentIndex: 2, elapsedMs: 40, playing: true };
    playClip(a, 'walk');
    expect(a.currentIndex).toBe(2);
    expect(a.elapsedMs).toBe(40);
  });

  it('restarts a paused animator on the same clip from frame 0', () => {
    const a = { clip: 'walk', currentIndex: 2, elapsedMs: 40, playing: false };
    playClip(a, 'walk');
    expect(a).toEqual({ clip: 'walk', currentIndex: 0, elapsedMs: 0, playing: true });
  });

  it('force-restarts the same clip with restart=true', () => {
    const a = { clip: 'walk', currentIndex: 2, elapsedMs: 40, playing: true };
    playClip(a, 'walk', true);
    expect(a.currentIndex).toBe(0);
    expect(a.elapsedMs).toBe(0);
  });
});

describe('tickSpriteAnimator', () => {
  it('advances a playing animator', () => {
    const a = makeSpriteAnimator('walk'); // 100ms per frame
    tickSpriteAnimator(a, WALK, 100);
    expect(a.currentIndex).toBe(1);
  });

  it('loops back to frame 0 past the last frame', () => {
    const a = { clip: 'walk', currentIndex: 2, elapsedMs: 0, playing: true };
    tickSpriteAnimator(a, WALK, 100);
    expect(a.currentIndex).toBe(0);
  });

  it('latches on the last frame when loop is false', () => {
    const clip: SpriteClip = { fps: 10, frames: ['a', 'b'], loop: false };
    const a = { clip: 'x', currentIndex: 1, elapsedMs: 0, playing: true };
    tickSpriteAnimator(a, clip, 500);
    expect(a.currentIndex).toBe(1);
  });

  it('does not advance a paused animator', () => {
    const a = makeSpriteAnimator('walk', false);
    tickSpriteAnimator(a, WALK, 1000);
    expect(a.currentIndex).toBe(0);
    expect(a.elapsedMs).toBe(0);
  });

  it('self-heals an out-of-range index on a looping clip', () => {
    // Reachable by swapping to a shorter clip via direct assignment (not playClip).
    const a = { clip: 'walk', currentIndex: 9, elapsedMs: 0, playing: true };
    tickSpriteAnimator(a, WALK, 100);
    expect(a.currentIndex).toBe(0);
  });
});

describe('currentAnimatorFrame', () => {
  it('returns the frame at the current index', () => {
    expect(currentAnimatorFrame({ clip: 'walk', currentIndex: 1, elapsedMs: 0, playing: true }, WALK)).toBe('b');
  });

  it('returns empty string for an empty clip', () => {
    expect(currentAnimatorFrame(makeSpriteAnimator('e'), { fps: 10, frames: [], loop: true })).toBe('');
  });

  it('clamps an out-of-range index to the last frame', () => {
    expect(currentAnimatorFrame({ clip: 'walk', currentIndex: 9, elapsedMs: 0, playing: true }, WALK)).toBe('c');
  });

  it('reads a valid frame even when a stale index survives a non-looping tick', () => {
    const clip: SpriteClip = { fps: 10, frames: ['a', 'b'], loop: false };
    const a = { clip: 'x', currentIndex: 5, elapsedMs: 0, playing: true };
    tickSpriteAnimator(a, clip, 100);
    expect(currentAnimatorFrame(a, clip)).toBe('b');
  });
});

describe('makeSpriteClipAnimationSystem', () => {
  it('advances animators and writes the current frame into the renderable', () => {
    const ctx = setup();
    const registry = new SpriteClipRegistry().register('walk', WALK);
    const system = makeSpriteClipAnimationSystem<Ctx>({ registry });

    const id = ctx.world.createEntity();
    ctx.world.getStore(SpriteAnimatorDef).set(id, makeSpriteAnimator('walk'));
    ctx.world.getStore(RenderableDef).set(id, {
      anchor: 'center',
      atlas: 'chars',
      frame: 'a',
      kind: 'sprite',
    });

    ctx.dtMs = 100;
    system.run(ctx);

    expect(asSprite(ctx.world.getStore(RenderableDef).get(id)).frame).toBe('b');
  });

  it('preserves other renderable fields', () => {
    const ctx = setup();
    const registry = new SpriteClipRegistry().register('walk', WALK);
    const system = makeSpriteClipAnimationSystem<Ctx>({ registry });

    const id = ctx.world.createEntity();
    ctx.world.getStore(SpriteAnimatorDef).set(id, makeSpriteAnimator('walk'));
    ctx.world.getStore(RenderableDef).set(id, {
      anchor: 'center',
      atlas: 'chars',
      dh: 32,
      dw: 24,
      frame: 'a',
      kind: 'sprite',
    });

    system.run(ctx);

    const r = asSprite(ctx.world.getStore(RenderableDef).get(id));
    expect(r.atlas).toBe('chars');
    expect(r.dw).toBe(24);
    expect(r.dh).toBe(32);
  });

  it('skips an animator whose clip is missing and reports it', () => {
    const ctx = setup();
    const registry = new SpriteClipRegistry();
    const onMissingClip = vi.fn<(id: EntityId, clip: string) => void>();
    const system = makeSpriteClipAnimationSystem<Ctx>({ onMissingClip, registry });

    const id = ctx.world.createEntity();
    ctx.world.getStore(SpriteAnimatorDef).set(id, makeSpriteAnimator('ghost'));
    ctx.world.getStore(RenderableDef).set(id, {
      anchor: 'center',
      atlas: 'chars',
      frame: 'keep',
      kind: 'sprite',
    });

    system.run(ctx);

    expect(onMissingClip).toHaveBeenCalledWith(id, 'ghost');
    expect(asSprite(ctx.world.getStore(RenderableDef).get(id)).frame).toBe('keep');
  });

  it('advances animators without a renderable', () => {
    const ctx = setup();
    const registry = new SpriteClipRegistry().register('walk', WALK);
    const system = makeSpriteClipAnimationSystem<Ctx>({ registry });

    const id = ctx.world.createEntity();
    ctx.world.getStore(SpriteAnimatorDef).set(id, makeSpriteAnimator('walk'));

    ctx.dtMs = 100;
    expect(() => system.run(ctx)).not.toThrow();
    expect(ctx.world.getStore(SpriteAnimatorDef).get(id)?.currentIndex).toBe(1);
  });

  it('honours a custom animatorDef', () => {
    const ctx = setup();
    const customDef = { ...SpriteAnimatorDef, name: 'customAnimator' };
    ctx.world.registerComponent(customDef);
    const registry = new SpriteClipRegistry().register('walk', WALK);
    const system = makeSpriteClipAnimationSystem<Ctx>({ animatorDef: customDef, registry });

    const id = ctx.world.createEntity();
    ctx.world.getStore(customDef).set(id, makeSpriteAnimator('walk'));

    ctx.dtMs = 100;
    system.run(ctx);
    expect(ctx.world.getStore(customDef).get(id)?.currentIndex).toBe(1);
  });
});
