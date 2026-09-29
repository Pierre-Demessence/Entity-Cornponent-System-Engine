import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { Vec3 } from '@pierre/ecs/modules/math';
import type { RandomFn } from '@pierre/ecs/modules/rng';

import { EcsWorld } from '@pierre/ecs';
import { Camera3DDef, ChaseRigDef, makeCamera3D, makeChaseRig } from '@pierre/ecs/modules/camera-3d';
import { degToRad, QUAT_IDENTITY, vec3ClampLength, vec3RandomUnit } from '@pierre/ecs/modules/math';
import { makeSeededRng } from '@pierre/ecs/modules/rng';

import {
  BulletDef,
  BulletTag,
  CameraTag,
  Position3DDef,
  RadiusDef,
  Rotation3DDef,
  ShipTag,
  TargetDef,
  TargetTag,
  Velocity3DDef,
} from './components';

// World units are arbitrary "space metres"; +Y is up.

// Ship + throttle
export const SHIP_RADIUS = 1.1;
export const THROTTLE_ACCEL = 22; // units/s² added to forward speed while thrusting
export const MAX_SPEED = 36;
export const MIN_SPEED = -12; // reverse cap

// Attitude (Elite / No-Man's-Sky style aim-to-steer)
export const YAW_RATE = 1.3; // rad/s at full reticle deflection
export const PITCH_RATE = 1.3;
export const ROLL_RATE = 2.4;
export const TURN_RESPONSE = 0.12; // how fast angular velocity eases toward its target
export const AIM_DEADZONE = 0.12; // central reticle fraction that produces no turn

// Play boundary (sphere centred on origin)
export const BOUNDS_RADIUS = 90;

// Weapon
export const BULLET_SPEED = 80; // muzzle speed added along forward
export const BULLET_RADIUS = 0.35;
export const BULLET_TTL_MS = 1600;
export const FIRE_COOLDOWN_MS = 130;
export const MUZZLE_OFFSET = 1.8; // spawn ahead of ship centre

// Targets
export const TARGET_RADIUS = 1.6;
export const TARGET_CAP = 14;
export const TARGET_SPAWN_MS = 900;
export const TARGET_MIN_SPAWN_DIST = 26;
export const TARGET_MAX_SPAWN_DIST = 70;
export const TARGET_DRIFT_SPEED = 4;

// Camera (third-person chase)
export const CAMERA_DISTANCE = 9;
export const CAMERA_HEIGHT = 2.8;
/** Easing per second; closes 14% of the position gap and 10% of the turn per frame at 60 Hz. */
export const CAMERA_POS_SMOOTHING = 9;
export const CAMERA_ROT_SMOOTHING = 6.3;

export type StarfighterAction
  = | 'fire'
    | 'reset'
    | 'rollLeft'
    | 'rollRight'
    | 'throttleDown'
    | 'throttleUp';

export type StarfighterEvent
  = | { type: 'TargetDestroyed'; score: number }
    | { type: 'TargetSpawned' };

export interface GameState {
  aimX: number; // reticle X offset, −1 (left) … +1 (right); deadzone applied downstream
  aimY: number; // reticle Y offset, −1 (down) … +1 (up)
  angVel: Vec3; // ship-local angular velocity (x=pitch, y=yaw, z=roll)
  /** The camera entity: a `Camera3D` lens and a `ChaseRig` behind the ship. */
  cameraId: EntityId | null;
  dtMs: number;
  events: EventBus<StarfighterEvent>;
  fireTimer: number;
  firing: boolean;
  input: InputState<StarfighterAction>;
  playerId: EntityId | null;
  rng: RandomFn;
  score: number;
  spawnTimer: number;
  speed: number; // forward speed along the nose
  /** Drawing-surface size in pixels; the camera lens follows it (see {@link resizeView}). */
  viewport: { h: number; w: number };
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(Position3DDef);
  world.registerComponent(Rotation3DDef);
  world.registerComponent(Velocity3DDef);
  world.registerComponent(RadiusDef);
  world.registerComponent(TargetDef);
  world.registerComponent(BulletDef);
  world.registerComponent(Camera3DDef);
  world.registerComponent(ChaseRigDef);
  world.registerTag(ShipTag);
  world.registerTag(CameraTag);
  world.registerTag(BulletTag);
  world.registerTag(TargetTag);
  return world;
}

