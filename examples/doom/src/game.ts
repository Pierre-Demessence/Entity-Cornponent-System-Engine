import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import { EcsWorld } from '@pierre/ecs';

import {
  AiDef,
  BillboardDef,
  DynamicBodyTag,
  ElevatorDef,
  ElevatorTag,
  EnemyTag,
  GroundedDef,
  HealthDef,
  PickupDef,
  PickupTag,
  PlayerTag,
  Position3DDef,
  ProjectileDef,
  ProjectileTag,
  ShapeAabb3DDef,
  StaticBodyTag,
  TintDef,
  Velocity3DDef,
} from './components';

// Physics (world units ≈ meters; +Y is up).
export const GRAVITY = 26;
export const MOVE_SPEED = 8;
/** Air-control lerp toward the input direction each tick (0 = none, 1 = instant). */
export const AIR_CONTROL = 0.08;
export const JUMP_IMPULSE = 11;
export const MAX_FALL_SPEED = 45;
/** Max height a grounded body auto-climbs without jumping (stairs). */
export const STEP_HEIGHT = 0.5;

// Player (a tall AABB; the camera sits at PLAYER_EYE above its center).
export const PLAYER_W = 0.7;
export const PLAYER_H = 1.8;
export const PLAYER_D = 0.7;
export const PLAYER_EYE = 0.6;
export const PLAYER_SPAWN = { x: 0, y: 3, z: 10 };

// Fall below this Y → respawn.
export const RESPAWN_Y = -12;

// Mouse-look.
export const MOUSE_SENSITIVITY = 0.0022; // rad per pixel
export const MAX_PITCH = Math.PI / 2 - 0.04;

// Enemies (billboard creatures).
export const ENEMY_W = 0.8;
export const ENEMY_H = 1.4;
export const ENEMY_MAX_HP = 30;
export const ENEMY_DETECT_RANGE = 14; // wake within this range + line of sight
export const ENEMY_ATTACK_RANGE = 2.5; // stop + attack within this XZ range
export const ENEMY_SPEED = 3.5;
export const ENEMY_ATTACK_COOLDOWN_MS = 1200;

// Weapons. (0) hitscan: instant ray, fast + light. (1) projectile: a travelling
// bolt, slower fire + heavier hit.
export const HITSCAN_DAMAGE = 18;
export const HITSCAN_RANGE = 60;
export const HITSCAN_COOLDOWN_MS = 180;
export const PROJECTILE_DAMAGE = 40;
export const PROJECTILE_SPEED = 28;
export const PROJECTILE_SIZE = 0.3;
export const PROJECTILE_TTL_MS = 2500;
export const PROJECTILE_COOLDOWN_MS = 550;

// Player survival.
export const PLAYER_MAX_HP = 100;
export const ENEMY_DAMAGE = 8; // per enemy attack
export const HITSCAN_AMMO_START = 60;
export const ROCKET_AMMO_START = 10;
export const HEALTH_PICKUP_AMOUNT = 25;
export const HITSCAN_AMMO_PICKUP = 25;
export const ROCKET_AMMO_PICKUP = 5;
export const PICKUP_SIZE = 0.6;

// Arena (a flat square room; verticality lands in M2).
export const ARENA_HALF = 15; // floor spans [-ARENA_HALF, ARENA_HALF] on X/Z
export const WALL_H = 8;

// Surface palette — distinct colours by role so floor/walls/stairs/etc. read apart.
const COLOR_FLOOR = 0x3C4048; // dark slate
const COLOR_WALL = 0x6D5847; // warm brown
const COLOR_CRATE = 0x4F7A3F; // green
const COLOR_STAIR = 0xB08D57; // tan
const COLOR_PLATFORM = 0x4A6D8C; // steel blue (raised platforms)
const COLOR_ELEVATOR = 0xC24A3A; // red (it moves)

export interface Vec3 { x: number; y: number; z: number }

export type DoomAction = 'back' | 'forward' | 'jump' | 'left' | 'reset' | 'right' | 'weapon1' | 'weapon2';

export interface DoomEvent { type: 'PlayerRespawned' }

/** A transient hitscan tracer the renderer draws for a few ticks. */
export interface TracerLine { from: Vec3; to: Vec3; ttl: number }

