import type { TagDef } from '#index';

import { beforeEach, describe, expect, it } from 'vitest';

import { PositionDef } from '#modules/transform/index';
import { EcsWorld } from '#world';

import {
  CAMERA_NO_LIMIT,
  CameraDef,
  cameraToView,
  cameraViewRect,
  clampCameraToLimits,
  makeCamera,
  makeFollowCameraSystem,
  viewToWorld,
  worldToView,
} from './camera';

const CameraTag: TagDef = { name: 'cameraEntity' };
const FollowTargetTag: TagDef = { name: 'followTarget' };

interface Ctx { dtMs?: number; world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(CameraDef);
  world.registerTag(CameraTag);
  world.registerTag(FollowTargetTag);
  return { world };
}

describe('makeCamera', () => {
  it('fills canonical defaults (zoom 1, no offset, no limits)', () => {
    expect(makeCamera({ viewportH: 10, viewportW: 20, x: 1, y: 2 })).toEqual({
      limitBottom: CAMERA_NO_LIMIT,
      limitLeft: -CAMERA_NO_LIMIT,
      limitRight: CAMERA_NO_LIMIT,
      limitTop: -CAMERA_NO_LIMIT,
      offsetX: 0,
      offsetY: 0,
      viewportH: 10,
      viewportW: 20,
      x: 1,
      y: 2,
      zoom: 1,
    });
  });

  it('keeps explicit overrides', () => {
    const cam = makeCamera({ limitLeft: 0, offsetX: 4, viewportH: 10, viewportW: 20, x: 0, y: 0, zoom: 2 });
    expect(cam.zoom).toBe(2);
    expect(cam.offsetX).toBe(4);
    expect(cam.limitLeft).toBe(0);
  });
});

describe('cameraDef', () => {
  it('has name "camera" and round-trips through simpleComponent', () => {
    expect(CameraDef.name).toBe('camera');
    const raw = makeCamera({ viewportH: 20, viewportW: 40, x: 10, y: 5 });
    expect(CameraDef.deserialize(CameraDef.serialize(raw), 'camera')).toEqual(raw);
  });
});

describe('worldToView / viewToWorld', () => {
  it('maps the camera centre to the viewport centre (zoom 1)', () => {
    const cam = makeCamera({ viewportH: 10, viewportW: 20, x: 100, y: 50 });
    expect(worldToView(100, 50, cam)).toEqual({ vx: 10, vy: 5 });
    expect(worldToView(90, 45, cam)).toEqual({ vx: 0, vy: 0 });
  });

  it('scales the screen offset by zoom', () => {
    const cam = makeCamera({ viewportH: 10, viewportW: 20, x: 100, y: 50, zoom: 2 });
    expect(worldToView(100, 50, cam)).toEqual({ vx: 10, vy: 5 });
    expect(worldToView(101, 50, cam)).toEqual({ vx: 12, vy: 5 });
  });

  it('shifts the view by offset', () => {
    const cam = makeCamera({ offsetX: 5, viewportH: 10, viewportW: 20, x: 0, y: 0 });
    expect(worldToView(5, 0, cam)).toEqual({ vx: 10, vy: 5 });
  });

  it('round-trips world → view → world under zoom and offset together', () => {
    const cam = makeCamera({ offsetX: 7, offsetY: -4, viewportH: 10, viewportW: 20, x: 100, y: 50, zoom: 2.5 });
    const { vx, vy } = worldToView(123, 77, cam);
    const { wx, wy } = viewToWorld(vx, vy, cam);
    expect(wx).toBeCloseTo(123, 10);
    expect(wy).toBeCloseTo(77, 10);
  });
});

describe('cameraViewRect / cameraToView', () => {
  it('reports the world rect the camera sees (zoom shrinks it)', () => {
    const cam = makeCamera({ viewportH: 10, viewportW: 20, x: 100, y: 50, zoom: 2 });
    expect(cameraViewRect(cam)).toEqual({ h: 5, w: 10, x: 95, y: 47.5 });
  });

  it('exposes the renderer view transform', () => {
    const cam = makeCamera({ viewportH: 10, viewportW: 20, x: 100, y: 50, zoom: 2 });
    expect(cameraToView(cam)).toEqual({ x: 95, y: 47.5, zoom: 2 });
  });
});

describe('clampCameraToLimits', () => {
  it('keeps the view inside the limit rect', () => {
    const cam = makeCamera({ limitBottom: 100, limitLeft: 0, limitRight: 100, limitTop: 0, viewportH: 10, viewportW: 20, x: -50, y: 200 });
    clampCameraToLimits(cam);
    expect(cam.x).toBe(10);
    expect(cam.y).toBe(95);
  });

  it('leaves an in-bounds camera untouched', () => {
    const cam = makeCamera({ limitBottom: 100, limitLeft: 0, limitRight: 100, limitTop: 0, viewportH: 10, viewportW: 20, x: 50, y: 50 });
    clampCameraToLimits(cam);
    expect(cam.x).toBe(50);
    expect(cam.y).toBe(50);
  });

  it('centres on the midpoint when the limit span is narrower than the view', () => {
    const cam = makeCamera({ limitBottom: 100, limitLeft: 0, limitRight: 15, limitTop: 0, viewportH: 10, viewportW: 20, x: 0, y: 50 });
    clampCameraToLimits(cam);
    expect(cam.x).toBe(7.5);
  });

  it('does nothing under the default (no) limits', () => {
    const cam = makeCamera({ viewportH: 10, viewportW: 20, x: 12345, y: -678 });
    clampCameraToLimits(cam);
    expect(cam.x).toBe(12345);
    expect(cam.y).toBe(-678);
  });

  it('accounts for offset and zoom together', () => {
    // zoom 2 → halfW = 20/2/2 = 5; offsetX 3 → minX = 0 + 5 − 3 = 2.
    const cam = makeCamera({ limitBottom: 100, limitLeft: 0, limitRight: 100, limitTop: 0, offsetX: 3, viewportH: 10, viewportW: 20, x: -50, y: 50, zoom: 2 });
    clampCameraToLimits(cam);
    expect(cam.x).toBe(2);
  });
});