function spawnShip(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x: 0, y: 0, z: 0 });
  state.world.getStore(Rotation3DDef).set(id, { ...QUAT_IDENTITY });
  state.world.getStore(Velocity3DDef).set(id, { vx: 0, vy: 0, vz: 0 });
  state.world.getStore(RadiusDef).set(id, { r: SHIP_RADIUS });
  state.world.getTag(ShipTag).add(id);
  return id;
}

/** Spawn the chase camera; `makeCameraRigSystem` trails it behind the ship. */
function spawnCamera(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Camera3DDef).set(id, makeCamera3D({
    far: 1200,
    fovY: degToRad(65),
    near: 0.1,
    viewportH: state.viewport.h,
    viewportW: state.viewport.w,
  }));
  state.world.getStore(ChaseRigDef).set(id, makeChaseRig({
    offsetY: CAMERA_HEIGHT,
    offsetZ: CAMERA_DISTANCE,
    positionSmoothing: CAMERA_POS_SMOOTHING,
    rotationSmoothing: CAMERA_ROT_SMOOTHING,
  }));
  state.world.getTag(CameraTag).add(id);
  return id;
}

/** Record a new drawing-surface size and pass it to the camera lens. */
export function resizeView(state: GameState, w: number, h: number): void {
  state.viewport = { h, w };
  const lens = state.cameraId == null ? undefined : state.world.getStore(Camera3DDef).get(state.cameraId);
  if (lens) {
    lens.viewportW = w;
    lens.viewportH = h;
  }
}

export function spawnBullet(state: GameState, pos: Vec3, vel: Vec3): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { ...pos });
  state.world.getStore(Velocity3DDef).set(id, { vx: vel.x, vy: vel.y, vz: vel.z });
  state.world.getStore(RadiusDef).set(id, { r: BULLET_RADIUS });
  state.world.getStore(BulletDef).set(id, { ttl: BULLET_TTL_MS });
  state.world.getTag(BulletTag).add(id);
  return id;
}

/** Spawn a drone at a random bearing/distance around the ship, drifting slowly. */
export function spawnTarget(state: GameState): EntityId {
  const ship = state.playerId == null
    ? { x: 0, y: 0, z: 0 }
    : state.world.getStore(Position3DDef).get(state.playerId) ?? { x: 0, y: 0, z: 0 };

  const dir = vec3RandomUnit(state.rng);
  const dist = TARGET_MIN_SPAWN_DIST
    + state.rng() * (TARGET_MAX_SPAWN_DIST - TARGET_MIN_SPAWN_DIST);
  const pos = vec3ClampLength({
    x: ship.x + dir.x * dist,
    y: ship.y + dir.y * dist,
    z: ship.z + dir.z * dist,
  }, BOUNDS_RADIUS);

  const drift = vec3RandomUnit(state.rng);
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, pos);
  state.world.getStore(Velocity3DDef).set(id, {
    vx: drift.x * TARGET_DRIFT_SPEED,
    vy: drift.y * TARGET_DRIFT_SPEED,
    vz: drift.z * TARGET_DRIFT_SPEED,
  });
  state.world.getStore(RadiusDef).set(id, { r: TARGET_RADIUS });
  state.world.getStore(TargetDef).set(id, { hp: 1 });
  state.world.getTag(TargetTag).add(id);
  return id;
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.score = 0;
  state.angVel = { x: 0, y: 0, z: 0 };
  state.speed = 0;
  state.aimX = 0;
  state.aimY = 0;
  state.fireTimer = 0;
  state.spawnTimer = 0;
  state.rng = makeSeededRng(0x5EED);
  state.playerId = spawnShip(state);
  state.cameraId = spawnCamera(state);
  for (let i = 0; i < 6; i++)
    spawnTarget(state);
}