export interface GameState {
  ammo: number[]; // per weapon: [hitscan, rocket]
  dead: boolean;
  dtMs: number;
  events: EventBus<DoomEvent>;
  fireTimer: number;
  firing: boolean;
  input: InputState<DoomAction>;
  pitch: number;
  playerId: EntityId | null;
  tracer: TracerLine | null;
  weapon: number; // 0 = hitscan, 1 = projectile
  world: EcsWorld;
  yaw: number;
}

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(Position3DDef);
  world.registerComponent(Velocity3DDef);
  world.registerComponent(ShapeAabb3DDef);
  world.registerComponent(GroundedDef);
  world.registerComponent(ElevatorDef);
  world.registerComponent(TintDef);
  world.registerComponent(HealthDef);
  world.registerComponent(AiDef);
  world.registerComponent(BillboardDef);
  world.registerComponent(ProjectileDef);
  world.registerComponent(PickupDef);
  world.registerTag(PlayerTag);
  world.registerTag(StaticBodyTag);
  world.registerTag(DynamicBodyTag);
  world.registerTag(ElevatorTag);
  world.registerTag(EnemyTag);
  world.registerTag(ProjectileTag);
  world.registerTag(PickupTag);
  return world;
}

function spawnPlayer(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { ...PLAYER_SPAWN });
  state.world.getStore(Velocity3DDef).set(id, { vx: 0, vy: 0, vz: 0 });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: PLAYER_D, h: PLAYER_H, w: PLAYER_W });
  state.world.getStore(GroundedDef).set(id, { onGround: false });
  state.world.getStore(HealthDef).set(id, { hp: PLAYER_MAX_HP, max: PLAYER_MAX_HP });
  state.world.getTag(PlayerTag).add(id);
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
  color = 0x6B7486,
): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x, y, z });
  state.world.getStore(ShapeAabb3DDef).set(id, { d, h, w });
  state.world.getStore(TintDef).set(id, { color });
  state.world.getTag(StaticBodyTag).add(id);
  return id;
}

/** Spawn a billboard enemy on the floor at (x, z). `sprite` indexes the texture. */
function spawnEnemy(state: GameState, x: number, z: number, sprite: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x, y: ENEMY_H / 2, z });
  state.world.getStore(Velocity3DDef).set(id, { vx: 0, vy: 0, vz: 0 });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: ENEMY_W, h: ENEMY_H, w: ENEMY_W });
  state.world.getStore(HealthDef).set(id, { hp: ENEMY_MAX_HP, max: ENEMY_MAX_HP });
  state.world.getStore(AiDef).set(id, { attackTimer: 0, mode: 0 });
  state.world.getStore(BillboardDef).set(id, { sprite });
  state.world.getTag(EnemyTag).add(id);
  state.world.getTag(DynamicBodyTag).add(id);
  return id;
}

/** Spawn a projectile from `origin` travelling along unit `dir`. */
export function spawnProjectile(state: GameState, origin: Vec3, dir: Vec3): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x: origin.x, y: origin.y, z: origin.z });
  state.world.getStore(Velocity3DDef).set(id, {
    vx: dir.x * PROJECTILE_SPEED,
    vy: dir.y * PROJECTILE_SPEED,
    vz: dir.z * PROJECTILE_SPEED,
  });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: PROJECTILE_SIZE, h: PROJECTILE_SIZE, w: PROJECTILE_SIZE });
  state.world.getStore(ProjectileDef).set(id, { damage: PROJECTILE_DAMAGE, ttl: PROJECTILE_TTL_MS });
  state.world.getTag(ProjectileTag).add(id);
  return id;
}

/** Spawn a floor pickup at (x, z). `kind`: 0 health, 1 hitscan ammo, 2 rocket ammo. */
function spawnPickup(state: GameState, x: number, z: number, kind: number): EntityId {
  const amount = kind === 0
    ? HEALTH_PICKUP_AMOUNT
    : kind === 1 ? HITSCAN_AMMO_PICKUP : ROCKET_AMMO_PICKUP;
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x, y: 0.6, z });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: PICKUP_SIZE, h: PICKUP_SIZE, w: PICKUP_SIZE });
  state.world.getStore(PickupDef).set(id, { amount, kind });
  state.world.getTag(PickupTag).add(id);
  return id;
}

