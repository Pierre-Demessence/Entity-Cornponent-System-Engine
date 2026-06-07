import type { EntityId } from '#entity-id';

import { beforeEach, describe, expect, it } from 'vitest';

import { RenderableDef } from '#modules/render-canvas2d/index';
import { EcsWorld } from '#world';

import {
  currentFrame,
  makeSpriteAnimation,
  makeSpriteAnimationSystem,
  SpriteAnimationDef,
  tickSpriteAnimation,
} from './sprite-animation';

interface Ctx { dtMs: number; world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(SpriteAnimationDef);
  world.registerComponent(RenderableDef);
  return { dtMs: 16, world };
}

describe('makeSpriteAnimation', () => {
  it('starts at frame 0 with zero elapsed', () => {
    const a = makeSpriteAnimation(['a', 'b', 'c'], 10);
    expect(a.currentIndex).toBe(0);
    expect(a.elapsedMs).toBe(0);
    expect(a.fps).toBe(10);
    expect(a.loop).toBe(true);
    expect(a.frames).toEqual(['a', 'b', 'c']);
  });

  it('defaults loop to true', () => {
    expect(makeSpriteAnimation(['a'], 10).loop).toBe(true);
  });

  it('accepts explicit loop false', () => {
    expect(makeSpriteAnimation(['a'], 10, false).loop).toBe(false);
  });
});

describe('tickSpriteAnimation', () => {
  it('advances frame when elapsed exceeds frame duration', () => {
    const a = makeSpriteAnimation(['a', 'b', 'c'], 10); // 100ms per frame
    tickSpriteAnimation(a, 100);
    expect(a.currentIndex).toBe(1);
    expect(a.elapsedMs).toBe(0);
  });

  it('stays on same frame when dtMs is less than frame duration', () => {
    const a = makeSpriteAnimation(['a', 'b'], 10);
    tickSpriteAnimation(a, 50);
    expect(a.currentIndex).toBe(0);
    expect(a.elapsedMs).toBe(50);
  });

  it('accumulates elapsed across multiple calls', () => {
    const a = makeSpriteAnimation(['a', 'b'], 10);
    tickSpriteAnimation(a, 60);
    tickSpriteAnimation(a, 60);
    expect(a.currentIndex).toBe(1);
    expect(a.elapsedMs).toBe(20);
  });

  it('wraps to frame 0 when loop is true', () => {
    const a = makeSpriteAnimation(['a', 'b'], 10, true);
    tickSpriteAnimation(a, 200); // 2 frames
    expect(a.currentIndex).toBe(0);
    expect(a.elapsedMs).toBe(0);
  });

  it('coalesces multiple frame advances in one tick', () => {
    const a = makeSpriteAnimation(['a', 'b', 'c'], 10, true);
    tickSpriteAnimation(a, 500); // 5 frames, wraps around
    // 500ms / 100ms per frame = 5 advances
    // Start: 0 → 1 → 2 → 0 → 1 → 2
    expect(a.currentIndex).toBe(2);
    expect(a.elapsedMs).toBe(0);
  });

  it('latches on last frame when loop is false', () => {
    const a = makeSpriteAnimation(['a', 'b'], 10, false);
    tickSpriteAnimation(a, 300); // 3 frames worth
    expect(a.currentIndex).toBe(1);
    expect(a.elapsedMs).toBe(0);
  });

  it('does nothing for empty frames', () => {
    const a = makeSpriteAnimation([], 10);
    tickSpriteAnimation(a, 100);
    expect(a.currentIndex).toBe(0);
    expect(a.elapsedMs).toBe(0);
  });

  it('handles zero fps without division by zero', () => {
    const a = makeSpriteAnimation(['a', 'b'], 0);
    // frameMs = Infinity, so no frame ever advances
    tickSpriteAnimation(a, 1000);
    expect(a.currentIndex).toBe(0);
  });
});

describe('currentFrame', () => {
  it('returns the frame name at currentIndex', () => {
    const a = makeSpriteAnimation(['a', 'b', 'c'], 10);
    expect(currentFrame(a)).toBe('a');
    tickSpriteAnimation(a, 100);
    expect(currentFrame(a)).toBe('b');
  });

  it('returns empty string for empty frames', () => {
    const a = makeSpriteAnimation([], 10);
    expect(currentFrame(a)).toBe('');
  });
});

describe('spriteAnimationDef', () => {
  it('round-trips through serialize/deserialize', () => {
    const a = makeSpriteAnimation(['walk0', 'walk1', 'walk2'], 8, false);
    tickSpriteAnimation(a, 200); // advance to frame 1+
    const serialized = SpriteAnimationDef.serialize(a);
    const restored = SpriteAnimationDef.deserialize(serialized, 'test');
    expect(restored).toEqual(a);
  });

  it('rejects invalid deserialize input', () => {
    expect(() => SpriteAnimationDef.deserialize(null, 'test')).toThrow();
    expect(() => SpriteAnimationDef.deserialize('nope', 'test')).toThrow();
    expect(() =>
      SpriteAnimationDef.deserialize({ currentIndex: 0, elapsedMs: 0, fps: 10, frames: 'not-array', loop: true }, 'test'),
    ).toThrow();
  });
});

describe('makeSpriteAnimationSystem', () => {
  let ctx: Ctx;
  let eid: EntityId;

  beforeEach(() => {
    ctx = setup();
    eid = ctx.world.createEntity();
    ctx.world.getStore(SpriteAnimationDef).set(eid, makeSpriteAnimation(['a', 'b', 'c'], 10));
    ctx.world.getStore(RenderableDef).set(eid, {
      anchor: 'center',
      atlas: 'test',
      frame: 'initial',
      kind: 'sprite',
    });
  });

  it('advances animation and writes current frame to renderable', () => {
    const sys = makeSpriteAnimationSystem<Ctx>();
    ctx.dtMs = 200; // advance 2 frames
    sys.run(ctx);

    const anim = ctx.world.getStore(SpriteAnimationDef).get(eid)!;
    expect(anim.currentIndex).toBe(2);
    expect(anim.elapsedMs).toBe(0);

    const r = ctx.world.getStore(RenderableDef).get(eid)!;
    expect(r.frame).toBe('c');
  });

  it('preserves non-frame renderable fields', () => {
    const sys = makeSpriteAnimationSystem<Ctx>();
    ctx.dtMs = 100;
    sys.run(ctx);

    const r = ctx.world.getStore(RenderableDef).get(eid)!;
    expect(r.kind).toBe('sprite');
    expect(r.atlas).toBe('test');
    expect(r.anchor).toBe('center');
    expect(r.frame).toBe('b');
  });

  it('skips entities without RenderableDef', () => {
    const noRenderable = ctx.world.createEntity();
    ctx.world.getStore(SpriteAnimationDef).set(noRenderable, makeSpriteAnimation(['x', 'y'], 10));

    const sys = makeSpriteAnimationSystem<Ctx>();
    ctx.dtMs = 100;
    sys.run(ctx);

    // Animation still advances
    const anim = ctx.world.getStore(SpriteAnimationDef).get(noRenderable)!;
    expect(anim.currentIndex).toBe(1);
  });

  it('wraps on loop', () => {
    const sys = makeSpriteAnimationSystem<Ctx>();
    ctx.dtMs = 400; // advance 4 frames, wrap
    sys.run(ctx);

    const r = ctx.world.getStore(RenderableDef).get(eid)!;
    expect(r.frame).toBe('b'); // 0→1→2→0→1 after 4 advances
  });
});
