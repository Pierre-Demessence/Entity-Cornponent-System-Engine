import type { EntityId } from '@pierre/ecs';
import type { PointerState } from '@pierre/ecs/modules/input';
import type { ContinuousHashGrid2D } from '@pierre/ecs/modules/spatial';

import { EcsWorld } from '@pierre/ecs';

import {
  BoidTag,
  FoodTag,
  PositionDef,
  VelocityDef,
  WanderDef,
} from './components';

export const SCREEN_W = 800;
export const SCREEN_H = 600;

/** Cell size for the neighbour grid — a bit larger than the flock radius. */
export const CELL_SIZE = 48;

export const BOID_COUNT = 140;
export const MAX_SPEED = 150; // px/s
export const MAX_FORCE = 260; // steering accel cap (px/s per s, roughly)

/** Radius within which boids see each other for flocking. */
export const NEIGHBOR_RADIUS = 42;
/** Boids flee the cursor only inside this radius. */
export const FLEE_RADIUS = 130;

export const FOOD_COUNT = 4;
/** Boids decelerate toward food inside this radius. */
export const FOOD_SLOW_RADIUS = 70;
/** A food is consumed (and relocated) when a boid gets this close. */
export const FOOD_EAT_RADIUS = 12;

/** Blend weights for the steering behaviours — the tuned "feel". */
export const WEIGHTS = {
  alignment: 1.0,
  cohesion: 0.9,
  flee: 2.6,
  food: 0.6,
  separation: 1.8,
  wander: 0.4,
} as const;

export const WANDER_PARAMS = {
  distance: 26,
  jitter: 0.5,
  radius: 16,
} as const;

export interface GameState {
  dtMs: number;
  elapsedMs: number;
  grid: ContinuousHashGrid2D;
  pointer: PointerState;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(WanderDef);
  w.registerTag(BoidTag);
  w.registerTag(FoodTag);
  return w;
}

function spawnBoid(state: GameState, x: number, y: number): EntityId {
  const id = state.world.createEntity();
  const angle = Math.random() * Math.PI * 2;
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, {
    vx: Math.cos(angle) * MAX_SPEED,
    vy: Math.sin(angle) * MAX_SPEED,
  });
  state.world.getStore(WanderDef).set(id, { angle: 0 });
  state.world.getTag(BoidTag).add(id);
  state.grid.add(id, x, y);
  return id;
}

export function spawnFood(state: GameState): EntityId {
  const id = state.world.createEntity();
  const x = 40 + Math.random() * (SCREEN_W - 80);
  const y = 40 + Math.random() * (SCREEN_H - 80);
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getTag(FoodTag).add(id);
  return id;
}

/** Move a consumed food to a fresh random location (recycled, not respawned). */
export function relocateFood(state: GameState, id: EntityId): void {
  const pos = state.world.getStore(PositionDef).get(id);
  if (!pos)
    return;
  pos.x = 40 + Math.random() * (SCREEN_W - 80);
  pos.y = 40 + Math.random() * (SCREEN_H - 80);
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.grid.clear();
  state.elapsedMs = 0;

  for (let i = 0; i < BOID_COUNT; i++) {
    spawnBoid(state, Math.random() * SCREEN_W, Math.random() * SCREEN_H);
  }
  for (let i = 0; i < FOOD_COUNT; i++) {
    spawnFood(state);
  }
}
