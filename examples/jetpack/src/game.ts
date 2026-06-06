import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { Spawner } from '@pierre/ecs/modules/spawner';

import { EcsWorld } from '@pierre/ecs';
import { LifetimeDef, makeLifetime } from '@pierre/ecs/modules/lifetime';
import { clamp01, inverseLerp, lerp } from '@pierre/ecs/modules/math';
import { burst, ParticleDef, ParticleTag as ParticlesTag } from '@pierre/ecs/modules/particles';
import { OpacityDef } from '@pierre/ecs/modules/render-canvas2d';
import { resetSpawner } from '@pierre/ecs/modules/spawner';

import {
  ObstacleTag,
  ParticleTag,
  PlayerTag,
  PositionDef,
  RenderableDef,
  RenderOrderDef,
  SizeDef,
  VelocityDef,
} from './components';

export const SCREEN_W = 820;
export const SCREEN_H = 460;

export const FLOOR_H = 46;
export const FLOOR_Y = SCREEN_H - FLOOR_H;
export const CEIL_Y = 6;

export const PLAYER_X = 150;
export const PLAYER_W = 26;
export const PLAYER_H = 38;

export const GRAVITY = 2000;
export const THRUST_ACCEL = -3600;
export const MAX_VY = 760;
export const MIN_VY = -560;

export const SCROLL_START = 300;
export const SCROLL_MAX = 560;
export const SCROLL_RAMP = 5;

export const SPAWN_MS_START = 1200;
export const SPAWN_MS_MIN = 620;

export const BULLET_INTERVAL_MS = 70;
export const BULLET_SPEED = 920;

export type JetpackAction = 'thrust' | 'reset';

export interface GameState {
  best: number;
  bulletSpawner: Spawner;
  dead: boolean;
  /** Pixels scrolled, the raw distance the score derives from. */
  distance: number;
  dtMs: number;
  events: EventBus<never>;
  input: InputState<JetpackAction>;
  obstacleSpawner: Spawner;
  playerId: EntityId | null;
  score: number;
  scrollSpeed: number;
  started: boolean;
  thrusting: boolean;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(SizeDef);
  w.registerComponent(LifetimeDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerComponent(ParticleDef);
  w.registerComponent(OpacityDef);
  w.registerTag(PlayerTag);
  w.registerTag(ObstacleTag);
  w.registerTag(ParticleTag);
  w.registerTag(ParticlesTag);
  return w;
}

function spawnPlayer(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: PLAYER_X, y: FLOOR_Y - PLAYER_H });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(SizeDef).set(id, { h: PLAYER_H, w: PLAYER_W });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#ffce3a',
    h: PLAYER_H,
    kind: 'rect',
    lineWidth: 2,
    stroke: '#7a4a00',
    w: PLAYER_W,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 30 });
  state.world.getTag(PlayerTag).add(id);
  return id;
}

/**
 * Spawn a zapper off the right edge. Two flavours keep the field varied:
 * a tall vertical bar anchored to the floor or ceiling, or a floating
 * horizontal bar in mid-air. Both are lethal on contact.
 */
export function spawnObstacle(state: GameState): void {
  const id = state.world.createEntity();
  const vertical = Math.random() < 0.6;
  let w: number;
  let h: number;
  let y: number;

  if (vertical) {
    w = 16;
    h = 110 + Math.random() * 150;
    y = Math.random() < 0.5 ? CEIL_Y : FLOOR_Y - h;
  }
  else {
    w = 90 + Math.random() * 80;
    h = 16;
    const minY = CEIL_Y + 40;
    const maxY = FLOOR_Y - 80;
    y = minY + Math.random() * (maxY - minY);
  }

  state.world.getStore(PositionDef).set(id, { x: SCREEN_W + w, y });
  state.world.getStore(VelocityDef).set(id, { vx: -state.scrollSpeed, vy: 0 });
  state.world.getStore(SizeDef).set(id, { h, w });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#ff4d6d',
    h,
    kind: 'rect',
    lineWidth: 3,
    stroke: '#ffd23f',
    w,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 20 });
  state.world.getTag(ObstacleTag).add(id);
}

export function spawnBullet(state: GameState, x: number, y: number): void {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, {
    vx: BULLET_SPEED,
    vy: 120 + Math.random() * 180,
  });
  state.world.getStore(SizeDef).set(id, { h: 3, w: 8 });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'center',
    fill: '#fff3b0',
    h: 3,
    kind: 'rect',
    w: 8,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 25 });
  state.world.getTag(ParticleTag).add(id);
  state.world.getStore(LifetimeDef).set(id, makeLifetime(700));
}

export function spawnParticle(
  state: GameState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  lifeMs: number,
  fill: string,
  size: number,
): void {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx, vy });
  state.world.getStore(LifetimeDef).set(id, makeLifetime(lifeMs));
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'center',
    fill,
    h: size,
    kind: 'rect',
    w: size,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 28 });
  state.world.getTag(ParticleTag).add(id);
}

export function explode(state: GameState, x: number, y: number): void {
  burst(state.world, {
    colors: ['#ff7b00', '#ffd23f'],
    count: 26,
    fadeOut: true,
    lifetimeMs: [500, 900],
    position: { x, y },
    renderOrder: 28,
    size: [4, 8],
    speed: [120, 400],
  });
}

/** Obstacle cadence tightens as the run speeds up, with per-spawn jitter. */
export function nextObstacleIntervalMs(scrollSpeed: number): number {
  const t = clamp01(inverseLerp(300, SCROLL_MAX, scrollSpeed));
  const base = lerp(SPAWN_MS_START, SPAWN_MS_MIN, t);
  return base + Math.random() * 400;
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.dead = false;
  state.started = false;
  state.thrusting = false;
  state.score = 0;
  state.distance = 0;
  state.scrollSpeed = SCROLL_START;
  resetSpawner(state.obstacleSpawner, 0);
  resetSpawner(state.bulletSpawner, 0);
  state.playerId = spawnPlayer(state);
}
