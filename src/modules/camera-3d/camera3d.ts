import type { ComponentDef, EcsWorld, EntityId } from '#index';
import type { Mat4, Quat, Vec3 } from '../math';

import { simpleComponent } from '#index';

import { mat4Compose, mat4Multiply, mat4Orthographic, mat4Perspective, quatConjugate, quatRotate } from '../math';
import { Position3DDef, Rotation3DDef } from '../transform-3d';

/** How a {@link Camera3D} maps view space to the screen. */
export type Camera3DProjection = 'orthographic' | 'perspective';

/**
 * A 3D camera's lens — what it sees, not where it stands. The pose comes from
 * the camera entity's `Position3D` + `Rotation3D` (see {@link getCameraPose});
 * the camera looks down its local `-Z` with `+Y` up.
 */
export interface Camera3D {
  /** Far clip distance, world units in front of the camera. */
  far: number;
  /** Vertical field of view in radians. Used by `'perspective'` only. */
  fovY: number;
  /** Near clip distance, world units in front of the camera; `> 0` for perspective. */
  near: number;
  /** Half the view's height in world units (Unity `orthographicSize`). Used by `'orthographic'` only. */
  orthoSize: number;
  projection: Camera3DProjection;
  /** Viewport height in pixels — the surface the camera draws into. */
  viewportH: number;
  /** Viewport width in pixels. */
  viewportW: number;
}

/** The {@link Camera3D} lens component; serializes under `'camera3d'`. */
export const Camera3DDef: ComponentDef<Camera3D> = simpleComponent<Camera3D>('camera3d', {
  far: 'number',
  fovY: 'number',
  near: 'number',
  orthoSize: 'number',
  projection: 'string',
  viewportH: 'number',
  viewportW: 'number',
});

/** Options for {@link makeCamera3D}; only the viewport is required. */
export interface Camera3DOptions {
  far?: number;
  fovY?: number;
  near?: number;
  orthoSize?: number;
  projection?: Camera3DProjection;
  viewportH: number;
  viewportW: number;
}

/**
 * Create a {@link Camera3D}. Defaults: perspective, 60° vertical field of view,
 * near `0.1`, far `1000`, orthographic half-height `5`.
 */
export function makeCamera3D(options: Camera3DOptions): Camera3D {
  return {
    far: options.far ?? 1000,
    fovY: options.fovY ?? Math.PI / 3,
    near: options.near ?? 0.1,
    orthoSize: options.orthoSize ?? 5,
    projection: options.projection ?? 'perspective',
    viewportH: options.viewportH,
    viewportW: options.viewportW,
  };
}

/** Where a camera stands and which way it faces. `rotation` must be unit-length. */
export interface CameraPose {
  position: Vec3;
  rotation: Quat;
}

/**
 * The pose of `entity`, read from its `Position3D` and `Rotation3D`. A missing
 * `Rotation3D` (or an unregistered one) means unrotated; a missing `Position3D`
 * means the origin.
 */
export function getCameraPose(world: EcsWorld, entity: EntityId): CameraPose {
  const position = world.getStoreByName(Position3DDef.name)?.get(entity) as Vec3 | undefined;
  const rotation = world.getStoreByName(Rotation3DDef.name)?.get(entity) as Quat | undefined;
  return {
    position: position ? { x: position.x, y: position.y, z: position.z } : { x: 0, y: 0, z: 0 },
    rotation: rotation ? { w: rotation.w, x: rotation.x, y: rotation.y, z: rotation.z } : { w: 1, x: 0, y: 0, z: 0 },
  };
}

/** Viewport width / height. */
export function camera3DAspect(cam: Camera3D): number {
  return cam.viewportW / cam.viewportH;
}

/** The projection matrix: view space to WebGL clip space (NDC `[-1, 1]`). */
export function camera3DProjectionMatrix(cam: Camera3D): Mat4 {
  const aspect = camera3DAspect(cam);
  if (cam.projection === 'orthographic') {
    const h = cam.orthoSize;
    return mat4Orthographic(-h * aspect, h * aspect, -h, h, cam.near, cam.far);
  }
  return mat4Perspective(cam.fovY, aspect, cam.near, cam.far);
}

/** The view matrix: world space to camera space — the inverse of the pose. */
export function camera3DViewMatrix(pose: CameraPose): Mat4 {
  const inverse = quatConjugate(pose.rotation);
  const t = quatRotate(inverse, pose.position);
  return mat4Compose({ x: -t.x, y: -t.y, z: -t.z }, inverse);
}

/** `projection · view`: world space straight to clip space. */
export function camera3DViewProjection(cam: Camera3D, pose: CameraPose): Mat4 {
  return mat4Multiply(camera3DProjectionMatrix(cam), camera3DViewMatrix(pose));
}
