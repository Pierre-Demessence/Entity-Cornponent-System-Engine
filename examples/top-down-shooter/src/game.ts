import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { HashGrid2D } from '@pierre/ecs/modules/spatial';

import { EcsWorld } from '@pierre/ecs';
import { OpacityDef, RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { cellOfPoint } from '@pierre/ecs/modules/spatial';

import {
  BulletTag,
  EnemyTag,
  LifetimeDef,
  PlayerTag,
  PositionDef,
  RotationDef,
  ShapeCircleDef,
  VelocityDef,
} from './components';

export const SCREEN_W = 800;
export const SCREEN_H = 600;
export const CELL_SIZE = 64;

export const PLAYER_RADIUS = 12;
export const PLAYER_SPEED = 220;

export const ENEMY_RADIUS = 10;
export const ENEMY_SPEED = 70;
export const ENEMY_SPAWN_INTERVAL_MS = 650;
export const ENEMY_SPAWN_RAMP_MS = 18000;
export const ENEMY_SPAWN_MIN_MS = 120;

export const BULLET_SPEED = 560;
export const BULLET_LIFE_MS = 700;
export const BULLET_RADIUS = 3;
export const FIRE_COOLDOWN_MS = 110;

export const SCORE_PER_KILL = 10;

export type ShooterEvent
  = | { type: 'EnemyKilled'; enemyId: EntityId }
    | { type: 'PlayerHit' }
    | { type: 'GameOver' };

export type ShooterAction = 'down' | 'fire' | 'left' | 'reset' | 'right' | 'up';

export interface Aim {
  /** Pointer position in canvas coordinates. Updated by mousemove listener. */
  x: number;
  y: number;
}

export interface GameState {
  aim: Aim;
  dead: boolean;
  dtMs: number;
  elapsedMs: number;
  events: EventBus<ShooterEvent>;
  fireCooldownMs: number;
  /** True while LMB is held. Edge detection lives in input state for keyboard fire. */
  fireHeld: boolean;
  grid: HashGrid2D;
  input: InputState<ShooterAction>;
  playerId: EntityId | null;
  score: number;
  spawnTimerMs: number;
  world: EcsWorld;
}

export function cellOf(x: number, y: number): { x: number; y: number } {
  return cellOfPoint(x, y, CELL_SIZE);
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(RotationDef);
  w.registerComponent(ShapeCircleDef);
  w.registerComponent(LifetimeDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerComponent(OpacityDef);
  w.registerTag(PlayerTag);
  w.registerTag(EnemyTag);
  w.registerTag(BulletTag);
  return w;
}

export function spawnPlayer(state: GameState): EntityId {
  const id = state.world.createEntity();
  const x = SCREEN_W / 2;
  const y = SCREEN_H / 2;
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(RotationDef).set(id, { angle: 0 });
  state.world.getStore(ShapeCircleDef).set(id, { radius: PLAYER_RADIUS });
  state.world.getStore(RenderableDef).set(id, {
    closed: true,
    fill: '#234',
    kind: 'polygon',
    lineWidth: 2,
    stroke: '#8cf',
    points: [
      { x: PLAYER_RADIUS, y: 0 },
      { x: -PLAYER_RADIUS * 0.7, y: PLAYER_RADIUS * 0.7 },
      { x: -PLAYER_RADIUS * 0.4, y: 0 },
      { x: -PLAYER_RADIUS * 0.7, y: -PLAYER_RADIUS * 0.7 },
    ],
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 10 });
  state.world.getTag(PlayerTag).add(id);
  const c = cellOf(x, y);
  state.grid.add(id, c.x, c.y);
  return id;
}

export function spawnEnemy(state: GameState, x: number, y: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(ShapeCircleDef).set(id, { radius: ENEMY_RADIUS });
  state.world.getStore(RenderableDef).set(id, {
    fill: '#511',
    kind: 'circle',
    lineWidth: 1.5,
    radius: ENEMY_RADIUS,
    stroke: '#f76',
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 5 });
  state.world.getTag(EnemyTag).add(id);
  const c = cellOf(x, y);
  state.grid.add(id, c.x, c.y);
  return id;
}

export function spawnBullet(state: GameState, x: number, y: number, angle: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, {
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
  });
  state.world.getStore(ShapeCircleDef).set(id, { radius: BULLET_RADIUS });
  state.world.getStore(LifetimeDef).set(id, { remainingMs: BULLET_LIFE_MS });
  state.world.getStore(RenderableDef).set(id, {
    fill: '#fe6',
    kind: 'circle',
    radius: BULLET_RADIUS,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 3 });
  state.world.getTag(BulletTag).add(id);
  const c = cellOf(x, y);
  state.grid.add(id, c.x, c.y);
  return id;
}

export function despawn(state: GameState, id: EntityId): void {
  const pos = state.world.getStore(PositionDef).get(id);
  if (pos) {
    const c = cellOf(pos.x, pos.y);
    state.grid.remove(id, c.x, c.y);
  }
  state.world.queueDestroy(id);
}

function randomEdgePoint(): { x: number; y: number } {
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0:
      return { x: Math.random() * SCREEN_W, y: 0 };
    case 1:
      return { x: SCREEN_W, y: Math.random() * SCREEN_H };
    case 2:
      return { x: Math.random() * SCREEN_W, y: SCREEN_H };
    default:
      return { x: 0, y: Math.random() * SCREEN_H };
  }
}

export function spawnEnemyAtEdge(state: GameState): void {
  const p = randomEdgePoint();
  spawnEnemy(state, p.x, p.y);
}

/**
 * Enemy spawn interval decays from ENEMY_SPAWN_INTERVAL_MS toward
 * ENEMY_SPAWN_MIN_MS over ENEMY_SPAWN_RAMP_MS of game time, producing a
 * linear difficulty ramp. Chosen to give ~30 s of manageable play before
 * the arena saturates, giving a useful perf stress window for the
 * postmortem.
 */
export function currentSpawnInterval(elapsedMs: number): number {
  const t = Math.min(1, elapsedMs / ENEMY_SPAWN_RAMP_MS);
  return ENEMY_SPAWN_INTERVAL_MS + (ENEMY_SPAWN_MIN_MS - ENEMY_SPAWN_INTERVAL_MS) * t;
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.grid.clear();

  state.score = 0;
  state.dead = false;
  state.fireCooldownMs = 0;
  state.spawnTimerMs = 0;
  state.elapsedMs = 0;
  state.aim.x = SCREEN_W / 2;
  state.aim.y = SCREEN_H / 2 - 1;

  state.playerId = spawnPlayer(state);
}
