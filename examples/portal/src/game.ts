import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import { EcsWorld } from '@pierre/ecs';

import {
  CubeTag,
  DoorTag,
  DynamicBodyTag,
  FloorTag,
  GroundedDef,
  HeldTag,
  PlateTag,
  PlayerTag,
  PortalableSurfaceTag,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
  Velocity3DDef,
  WallTag,
} from './components';

// Physics (world units ≈ meters; +Y is up).
export const GRAVITY = 26;
export const MOVE_SPEED = 7;
/**
 * Air-control lerp toward the input direction each tick (0 = none, 1 =
 * instant). Low so a portal fling preserves its momentum mid-air.
 */
export const AIR_CONTROL = 0.06;
export const JUMP_IMPULSE = 11;
export const MAX_FALL_SPEED = 45;

// Player (a tall AABB; the camera sits at PLAYER_EYE above its center).
export const PLAYER_W = 0.7;
export const PLAYER_H = 1.8;
export const PLAYER_D = 0.7;
export const PLAYER_EYE = 0.6;
export const PLAYER_SPAWN = { x: -6, y: 3, z: 0 };

// Companion cube.
export const CUBE_SIZE = 0.8;
export const CUBE_SPAWN = { x: -4, y: 2, z: 2.5 };

// Cube carry.
export const HOLD_DIST = 2;
export const GRAB_RANGE = 3.2;

// Pressure plate on side B (pressed by the player or the cube resting on it).
export const PLATE_POS = { x: 4, y: 0.06, z: 0 };
export const PLATE_W = 1.8;
export const PLATE_H = 0.12;
export const PLATE_D = 1.8;
/** Height of the trigger volume above the plate that counts as "pressed". */
export const PLATE_TRIGGER_H = 1.2;

// Sliding door in the side-B dividing wall; opens while the plate is pressed.
export const DOOR_X = 8;
export const DOOR_Z = 0;
export const DOOR_W = 0.5;
export const DOOR_H = 3.2;
export const DOOR_D = 3;
export const DOOR_CLOSED_Y = DOOR_H / 2; // spans [0, DOOR_H]
export const DOOR_OPEN_Y = DOOR_CLOSED_Y + DOOR_H; // tucked above the doorway
export const DOOR_SPEED = 6; // world units / second

/** Win once the player gets past the door into the exit alcove. */
export const EXIT_X = 8.7;

// Fall below this Y → respawn.
export const RESPAWN_Y = -12;

// Mouse-look.
export const MOUSE_SENSITIVITY = 0.0022; // rad per pixel
export const MAX_PITCH = Math.PI / 2 - 0.04;

// Portals (a tall oval; full width/height in world units).
export const PORTAL_W = 1.1;
export const PORTAL_H = 1.95;
export const PORTAL_EDGE_MARGIN = 0.06;
export const PORTAL_SURFACE_OFFSET = 0.03;
/**
 * How far along the portal normal a body may be from the plane and still have
 * the host wall carved away (so it can walk into/through the portal).
 */
export const PORTAL_CARVE_DEPTH = 1;

export type PortalColor = 'blue' | 'orange';

export interface Vec3 { x: number; y: number; z: number }

/** A placed portal: a centre on a surface plus an oriented local frame. */
export interface Portal {
  center: Vec3;
  normal: Vec3;
  right: Vec3;
  surfaceId: EntityId;
  up: Vec3;
}

export type PortalAction = 'back' | 'forward' | 'grab' | 'jump' | 'left' | 'reset' | 'right';

export type PortalEvent
  = | { type: 'PlayerRespawned' }
    | { type: 'CubeRespawned' }
    | { type: 'LevelComplete' };

export interface GameState {
  cubeId: EntityId | null;
  doorId: EntityId | null;
  dtMs: number;
  events: EventBus<PortalEvent>;
  input: InputState<PortalAction>;
  pendingFire: PortalColor | null;
  pitch: number;
  platePressed: boolean;
  playerId: EntityId | null;
  portals: { blue: Portal | null; orange: Portal | null };
  won: boolean;
  world: EcsWorld;
  yaw: number;
}

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(Position3DDef);
  world.registerComponent(Velocity3DDef);
  world.registerComponent(ShapeAabb3DDef);
  world.registerComponent(GroundedDef);
  world.registerTag(PlayerTag);
  world.registerTag(CubeTag);
  world.registerTag(StaticBodyTag);
  world.registerTag(DynamicBodyTag);
  world.registerTag(PortalableSurfaceTag);
  world.registerTag(HeldTag);
  world.registerTag(PlateTag);
  world.registerTag(DoorTag);
  world.registerTag(FloorTag);
  world.registerTag(WallTag);
  return world;
}

function spawnPlayer(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { ...PLAYER_SPAWN });
  state.world.getStore(Velocity3DDef).set(id, { vx: 0, vy: 0, vz: 0 });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: PLAYER_D, h: PLAYER_H, w: PLAYER_W });
  state.world.getStore(GroundedDef).set(id, { onGround: false });
  state.world.getTag(PlayerTag).add(id);
  state.world.getTag(DynamicBodyTag).add(id);
  return id;
}

