import type {
  EntityId,
  EventBus,
} from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { HashGrid2D } from '@pierre/ecs/modules/spatial';

import {
  EcsWorld,

} from '@pierre/ecs';
import { RenderableDef } from '@pierre/ecs/modules/render-canvas2d';
import { cellsForAabb as cellsForAabbEngine } from '@pierre/ecs/modules/spatial';

import {
  CoinTag,
  CoinValueDef,
  DynamicBodyTag,
  GroundedDef,
  PlayerTag,
  PositionDef,
  ShapeAabbDef,
  StaticBodyTag,
  VelocityDef,
} from './components';

// Screen and world
export const SCREEN_W = 800;
export const SCREEN_H = 600;
export const CELL_SIZE = 64;

// Physics
export const GRAVITY = 1200;
export const MOVE_SPEED = 240;
export const JUMP_IMPULSE = 520;
export const MAX_FALL_SPEED = 900;

// Player
export const PLAYER_W = 24;
export const PLAYER_H = 32;
export const PLAYER_SPAWN_X = 80;
export const PLAYER_SPAWN_Y = 100;

// Coin
export const COIN_W = 14;
export const COIN_H = 14;
export const COIN_SCORE = 10;

// World out-of-bounds
export const RESPAWN_Y = 700;

export type PlatformerEvent
  = | { type: 'CoinCollected'; coinId: EntityId; score: number }
    | { type: 'PlayerFell' };

export type PlatformerAction = 'jump' | 'left' | 'right';

export interface GameState {
  dtMs: number;
  events: EventBus<PlatformerEvent>;
  grid: HashGrid2D;
  input: InputState<PlatformerAction>;
  playerId: EntityId | null;
  score: number;
  world: EcsWorld;
}

/** Iterate every cell key an AABB overlaps. */
export function cellsForAabb(
  x: number,
  y: number,
  w: number,
  h: number,
): Generator<{ x: number; y: number }> {
  return cellsForAabbEngine(x, y, w, h, CELL_SIZE);
}

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(VelocityDef);
  world.registerComponent(ShapeAabbDef);
  world.registerComponent(GroundedDef);
  world.registerComponent(CoinValueDef);
  world.registerComponent(RenderableDef);
  world.registerTag(PlayerTag);
  world.registerTag(StaticBodyTag);
  world.registerTag(DynamicBodyTag);
  world.registerTag(CoinTag);
  return world;
}

/** Index a static body into every cell its AABB overlaps. */
function indexStatic(state: GameState, id: EntityId, x: number, y: number, w: number, h: number): void {
  for (const c of cellsForAabb(x, y, w, h)) state.grid.add(id, c.x, c.y);
}

/** Reverse of indexStatic. Must be called BEFORE the aabb/position is lost. */
function unindexStatic(state: GameState, id: EntityId, x: number, y: number, w: number, h: number): void {
  for (const c of cellsForAabb(x, y, w, h)) state.grid.remove(id, c.x, c.y);
}

export function spawnPlayer(state: GameState, x: number, y: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(ShapeAabbDef).set(id, { h: PLAYER_H, w: PLAYER_W });
  state.world.getStore(GroundedDef).set(id, { onGround: false });
  state.world.getStore(RenderableDef).set(id, {
    fill: '#58c4ff',
    h: PLAYER_H,
    kind: 'rect',
    w: PLAYER_W,
  });
  state.world.getTag(PlayerTag).add(id);
  state.world.getTag(DynamicBodyTag).add(id);
  // Dynamic bodies are NOT indexed into the grid; they query against statics.
  return id;
}

export function spawnPlatform(state: GameState, x: number, y: number, w: number, h: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(ShapeAabbDef).set(id, { h, w });
  state.world.getStore(RenderableDef).set(id, {
    fill: '#5a6577',
    h,
    kind: 'rect',
    lineWidth: 1,
    stroke: '#8aa0bd',
    w,
  });
  state.world.getTag(StaticBodyTag).add(id);
  indexStatic(state, id, x, y, w, h);
  return id;
}

export function spawnCoin(state: GameState, x: number, y: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(ShapeAabbDef).set(id, { h: COIN_H, w: COIN_W });
  state.world.getStore(CoinValueDef).set(id, { score: COIN_SCORE });
  // `anchor: 'top-left'` draws the circle centred on the AABB midpoint
  // without splitting PositionDef's physics-side (top-left) semantics.
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#f4c542',
    kind: 'circle',
    radius: COIN_W / 2,
  });
  state.world.getTag(CoinTag).add(id);
  // Coins are not solid bodies and not indexed: pickup iterates CoinTag directly.
  return id;
}

export function despawn(state: GameState, id: EntityId): void {
  // Only StaticBodyTag entities are indexed in the grid; dynamics and coins are not.
  if (state.world.getTag(StaticBodyTag).has(id)) {
    const pos = state.world.getStore(PositionDef).get(id);
    const aabb = state.world.getStore(ShapeAabbDef).get(id);
    if (pos && aabb)
      unindexStatic(state, id, pos.x, pos.y, aabb.w, aabb.h);
  }
  state.world.queueDestroy(id);
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.grid.clear();
  state.score = 0;
  state.playerId = spawnPlayer(state, PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
  buildLevel(state);
}

/** Build a single hand-crafted level: ground + 4 floating platforms + 5 coins. */
function buildLevel(state: GameState): void {
  // Ground with a pit in the middle so the player can fall off.
  spawnPlatform(state, 0, 560, 500, 40);
  spawnPlatform(state, 620, 560, 180, 40);

  // Floating platforms
  spawnPlatform(state, 160, 460, 120, 16);
  spawnPlatform(state, 360, 380, 120, 16);
  spawnPlatform(state, 560, 300, 120, 16);
  spawnPlatform(state, 300, 200, 120, 16);

  // Coins (positioned above platforms / at jumps)
  spawnCoin(state, 210, 430);
  spawnCoin(state, 410, 350);
  spawnCoin(state, 610, 270);
  spawnCoin(state, 350, 170);
  spawnCoin(state, 680, 520);
}
