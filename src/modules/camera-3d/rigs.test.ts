import type { EntityId, TagDef } from '#index';
import type { Quat, Vec3 } from '#modules/math/index';

import { beforeEach, describe, expect, it } from 'vitest';

import { quatForward, quatFromAxisAngle, quatRotate, vec3Distance } from '#modules/math/index';
import { Position3DDef, Rotation3DDef } from '#modules/transform-3d/index';
import { EcsWorld } from '#world';

import {
  addLookDelta,
  addOrbitZoom,
  CAMERA_RIG_MAX_PITCH,
  chasePose,
  ChaseRigDef,
  dampPose,
  firstPersonForward,
  FirstPersonRigDef,
  firstPersonRotation,
  makeCameraRigSystem,
  makeChaseRig,
  makeFirstPersonRig,
  makeOrbitRig,
  orbitPose,
  OrbitRigDef,
  smoothingBlend,
} from './rigs';

function expectVec(actual: Vec3, expected: Vec3, digits = 9): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

// Same rotation when q and -q agree.
function expectSameRotation(actual: Quat, expected: Quat, digits = 9): void {
  const sign = Math.sign(actual.w * expected.w + actual.x * expected.x + actual.y * expected.y + actual.z * expected.z) || 1;
  expect(actual.w * sign).toBeCloseTo(expected.w, digits);
  expect(actual.x * sign).toBeCloseTo(expected.x, digits);
  expect(actual.y * sign).toBeCloseTo(expected.y, digits);
  expect(actual.z * sign).toBeCloseTo(expected.z, digits);
}

describe('firstPersonRotation', () => {
  it('matches three.js Euler(pitch, yaw, 0, "YXZ")', () => {
    const yaw = 0.8;
    const pitch = -0.3;
    // three.js Quaternion.setFromEuler, YXZ branch, with z = 0.
    const c1 = Math.cos(pitch / 2);
    const s1 = Math.sin(pitch / 2);
    const c2 = Math.cos(yaw / 2);
    const s2 = Math.sin(yaw / 2);
    expectSameRotation(firstPersonRotation(yaw, pitch), { w: c1 * c2, x: s1 * c2, y: c1 * s2, z: -s1 * s2 });
  });

  it('looks down -Z at rest, turns left with positive yaw, looks up with positive pitch', () => {
    expectVec(firstPersonForward(0, 0), { x: 0, y: 0, z: -1 });
    expect(firstPersonForward(0.5, 0).x).toBeLessThan(0);
    expect(firstPersonForward(0, 0.5).y).toBeGreaterThan(0);
  });

  it('agrees with the closed-form yaw / pitch forward vector', () => {
    for (const [yaw, pitch] of [[0.3, 0.2], [-2, -1.1], [3, 0.9]] as const) {
      const cp = Math.cos(pitch);
      expectVec(firstPersonForward(yaw, pitch), { x: -cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) });
    }
  });
});

describe('addLookDelta and addOrbitZoom', () => {
  it('turns right for a rightward pointer, tilts down for a downward one, and clamps pitch', () => {
    const rig = makeFirstPersonRig();
    addLookDelta(rig, 0.2, 0.1);
    expect(rig.yaw).toBeCloseTo(-0.2, 12);
    expect(rig.pitch).toBeCloseTo(-0.1, 12);
    addLookDelta(rig, 0, 100);
    expect(rig.pitch).toBe(-CAMERA_RIG_MAX_PITCH);
    addLookDelta(rig, 0, -100);
    expect(rig.pitch).toBe(CAMERA_RIG_MAX_PITCH);
  });

  it('clamps orbit distance to its limits', () => {
    const rig = makeOrbitRig({ distance: 5, maxDistance: 8, minDistance: 2 });
    addOrbitZoom(rig, 10);
    expect(rig.distance).toBe(8);
    addOrbitZoom(rig, -10);
    expect(rig.distance).toBe(2);
  });
});

describe('orbitPose', () => {
  const target = { x: 1, y: 2, z: 3 };

  it('keeps its distance and looks at the target', () => {
    const pose = orbitPose(target, 1.2, -0.4, 6);
    expect(vec3Distance(pose.position, target)).toBeCloseTo(6, 9);
    const f = quatForward(pose.rotation);
    expectVec({ x: pose.position.x + f.x * 6, y: pose.position.y + f.y * 6, z: pose.position.z + f.z * 6 }, target);
  });

  it('sits on +Z at rest, and above the target for a negative pitch', () => {
    expectVec(orbitPose(target, 0, 0, 4).position, { x: 1, y: 2, z: 7 });
    expect(orbitPose(target, 0, -0.5, 4).position.y).toBeGreaterThan(2);
  });
});

describe('chasePose', () => {
  it('places the camera in the target frame and shares its roll', () => {
    const roll = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    const pose = chasePose({ x: 10, y: 0, z: 0 }, roll, { x: 0, y: 2, z: 8 });
    // Rolled a quarter turn about Z, target-local up is world -X.
    expectVec(pose.position, { x: 8, y: 0, z: 8 });
    expectVec(quatRotate(pose.rotation, { x: 0, y: 1, z: 0 }), { x: -1, y: 0, z: 0 });
  });
});

