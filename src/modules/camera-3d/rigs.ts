import type { ComponentDef, EcsWorld, EntityId, SchedulableSystem, TagDef } from '#index';
import type { Quat, Vec3 } from '../math';
import type { CameraPose } from './camera3d';

import { simpleComponent } from '#index';

import {
  clamp,
  quatForward,
  quatFromAxisAngle,
  quatLookRotation,
  quatMul,
  quatRotate,
  quatSlerp,
  vec3Add,
  vec3Lerp,
  vec3Sub,
} from '../math';
import { Position3DDef, Rotation3DDef } from '../transform-3d';
import { getCameraPose } from './camera3d';

const AXIS_X = { x: 1, y: 0, z: 0 };
const AXIS_Y = { x: 0, y: 1, z: 0 };

/** Default pitch limit for the look rigs: just short of straight up / down, where yaw loses meaning. */
export const CAMERA_RIG_MAX_PITCH = Math.PI / 2 - 0.01;

/**
 * The orientation of a yaw-then-pitch look: turn `yaw` radians about world `+Y`,
 * then tilt `pitch` radians about the turned `+X` — Euler order `YXZ`, no roll.
 * `(0, 0)` looks down `-Z`; positive yaw turns left, positive pitch looks up.
 */
export function firstPersonRotation(yaw: number, pitch: number): Quat {
  return quatMul(quatFromAxisAngle(AXIS_Y, yaw), quatFromAxisAngle(AXIS_X, pitch));
}

/** The unit direction a yaw / pitch look faces — `quatForward(firstPersonRotation(yaw, pitch))`. */
export function firstPersonForward(yaw: number, pitch: number): Vec3 {
  return quatForward(firstPersonRotation(yaw, pitch));
}

/**
 * A camera `distance` away from `target`, looking at it from the yaw / pitch
 * direction: at `(0, 0)` it sits on `+Z` of the target looking down `-Z`, and a
 * negative pitch raises it to look down on the target.
 */
export function orbitPose(target: Vec3, yaw: number, pitch: number, distance: number): CameraPose {
  const rotation = firstPersonRotation(yaw, pitch);
  return { position: vec3Add(target, quatRotate(rotation, { x: 0, y: 0, z: distance })), rotation };
}

/**
 * A camera fixed in the target's own frame: `offset` is in target-local axes
 * (`+Y` up, `+Z` behind a target facing `-Z`), and the camera shares the
 * target's rotation — so it banks and pitches with it.
 */
export function chasePose(targetPosition: Vec3, targetRotation: Quat, offset: Vec3): CameraPose {
  return {
    position: vec3Add(targetPosition, quatRotate(targetRotation, offset)),
    rotation: { ...targetRotation },
  };
}

/**
 * The exponential-smoothing blend for one step: `1 − e^(−smoothing · dt)`.
 * Frame-rate independent — two 16 ms steps land where one 32 ms step does. A
 * `smoothing` of `0` (or less) or a zero `dtMs` means snap (`1`).
 */
export function smoothingBlend(smoothing: number, dtMs: number): number {
  if (smoothing <= 0 || dtMs <= 0)
    return 1;
  return 1 - Math.exp(-smoothing * dtMs / 1000);
}

/** Per-second smoothing speeds for {@link dampPose}; `0` snaps that channel. */
export interface PoseSmoothing {
  position: number;
  rotation: number;
}

/**
 * Ease `current` toward `desired`: position by lerp, rotation by slerp, each
 * with its own per-second `smoothing` (see {@link smoothingBlend}).
 */
export function dampPose(current: CameraPose, desired: CameraPose, smoothing: PoseSmoothing, dtMs: number): CameraPose {
  return {
    position: vec3Lerp(current.position, desired.position, smoothingBlend(smoothing.position, dtMs)),
    rotation: quatSlerp(current.rotation, desired.rotation, smoothingBlend(smoothing.rotation, dtMs)),
  };
}

/** First-person rig state: the camera sits `eyeHeight` above the target and looks by yaw / pitch. */
export interface FirstPersonRig {
  eyeHeight: number;
  maxPitch: number;
  minPitch: number;
  pitch: number;
  yaw: number;
}

/** The {@link FirstPersonRig} component; serializes under `'firstPersonRig'`. */
export const FirstPersonRigDef: ComponentDef<FirstPersonRig> = simpleComponent<FirstPersonRig>('firstPersonRig', {
  eyeHeight: 'number',
  maxPitch: 'number',
  minPitch: 'number',
  pitch: 'number',
  yaw: 'number',
});