describe('makeFollowCameraSystem', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  function addTarget(x: number, y: number): number {
    const id = ctx.world.createEntity();
    ctx.world.getStore(PositionDef).set(id, { x, y });
    ctx.world.getTag(FollowTargetTag).add(id);
    return id;
  }

  function addCamera(opts: Parameters<typeof makeCamera>[0]): number {
    const id = ctx.world.createEntity();
    ctx.world.getStore(CameraDef).set(id, makeCamera(opts));
    ctx.world.getTag(CameraTag).add(id);
    return id;
  }

  function follow(extra?: Partial<Parameters<typeof makeFollowCameraSystem<Ctx>>[0]>) {
    return makeFollowCameraSystem<Ctx>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      targetTag: FollowTargetTag,
      ...extra,
    });
  }

  it('defaults name to "camera-follow" and propagates name/runAfter', () => {
    expect(follow().name).toBe('camera-follow');
    const sys = follow({ name: 'cam', runAfter: ['motion'] });
    expect(sys.name).toBe('cam');
    expect(sys.runAfter).toEqual(['motion']);
  });

  it('centres the camera on the tagged target', () => {
    addTarget(42, 17);
    const id = addCamera({ viewportH: 10, viewportW: 20, x: 0, y: 0 });
    follow().run(ctx);
    expect(ctx.world.getStore(CameraDef).get(id)).toMatchObject({ x: 42, y: 17 });
  });

  it('is a no-op when no target is tagged', () => {
    const id = addCamera({ viewportH: 10, viewportW: 20, x: 99, y: 99 });
    follow().run(ctx);
    expect(ctx.world.getStore(CameraDef).get(id)).toMatchObject({ x: 99, y: 99 });
  });

  it('is a no-op when the tagged target has no position', () => {
    const tid = ctx.world.createEntity();
    ctx.world.getTag(FollowTargetTag).add(tid);
    const id = addCamera({ viewportH: 10, viewportW: 20, x: 7, y: 7 });
    follow().run(ctx);
    expect(ctx.world.getStore(CameraDef).get(id)).toMatchObject({ x: 7, y: 7 });
  });

  it('updates every tagged camera', () => {
    addTarget(11, 22);
    const a = addCamera({ viewportH: 10, viewportW: 20, x: 0, y: 0 });
    const b = addCamera({ viewportH: 8, viewportW: 16, x: 0, y: 0 });
    follow().run(ctx);
    expect(ctx.world.getStore(CameraDef).get(a)).toMatchObject({ x: 11, y: 22 });
    expect(ctx.world.getStore(CameraDef).get(b)).toMatchObject({ x: 11, y: 22 });
  });

  it('clamps to limits after following', () => {
    addTarget(1000, 1000);
    const id = addCamera({ limitBottom: 100, limitLeft: 0, limitRight: 100, limitTop: 0, viewportH: 10, viewportW: 20, x: 0, y: 0 });
    follow().run(ctx);
    expect(ctx.world.getStore(CameraDef).get(id)).toMatchObject({ x: 90, y: 95 });
  });

  it('eases toward the target with smoothing (needs dtMs)', () => {
    addTarget(100, 0);
    const id = addCamera({ viewportH: 10, viewportW: 20, x: 0, y: 0 });
    ctx.dtMs = 100;
    follow({ smoothing: 10 }).run(ctx);
    // t = 1 − e^(−10·0.1) = 1 − e^(−1) ≈ 0.6321.
    expect(ctx.world.getStore(CameraDef).get(id)!.x).toBeCloseTo(63.21, 1);
  });

  it('snaps when smoothing is set but dtMs is absent', () => {
    addTarget(100, 0);
    const id = addCamera({ viewportH: 10, viewportW: 20, x: 0, y: 0 });
    follow({ smoothing: 10 }).run(ctx);
    expect(ctx.world.getStore(CameraDef).get(id)).toMatchObject({ x: 100, y: 0 });
  });

  it('holds still inside the deadzone, chases past it', () => {
    const targetId = addTarget(5, 0);
    const id = addCamera({ viewportH: 10, viewportW: 20, x: 0, y: 0 });
    const sys = follow({ deadzoneW: 10 });
    sys.run(ctx);
    expect(ctx.world.getStore(CameraDef).get(id)).toMatchObject({ x: 0 });
    ctx.world.getStore(PositionDef).set(targetId, { x: 15, y: 0 });
    sys.run(ctx);
    expect(ctx.world.getStore(CameraDef).get(id)).toMatchObject({ x: 5 });
  });
});
