import { describe, expect, it } from 'vitest';

import { mat4Multiply, mat4TransformPoint, quatFromAxisAngle } from '#modules/math/index';
import { Position3DDef, Rotation3DDef } from '#modules/transform-3d/index';
import { EcsWorld } from '#world';

import {
  camera3DAspect,
  Camera3DDef,
  camera3DProjectionMatrix,
  camera3DViewMatrix,
  camera3DViewProjection,
  getCameraPose,
  makeCamera3D,
} from './camera3d';

const POSE = {
  position: { x: 4, y: 2, z: -3 },
  rotation: quatFromAxisAngle({ x: 1, y: 2, z: 0.5 }, 0.9),
};

describe('makeCamera3D', () => {
  it('fills perspective defaults around the given viewport', () => {
    expect(makeCamera3D({ viewportH: 600, viewportW: 800 })).toEqual({
      far: 1000,
      fovY: Math.PI / 3,
      near: 0.1,
      orthoSize: 5,
      projection: 'perspective',
      viewportH: 600,
      viewportW: 800,
    });
  });

  it('round-trips through the component serializer', () => {
    const cam = makeCamera3D({ projection: 'orthographic', viewportH: 3, viewportW: 4 });
    expect(Camera3DDef.deserialize!(Camera3DDef.serialize!(cam), 'cam')).toEqual(cam);
  });
});

describe('camera3DAspect', () => {
  it('is viewport width over height', () => {
    expect(camera3DAspect(makeCamera3D({ viewportH: 200, viewportW: 500 }))).toBe(2.5);
  });
});

describe('camera3DProjectionMatrix', () => {
  it('maps the orthographic half-height to NDC ±1 at any depth', () => {
    const cam = makeCamera3D({ orthoSize: 4, projection: 'orthographic', viewportH: 100, viewportW: 200 });
    const m = camera3DProjectionMatrix(cam);
    expect(mat4TransformPoint(m, { x: 8, y: 4, z: -1 }).y).toBeCloseTo(1, 9);
    expect(mat4TransformPoint(m, { x: 8, y: 4, z: -50 }).x).toBeCloseTo(1, 9);
  });
});

describe('camera3DViewMatrix', () => {
  it('moves the camera to the origin', () => {
    const origin = mat4TransformPoint(camera3DViewMatrix(POSE), POSE.position);
    expect(Math.hypot(origin.x, origin.y, origin.z)).toBeCloseTo(0, 9);
  });

  it('composes into the view-projection', () => {
    const cam = makeCamera3D({ viewportH: 1, viewportW: 1 });
    const vp = camera3DViewProjection(cam, POSE);
    const expected = mat4Multiply(camera3DProjectionMatrix(cam), camera3DViewMatrix(POSE));
    vp.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 12));
  });
});

describe('getCameraPose', () => {
  it('reads Position3D and Rotation3D as copies', () => {
    const world = new EcsWorld();
    world.registerComponent(Position3DDef);
    world.registerComponent(Rotation3DDef);
    const id = world.createEntity();
    world.getStore(Position3DDef).set(id, { x: 1, y: 2, z: 3 });
    world.getStore(Rotation3DDef).set(id, { w: 0, x: 0, y: 1, z: 0 });
    const pose = getCameraPose(world, id);
    expect(pose).toEqual({ position: { x: 1, y: 2, z: 3 }, rotation: { w: 0, x: 0, y: 1, z: 0 } });
    pose.position.x = 99;
    expect(world.getStore(Position3DDef).get(id)!.x).toBe(1);
  });

  it('falls back to the origin and no rotation, even with Rotation3D unregistered', () => {
    const world = new EcsWorld();
    world.registerComponent(Position3DDef);
    const id = world.createEntity();
    expect(getCameraPose(world, id)).toEqual({ position: { x: 0, y: 0, z: 0 }, rotation: { w: 1, x: 0, y: 0, z: 0 } });
  });
});