/** Create a {@link FirstPersonRig}. Defaults: level look, eye at the target, pitch limited to ±{@link CAMERA_RIG_MAX_PITCH}. */
export function makeFirstPersonRig(options: Partial<FirstPersonRig> = {}): FirstPersonRig {
  return {
    eyeHeight: options.eyeHeight ?? 0,
    maxPitch: options.maxPitch ?? CAMERA_RIG_MAX_PITCH,
    minPitch: options.minPitch ?? -CAMERA_RIG_MAX_PITCH,
    pitch: options.pitch ?? 0,
    yaw: options.yaw ?? 0,
  };
}

/**
 * Orbit rig state: the camera circles a point `targetOffsetY` above the target
 * at `distance`, placed by yaw / pitch, and always looks at that point.
 * `smoothing` eases the camera's position (per second, `0` snaps).
 */
export interface OrbitRig {
  distance: number;
  maxDistance: number;
  maxPitch: number;
  minDistance: number;
  minPitch: number;
  pitch: number;
  smoothing: number;
  targetOffsetY: number;
  yaw: number;
}

/** The {@link OrbitRig} component; serializes under `'orbitRig'`. */
export const OrbitRigDef: ComponentDef<OrbitRig> = simpleComponent<OrbitRig>('orbitRig', {
  distance: 'number',
  maxDistance: 'number',
  maxPitch: 'number',
  minDistance: 'number',
  minPitch: 'number',
  pitch: 'number',
  smoothing: 'number',
  targetOffsetY: 'number',
  yaw: 'number',
});

/** Create an {@link OrbitRig}. Defaults: distance 10 (limits 1–100), level, no offset, no smoothing. */
export function makeOrbitRig(options: Partial<OrbitRig> = {}): OrbitRig {
  return {
    distance: options.distance ?? 10,
    maxDistance: options.maxDistance ?? 100,
    maxPitch: options.maxPitch ?? CAMERA_RIG_MAX_PITCH,
    minDistance: options.minDistance ?? 1,
    minPitch: options.minPitch ?? -CAMERA_RIG_MAX_PITCH,
    pitch: options.pitch ?? 0,
    smoothing: options.smoothing ?? 0,
    targetOffsetY: options.targetOffsetY ?? 0,
    yaw: options.yaw ?? 0,
  };
}

/**
 * Chase rig state: the camera holds `offset` in the target's local frame and
 * turns with it (see {@link chasePose}), easing position and rotation with
 * separate per-second smoothing (`0` snaps).
 */
export interface ChaseRig {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  positionSmoothing: number;
  rotationSmoothing: number;
}

/** The {@link ChaseRig} component; serializes under `'chaseRig'`. */
export const ChaseRigDef: ComponentDef<ChaseRig> = simpleComponent<ChaseRig>('chaseRig', {
  offsetX: 'number',
  offsetY: 'number',
  offsetZ: 'number',
  positionSmoothing: 'number',
  rotationSmoothing: 'number',
});

/** Create a {@link ChaseRig}. Defaults: 2 up and 8 behind, no smoothing. */
export function makeChaseRig(options: Partial<ChaseRig> = {}): ChaseRig {
  return {
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 2,
    offsetZ: options.offsetZ ?? 8,
    positionSmoothing: options.positionSmoothing ?? 0,
    rotationSmoothing: options.rotationSmoothing ?? 0,
  };
}

/**
 * Apply a look delta — radians, as `MouseLookProvider` reports them (`dx > 0`
 * = pointer moved right, `dy > 0` = down) — to a first-person or orbit rig:
 * yaw turns right, pitch tilts down, clamped to the rig's pitch limits.
 */
export function addLookDelta(
  rig: { maxPitch: number; minPitch: number; pitch: number; yaw: number },
  dx: number,
  dy: number,
): void {
  rig.yaw -= dx;
  rig.pitch = clamp(rig.pitch - dy, rig.minPitch, rig.maxPitch);
}

/** Change an orbit rig's distance by `delta` (positive = zoom out), clamped to its limits. */
export function addOrbitZoom(rig: OrbitRig, delta: number): void {
  rig.distance = clamp(rig.distance + delta, rig.minDistance, rig.maxDistance);
}

/** The tick-context {@link makeCameraRigSystem} reads: `world` and optional `dtMs`. */
export interface CameraRigTickCtx { dtMs?: number; world: EcsWorld }

