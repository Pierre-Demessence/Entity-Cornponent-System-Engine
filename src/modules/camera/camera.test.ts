import type { TagDef } from '#index';

import { PositionDef } from '#modules/transform/index';
import { EcsWorld } from '#world';
import { beforeEach, describe, expect, it } from 'vitest';

import { CameraDef, makeFollowCameraSystem, viewToWorld, worldToView } from './camera';

const CameraTag: TagDef = { name: 'camera' };
const FollowTargetTag: TagDef = { name: 'followTarget' };

interface Ctx { world: EcsWorld }

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(CameraDef);
  world.registerTag(CameraTag);
  world.registerTag(FollowTargetTag);
  return { world };
}

describe('cameraDef', () => {
  it('has name "camera" and round-trips through simpleComponent', () => {
    expect(CameraDef.name).toBe('camera');
    const raw = { viewportH: 20, viewportW: 40, x: 10, y: 5 };
    const serialized = CameraDef.serialize(raw);
    const restored = CameraDef.deserialize(serialized, 'camera');
    expect(restored).toEqual(raw);
  });
});

describe('worldToView / viewToWorld', () => {
  const cam = { viewportH: 10, viewportW: 20, x: 100, y: 50 };

  it('maps the camera center to viewport center', () => {
    expect(worldToView(100, 50, cam)).toEqual({ vx: 10, vy: 5 });
  });

  it('maps the viewport top-left to (0, 0)', () => {
    expect(worldToView(90, 45, cam)).toEqual({ vx: 0, vy: 0 });
  });

  it('round-trips world → view → world', () => {
    const { vx, vy } = worldToView(123, 77, cam);
    expect(viewToWorld(vx, vy, cam)).toEqual({ wx: 123, wy: 77 });
  });
});

describe('makeFollowCameraSystem', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
  });

  it('has default name "camera-follow"', () => {
    const sys = makeFollowCameraSystem<Ctx>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      targetTag: FollowTargetTag,
    });
    expect(sys.name).toBe('camera-follow');
  });

  it('propagates custom name and runAfter', () => {
    const sys = makeFollowCameraSystem<Ctx>({
      name: 'cam',
      cameraTag: CameraTag,
      positionDef: PositionDef,
      runAfter: ['motion'],
      targetTag: FollowTargetTag,
    });
    expect(sys.name).toBe('cam');
    expect(sys.runAfter).toEqual(['motion']);
  });

  it('centers camera on the tagged target position', () => {
    const sys = makeFollowCameraSystem<Ctx>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      targetTag: FollowTargetTag,
    });

    const targetId = ctx.world.createEntity();
    ctx.world.getStore(PositionDef).set(targetId, { x: 42, y: 17 });
    ctx.world.getTag(FollowTargetTag).add(targetId);

    const cameraId = ctx.world.createEntity();
    ctx.world.getStore(CameraDef).set(cameraId, {
      viewportH: 10,
      viewportW: 20,
      x: 0,
      y: 0,
    });
    ctx.world.getTag(CameraTag).add(cameraId);

    sys.run(ctx);

    expect(ctx.world.getStore(CameraDef).get(cameraId)).toEqual({
      viewportH: 10,
      viewportW: 20,
      x: 42,
      y: 17,
    });
  });

  it('is a no-op when no target is tagged', () => {
    const sys = makeFollowCameraSystem<Ctx>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      targetTag: FollowTargetTag,
    });

    const cameraId = ctx.world.createEntity();
    const initial = { viewportH: 10, viewportW: 20, x: 99, y: 99 };
    ctx.world.getStore(CameraDef).set(cameraId, { ...initial });
    ctx.world.getTag(CameraTag).add(cameraId);

    sys.run(ctx);

    expect(ctx.world.getStore(CameraDef).get(cameraId)).toEqual(initial);
  });

  it('is a no-op when the tagged target has no position', () => {
    const sys = makeFollowCameraSystem<Ctx>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      targetTag: FollowTargetTag,
    });

    const targetId = ctx.world.createEntity();
    ctx.world.getTag(FollowTargetTag).add(targetId);

    const cameraId = ctx.world.createEntity();
    const initial = { viewportH: 10, viewportW: 20, x: 7, y: 7 };
    ctx.world.getStore(CameraDef).set(cameraId, { ...initial });
    ctx.world.getTag(CameraTag).add(cameraId);

    sys.run(ctx);

    expect(ctx.world.getStore(CameraDef).get(cameraId)).toEqual(initial);
  });

  it('follows the target as it moves across ticks', () => {
    const sys = makeFollowCameraSystem<Ctx>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      targetTag: FollowTargetTag,
    });

    const targetId = ctx.world.createEntity();
    const targetPos = { x: 0, y: 0 };
    ctx.world.getStore(PositionDef).set(targetId, targetPos);
    ctx.world.getTag(FollowTargetTag).add(targetId);

    const cameraId = ctx.world.createEntity();
    ctx.world.getStore(CameraDef).set(cameraId, {
      viewportH: 10,
      viewportW: 20,
      x: 0,
      y: 0,
    });
    ctx.world.getTag(CameraTag).add(cameraId);

    sys.run(ctx);
    expect(ctx.world.getStore(CameraDef).get(cameraId)).toMatchObject({ x: 0, y: 0 });

    targetPos.x = 5;
    targetPos.y = -3;
    sys.run(ctx);
    expect(ctx.world.getStore(CameraDef).get(cameraId)).toMatchObject({ x: 5, y: -3 });
  });

  it('updates every camera entity when multiple are tagged', () => {
    const sys = makeFollowCameraSystem<Ctx>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      targetTag: FollowTargetTag,
    });

    const targetId = ctx.world.createEntity();
    ctx.world.getStore(PositionDef).set(targetId, { x: 11, y: 22 });
    ctx.world.getTag(FollowTargetTag).add(targetId);

    const camA = ctx.world.createEntity();
    const camB = ctx.world.createEntity();
    ctx.world.getStore(CameraDef).set(camA, { viewportH: 10, viewportW: 20, x: 0, y: 0 });
    ctx.world.getStore(CameraDef).set(camB, { viewportH: 8, viewportW: 16, x: 0, y: 0 });
    ctx.world.getTag(CameraTag).add(camA);
    ctx.world.getTag(CameraTag).add(camB);

    sys.run(ctx);

    expect(ctx.world.getStore(CameraDef).get(camA)).toMatchObject({ x: 11, y: 22 });
    expect(ctx.world.getStore(CameraDef).get(camB)).toMatchObject({ x: 11, y: 22 });
  });
});