describe('smoothingBlend and dampPose', () => {
  it('snaps for zero smoothing or zero dt', () => {
    expect(smoothingBlend(0, 16)).toBe(1);
    expect(smoothingBlend(5, 0)).toBe(1);
  });

  it('is frame-rate independent: two 16 ms steps equal one 32 ms step', () => {
    const start = { position: { x: 0, y: 0, z: 0 }, rotation: { w: 1, x: 0, y: 0, z: 0 } };
    const goal = { position: { x: 10, y: -4, z: 2 }, rotation: quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 2) };
    const smoothing = { position: 6, rotation: 3 };
    const twoSteps = dampPose(dampPose(start, goal, smoothing, 16), goal, smoothing, 16);
    const oneStep = dampPose(start, goal, smoothing, 32);
    expectVec(twoSteps.position, oneStep.position);
    expectSameRotation(twoSteps.rotation, oneStep.rotation);
  });
});

describe('makeCameraRigSystem', () => {
  const CameraTag: TagDef = { name: 'cameraEntity' };
  const TargetTag: TagDef = { name: 'rigTarget' };
  let world: EcsWorld;
  let cameraId: EntityId;
  let targetId: EntityId;

  beforeEach(() => {
    world = new EcsWorld();
    world.registerComponent(Position3DDef);
    world.registerComponent(Rotation3DDef);
    world.registerComponent(FirstPersonRigDef);
    world.registerComponent(OrbitRigDef);
    world.registerComponent(ChaseRigDef);
    world.registerTag(CameraTag);
    world.registerTag(TargetTag);
    cameraId = world.createEntity();
    world.getTag(CameraTag).add(cameraId);
    targetId = world.createEntity();
    world.getTag(TargetTag).add(targetId);
    world.getStore(Position3DDef).set(targetId, { x: 5, y: 1, z: -2 });
  });

  const system = makeCameraRigSystem({ cameraTag: CameraTag, targetTag: TargetTag });
  const pose = (): { position: Vec3; rotation: Quat } => ({
    position: world.getStore(Position3DDef).get(cameraId)!,
    rotation: world.getStore(Rotation3DDef).get(cameraId)!,
  });

  it('poses a first-person camera at the eye, clamping pitch without writing it back', () => {
    world.getStore(FirstPersonRigDef).set(cameraId, makeFirstPersonRig({ eyeHeight: 1.5, pitch: 5, yaw: 0.4 }));
    system.run({ world });
    expectVec(pose().position, { x: 5, y: 2.5, z: -2 });
    expectSameRotation(pose().rotation, firstPersonRotation(0.4, CAMERA_RIG_MAX_PITCH));
    expect(world.getStore(FirstPersonRigDef).get(cameraId)!.pitch).toBe(5);
  });

  it('snaps an orbit camera on its first tick, then eases toward the target with dtMs', () => {
    world.getStore(OrbitRigDef).set(cameraId, makeOrbitRig({ distance: 4, smoothing: 5, targetOffsetY: 1 }));
    system.run({ dtMs: 16, world });
    expectVec(pose().position, { x: 5, y: 2, z: 2 });
    world.getStore(Position3DDef).set(targetId, { x: 15, y: 1, z: -2 });
    system.run({ dtMs: 16, world });
    const x = pose().position.x;
    expect(x).toBeGreaterThan(5);
    expect(x).toBeLessThan(15);
    // Always faces the focus point, even mid-ease.
    const f = quatForward(pose().rotation);
    const to = { x: 15 - x, y: 2 - pose().position.y, z: -2 - pose().position.z };
    const len = Math.hypot(to.x, to.y, to.z);
    expectVec(f, { x: to.x / len, y: to.y / len, z: to.z / len });
  });

  it('follows the target rotation with a chase rig', () => {
    world.getStore(Rotation3DDef).set(targetId, quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2));
    world.getStore(ChaseRigDef).set(cameraId, makeChaseRig({ offsetY: 0, offsetZ: 3 }));
    system.run({ world });
    // Turned a quarter left, target-local +Z (behind) is world +X.
    expectVec(pose().position, { x: 8, y: 1, z: -2 });
    expectSameRotation(pose().rotation, quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2));
  });

  it('does nothing without a target, or for a camera without a rig', () => {
    world.getTag(TargetTag).delete(targetId);
    world.getStore(FirstPersonRigDef).set(cameraId, makeFirstPersonRig());
    system.run({ world });
    expect(world.getStore(Position3DDef).has(cameraId)).toBe(false);
    world.getTag(TargetTag).add(targetId);
    world.getStore(FirstPersonRigDef).delete(cameraId);
    system.run({ world });
    expect(world.getStore(Position3DDef).has(cameraId)).toBe(false);
  });

  it('throws when a camera carries two rigs', () => {
    world.getStore(FirstPersonRigDef).set(cameraId, makeFirstPersonRig());
    world.getStore(OrbitRigDef).set(cameraId, makeOrbitRig());
    expect(() => system.run({ world })).toThrow(/2 rig components/);
  });

  it('works in a world that registers only the rig it uses', () => {
    const lean = new EcsWorld();
    lean.registerComponent(Position3DDef);
    lean.registerComponent(Rotation3DDef);
    lean.registerComponent(OrbitRigDef);
    lean.registerTag(CameraTag);
    lean.registerTag(TargetTag);
    const cam = lean.createEntity();
    lean.getTag(CameraTag).add(cam);
    lean.getStore(OrbitRigDef).set(cam, makeOrbitRig({ distance: 2 }));
    const target = lean.createEntity();
    lean.getTag(TargetTag).add(target);
    lean.getStore(Position3DDef).set(target, { x: 0, y: 0, z: 0 });
    system.run({ world: lean });
    expectVec(lean.getStore(Position3DDef).get(cam)!, { x: 0, y: 0, z: 2 });
  });
});