/**
 * A flat square arena: floor + four perimeter walls + a handful of low cover
 * blocks. Verticality (stairs/ramps/elevator) is M2.
 */
function buildLevel(state: GameState): void {
  const span = ARENA_HALF * 2;
  const wallY = WALL_H / 2;

  // Floor (top at Y = 0).
  spawnStatic(state, 0, -0.5, 0, span, 1, span, COLOR_FLOOR);

  // Perimeter walls (1 thick), overlapping the corners.
  spawnStatic(state, -ARENA_HALF - 0.5, wallY, 0, 1, WALL_H, span + 2, COLOR_WALL); // left
  spawnStatic(state, ARENA_HALF + 0.5, wallY, 0, 1, WALL_H, span + 2, COLOR_WALL); // right
  spawnStatic(state, 0, wallY, -ARENA_HALF - 0.5, span + 2, WALL_H, 1, COLOR_WALL); // back
  spawnStatic(state, 0, wallY, ARENA_HALF + 0.5, span + 2, WALL_H, 1, COLOR_WALL); // front

  // Cover blocks (2-tall crates the player can hide behind / strafe around).
  for (const [cx, cz] of [[-7, -5], [7, -5], [-6, 4], [8, 6], [0, -9]] as const)
    spawnStatic(state, cx, 1, cz, 2, 2, 2, COLOR_CRATE);

  // Verticality 1 — a staircase (left) up to a raised balcony. Each tread rises
  // STAIR_RISE (< STEP_HEIGHT) so the controller auto-climbs it.
  const STAIR_RISE = 0.4;
  const STAIR_DEPTH = 1.2;
  const stairX = -10;
  const stairStartZ = 12;
  const stairCount = 6;
  for (let i = 0; i < stairCount; i += 1) {
    const top = (i + 1) * STAIR_RISE;
    spawnStatic(state, stairX, top / 2, stairStartZ - i * STAIR_DEPTH, 4, top, STAIR_DEPTH, COLOR_STAIR);
  }
  const balconyTop = stairCount * STAIR_RISE; // 2.4
  spawnStatic(state, stairX, balconyTop - 0.25, stairStartZ - stairCount * STAIR_DEPTH - 2.5, 4, 0.5, 6, COLOR_PLATFORM);

  // Verticality 2 — an oscillating elevator (right) up to a step-off ledge.
  const elevator = spawnStatic(state, 11, 0.2, 8, 3, 0.4, 3, COLOR_ELEVATOR);
  state.world.getStore(ElevatorDef).set(elevator, { dir: 1, maxY: 3.2, minY: 0.2, speed: 2 });
  state.world.getTag(ElevatorTag).add(elevator);
  spawnStatic(state, 13.5, 3.15, 8, 2, 0.5, 4, COLOR_PLATFORM); // ledge (top at 3.4, level with the raised elevator)

  // Enemies (green = sprite 0, red = sprite 1).
  spawnEnemy(state, -8, -8, 0);
  spawnEnemy(state, 9, -10, 1);
  spawnEnemy(state, -4, 11, 0);
  spawnEnemy(state, 7, 3, 1);

  // Pickups (kind 0 health, 1 hitscan ammo, 2 rocket ammo).
  spawnPickup(state, 0, 0, 0);
  spawnPickup(state, 4, -3, 0);
  spawnPickup(state, -12, -12, 1);
  spawnPickup(state, 12, 13, 2);
}

export function respawnPlayer(state: GameState): void {
  if (state.playerId == null)
    return;
  state.world.getStore(Position3DDef).set(state.playerId, { ...PLAYER_SPAWN });
  state.world.getStore(Velocity3DDef).set(state.playerId, { vx: 0, vy: 0, vz: 0 });
  state.events.emit({ type: 'PlayerRespawned' });
}

/** Tear the world down and rebuild the arena + player from scratch. */
export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.pitch = 0;
  state.yaw = 0;
  state.dead = false;
  state.weapon = 0;
  state.firing = false;
  state.fireTimer = 0;
  state.tracer = null;
  state.ammo = [HITSCAN_AMMO_START, ROCKET_AMMO_START];
  state.playerId = spawnPlayer(state);
  buildLevel(state);
}
