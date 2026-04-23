import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import { EcsWorld } from '@pierre/ecs';

import {
  CoinTag,
  CoinValueDef,
  GroundedDef,
  PlayerTag,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from './components';

// Physics (world units ≈ meters; +Y is up)
export const GRAVITY = 28;
export const MOVE_SPEED = 8;
export const JUMP_IMPULSE = 13;
export const MAX_FALL_SPEED = 40;

// Player
export const PLAYER_SIZE = 1;
export const PLAYER_SPAWN_X = -6;
export const PLAYER_SPAWN_Y = 4;
export const PLAYER_SPAWN_Z = 0;

// Coin
export const COIN_SIZE = 0.5;
export const COIN_SCORE = 10;

// Respawn
export const RESPAWN_Y = -20;

// Camera
export const CAMERA_MOUSE_SENSITIVITY = 0.005; // rad per pixel of mouse drag
export const CAMERA_DISTANCE = 9;
export const CAMERA_HEIGHT = 5.5;
export const CAMERA_LERP = 0.12;
export const CAMERA_LOOK_OFFSET_Y = 0.5;

export type PlatformerAction = 'forward' | 'back' | 'left' | 'right' | 'jump';

export type Platformer3DEvent
  = | { type: 'CoinCollected'; coinId: EntityId; score: number }
    | { type: 'PlayerFell' };

export interface GameState {
  cameraYaw: number;
  dtMs: number;
  events: EventBus<Platformer3DEvent>;
  input: InputState<PlatformerAction>;
  playerId: EntityId | null;
  score: number;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(Position3DDef);
  world.registerComponent(Velocity3DDef);
  world.registerComponent(ShapeAabb3DDef);
  world.registerComponent(GroundedDef);
  world.registerComponent(CoinValueDef);
  world.registerTag(PlayerTag);
  world.registerTag(StaticBodyTag);
  world.registerTag(CoinTag);
  return world;
}

function spawnPlayer(state: GameState, x: number, y: number, z: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x, y, z });
  state.world.getStore(Velocity3DDef).set(id, { vx: 0, vy: 0, vz: 0 });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: PLAYER_SIZE, h: PLAYER_SIZE, w: PLAYER_SIZE });
  state.world.getStore(GroundedDef).set(id, { onGround: false });
  state.world.getTag(PlayerTag).add(id);
  return id;
}

export function spawnPlatform(state: GameState, x: number, y: number, z: number, w: number, h: number, d: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x, y, z });
  state.world.getStore(ShapeAabb3DDef).set(id, { d, h, w });
  state.world.getTag(StaticBodyTag).add(id);
  return id;
}

export function spawnCoin(state: GameState, x: number, y: number, z: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Position3DDef).set(id, { x, y, z });
  state.world.getStore(ShapeAabb3DDef).set(id, { d: COIN_SIZE, h: COIN_SIZE, w: COIN_SIZE });
  state.world.getStore(CoinValueDef).set(id, { score: COIN_SCORE });
  state.world.getTag(CoinTag).add(id);
  return id;
}

export function despawn(state: GameState, id: EntityId): void {
  state.world.queueDestroy(id);
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.score = 0;
  state.cameraYaw = 0;
  state.playerId = spawnPlayer(state, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, PLAYER_SPAWN_Z);
  buildLevel(state);
}

/**
 * Positions are AABB **centers** (three.js-natural), not top-left like the
 * 2D platformer. Width/height/depth are full extents along X/Y/Z.
 */
function buildLevel(state: GameState): void {
  // Ground, with a hole in the middle so the player can fall off.
  spawnPlatform(state, -6, -0.5, 0, 8, 1, 12);
  spawnPlatform(state, 6, -0.5, 0, 8, 1, 12);
  spawnPlatform(state, 0, -0.5, -8, 4, 1, 4);

  // Floating platforms — staircased so each jump lands reliably with
  // JUMP_IMPULSE=13 / GRAVITY=28 (peak ≈ 3.0 world units).
  spawnPlatform(state, -2, 1.5, -4, 3, 0.5, 3);
  spawnPlatform(state, 2, 3, -2, 3, 0.5, 3);
  spawnPlatform(state, -4, 4.5, 0, 3, 0.5, 3);
  spawnPlatform(state, 0, 6, 2, 3, 0.5, 3);

  // Coins
  spawnCoin(state, -2, 2.5, -4);
  spawnCoin(state, 2, 4, -2);
  spawnCoin(state, -4, 5.5, 0);
  spawnCoin(state, 0, 7, 2);
  spawnCoin(state, 0, 0.5, -8);
}