/** Options for {@link makeCameraRigSystem}. */
export interface CameraRigOptions {
  name?: string;
  /** Tag on the camera entities to drive. Each needs exactly one rig component. */
  cameraTag: TagDef;
  runAfter?: string[];
  /** Tag on the entity the rigs follow; the first tagged entity with a `Position3D` wins. */
  targetTag: TagDef;
}

function findTarget(world: EcsWorld, tag: TagDef): EntityId | undefined {
  const positions = world.getStore(Position3DDef);
  for (const id of world.getTag(tag)) {
    if (positions.has(id))
      return id;
  }
  return undefined;
}

/**
 * Returns a system that, each tick, poses every `cameraTag`-tagged entity from
 * its rig — writing its `Position3D` and `Rotation3D` — relative to the first
 * `targetTag`-tagged entity. Only the rig components a world registers are
 * looked up, so a world registers just the rigs it uses.
 *
 * - `FirstPersonRig`: at the target plus `eyeHeight`, rotated by yaw / pitch.
 * - `OrbitRig`: around the target (see {@link orbitPose}), always looking at it.
 * - `ChaseRig`: in the target's frame (see {@link chasePose}); reads the
 *   target's `Rotation3D`, treating a missing one as unrotated.
 *
 * Smoothing needs `ctx.dtMs`; without it the rigs snap. Pitch and distance are
 * clamped to the rig's limits when posing, without writing them back. With no
 * target the tick is a no-op. A camera carrying more than one rig throws — which
 * rig wins would otherwise depend on lookup order.
 */
export function makeCameraRigSystem<TCtx extends CameraRigTickCtx>(
  options: CameraRigOptions,
): SchedulableSystem<TCtx> {
  const { name = 'camera-rig', cameraTag, runAfter, targetTag } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const { world } = ctx;
      const targetId = findTarget(world, targetTag);
      if (targetId === undefined)
        return;
      const target = getCameraPose(world, targetId);
      const dtMs = ctx.dtMs ?? 0;
      const firstPersonRigs = world.getStoreByName(FirstPersonRigDef.name);
      const orbitRigs = world.getStoreByName(OrbitRigDef.name);
      const chaseRigs = world.getStoreByName(ChaseRigDef.name);
      const positions = world.getStore(Position3DDef);
      const rotations = world.getStore(Rotation3DDef);

      for (const cameraId of world.getTag(cameraTag)) {
        const firstPerson = firstPersonRigs?.get(cameraId) as FirstPersonRig | undefined;
        const orbit = orbitRigs?.get(cameraId) as OrbitRig | undefined;
        const chase = chaseRigs?.get(cameraId) as ChaseRig | undefined;
        const rigCount = Number(!!firstPerson) + Number(!!orbit) + Number(!!chase);
        if (rigCount === 0)
          continue;
        if (rigCount > 1)
          throw new Error(`Camera entity ${cameraId} has ${rigCount} rig components; give it exactly one.`);

        let next: CameraPose;
        if (firstPerson) {
          next = {
            position: vec3Add(target.position, { x: 0, y: firstPerson.eyeHeight, z: 0 }),
            rotation: firstPersonRotation(
              firstPerson.yaw,
              clamp(firstPerson.pitch, firstPerson.minPitch, firstPerson.maxPitch),
            ),
          };
        }
        else if (orbit) {
          const focus = vec3Add(target.position, { x: 0, y: orbit.targetOffsetY, z: 0 });
          const desired = orbitPose(
            focus,
            orbit.yaw,
            clamp(orbit.pitch, orbit.minPitch, orbit.maxPitch),
            clamp(orbit.distance, orbit.minDistance, orbit.maxDistance),
          );
          const current = getCameraPose(world, cameraId);
          const position = positions.has(cameraId)
            ? vec3Lerp(current.position, desired.position, smoothingBlend(orbit.smoothing, dtMs))
            : desired.position;
          next = { position, rotation: quatLookRotation(vec3Sub(focus, position)) };
        }
        else {
          const rig = chase!;
          const desired = chasePose(target.position, target.rotation, { x: rig.offsetX, y: rig.offsetY, z: rig.offsetZ });
          next = positions.has(cameraId)
            ? dampPose(getCameraPose(world, cameraId), desired, { position: rig.positionSmoothing, rotation: rig.rotationSmoothing }, dtMs)
            : desired;
        }
        positions.set(cameraId, next.position);
        rotations.set(cameraId, next.rotation);
      }
    },
  };
}