function spawnCube(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { ...CUBE_SPAWN });
  state.world.getStore(Velocity3DDef).set(id, { vx: 0, vy: 0, vz: 0 });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: CUBE_SIZE, h: CUBE_SIZE, w: CUBE_SIZE });
  state.world.getStore(GroundedDef).set(id, { onGround: false });
  state.world.getTag(CubeTag).add(id);
  state.world.getTag(DynamicBodyTag).add(id);
  return id;
}

/** Spawn a static AABB collider (center-based; full extents w/h/d). */
function spawnStatic(
  state: GameState,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  portalable = false,
): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x, y, z });
  state.world.getStore(ShapeAabb3DDef).set(id, { d, h, w });
  state.world.getTag(StaticBodyTag).add(id);
  if (portalable)
    state.world.getTag(PortalableSurfaceTag).add(id);
  return id;
}

/** Flat pressure plate on the side-B floor (visual + trigger; not a collider). */
function spawnPlate(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { ...PLATE_POS });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: PLATE_D, h: PLATE_H, w: PLATE_W });
  state.world.getTag(PlateTag).add(id);
  return id;
}

/**
 * Sliding door filling the dividing-wall doorway. A collider that the
 * plate-door system raises while the plate is pressed.
 */
function spawnDoor(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x: DOOR_X, y: DOOR_CLOSED_Y, z: DOOR_Z });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: DOOR_D, h: DOOR_H, w: DOOR_W });
  state.world.getTag(StaticBodyTag).add(id);
  state.world.getTag(DoorTag).add(id);
  return id;
}

/**
 * A rectangular room whose floor is split by a central chasm (along X) into a
 * left half (side A, the player + cube spawn here) and a right half (side B,
 * where the plate + door will live). The gap is too wide to jump — crossing it
 * is the portal puzzle.
 */
function buildLevel(state: GameState): void {
  const wallH = 6;
  const wallY = wallH / 2;

  // Floor: two slabs with a gap at X ∈ [-2, 2]. Tops sit at Y = 0.
  const floorA = spawnStatic(state, -6, -0.5, 0, 8, 1, 12); // side A
  const floorB = spawnStatic(state, 6, -0.5, 0, 8, 1, 12); // side B
  state.world.getTag(FloorTag).add(floorA);
  state.world.getTag(FloorTag).add(floorB);

  // Perimeter walls (1 thick). Left/back/front are portal-able; the right
  // (exit-side) wall is NOT, so you can't portal straight into the exit and
  // skip the puzzle.
  const wallL = spawnStatic(state, -10.5, wallY, 0, 1, wallH, 12, true); // left (+X face)
  const wallR = spawnStatic(state, 10.5, wallY, 0, 1, wallH, 12, false); // right (-X face, exit side)
  const wallB = spawnStatic(state, 0, wallY, -6.5, 22, wallH, 1, true); // back (+Z face)
  const wallF = spawnStatic(state, 0, wallY, 6.5, 22, wallH, 1, true); // front (-Z face)
  for (const id of [wallL, wallR, wallB, wallF])
    state.world.getTag(WallTag).add(id);

  // Ceiling.
  spawnStatic(state, 0, wallH + 0.5, 0, 22, 1, 14);

  // Side-B dividing wall at x=DOOR_X with a central doorway (the door fills it).
  // Two full-height side segments + a header above the doorway. Not portal-able.
  // Tagged WallTag so the tiled wall hides their boxes (else they z-fight).
  const divL = spawnStatic(state, DOOR_X, wallY, -3.75, 0.5, wallH, 4.5); // left of doorway
  const divR = spawnStatic(state, DOOR_X, wallY, 3.75, 0.5, wallH, 4.5); // right of doorway
  const divH = spawnStatic(state, DOOR_X, (DOOR_H + wallH) / 2, 0, 0.5, wallH - DOOR_H, DOOR_D); // header
  for (const id of [divL, divR, divH])
    state.world.getTag(WallTag).add(id);

  spawnPlate(state);
  state.doorId = spawnDoor(state);
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.yaw = 0;
  state.pitch = 0;
  state.portals.blue = null;
  state.portals.orange = null;
  state.pendingFire = null;
  state.platePressed = false;
  state.won = false;
  state.doorId = null;
  state.playerId = spawnPlayer(state);
  state.cubeId = spawnCube(state);
  buildLevel(state);
}

/** Reset a body's position + velocity to a spawn point (in place — keeps its id). */
function resetBody(state: GameState, id: EntityId, spawn: { x: number; y: number; z: number }): void {
  const pos = state.world.getStore(Position3DDef).get(id);
  const vel = state.world.getStore(Velocity3DDef).get(id);
  if (pos) {
    pos.x = spawn.x;
    pos.y = spawn.y;
    pos.z = spawn.z;
  }
  if (vel) {
    vel.vx = 0;
    vel.vy = 0;
    vel.vz = 0;
  }
}

export function respawnPlayer(state: GameState): void {
  if (state.playerId == null)
    return;
  resetBody(state, state.playerId, PLAYER_SPAWN);
  state.events.emit({ type: 'PlayerRespawned' });
}

export function respawnCube(state: GameState): void {
  if (state.cubeId == null)
    return;
  resetBody(state, state.cubeId, CUBE_SPAWN);
  state.events.emit({ type: 'CubeRespawned' });
}
