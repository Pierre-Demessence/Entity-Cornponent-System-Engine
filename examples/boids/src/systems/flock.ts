import type { EntityId, SchedulableSystem } from '@pierre/ecs';
import type { Neighbor, WeightedForce } from '@pierre/ecs/modules/steering';

import type { GameState } from '../game';

import {
  alignment,
  arrive,
  cohesion,
  combine,
  flee,
  separation,
  truncate,
  wander,
} from '@pierre/ecs/modules/steering';

import {
  BoidTag,
  FoodTag,
  PositionDef,
  VelocityDef,
  WanderDef,
} from '../components';
import {
  FLEE_RADIUS,
  FOOD_EAT_RADIUS,
  FOOD_SLOW_RADIUS,
  MAX_FORCE,
  MAX_SPEED,
  NEIGHBOR_RADIUS,
  relocateFood,
  WANDER_PARAMS,
  WEIGHTS,
} from '../game';

/**
 * The whole point of the example: drive every boid purely by composing
 * steering behaviours. Gathers flock neighbours from the spatial grid,
 * blends separation + alignment + cohesion + wander + cursor-flee +
 * food-arrive into one acceleration, and integrates it into velocity.
 * Position integration + toroidal wrap is left to `modules/motion`.
 */
export const flockSystem: SchedulableSystem<GameState> = {
  name: 'flock',
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    if (dt === 0)
      return;
    const posStore = ctx.world.getStore(PositionDef);
    const velStore = ctx.world.getStore(VelocityDef);
    const wanderStore = ctx.world.getStore(WanderDef);
    const { pointer } = ctx;

    const foods = collectFoods(ctx);

    for (const id of ctx.world.getTag(BoidTag)) {
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      const wanderState = wanderStore.get(id);
      if (!pos || !vel || !wanderState)
        continue;

      // Steering works in generic Vec2 {x,y}; VelocityDef is {vx,vy}, so
      // adapt at the boundary.
      const v = { x: vel.vx, y: vel.vy };
      const neighbors = collectNeighbors(ctx, id, pos.x, pos.y);
      const forces: WeightedForce[] = [
        { force: separation(pos, neighbors, v, MAX_SPEED), weight: WEIGHTS.separation },
        { force: alignment(v, neighbors, MAX_SPEED), weight: WEIGHTS.alignment },
        { force: cohesion(pos, neighbors, v, MAX_SPEED), weight: WEIGHTS.cohesion },
        { force: wander(v, wanderState, WANDER_PARAMS, MAX_SPEED), weight: WEIGHTS.wander },
      ];

      if (pointer.over) {
        const dc = Math.hypot(pointer.x - pos.x, pointer.y - pos.y);
        if (dc < FLEE_RADIUS)
          forces.push({ force: flee(pos, pointer, v, MAX_SPEED), weight: WEIGHTS.flee });
      }

      const food = nearestFood(foods, pos.x, pos.y);
      if (food) {
        forces.push({
          force: arrive(pos, food.pos, v, MAX_SPEED, FOOD_SLOW_RADIUS),
          weight: WEIGHTS.food,
        });
        if (food.dist < FOOD_EAT_RADIUS)
          relocateFood(ctx, food.id);
      }

      const accel = combine(forces, MAX_FORCE);
      const next = truncate({ x: vel.vx + accel.x * dt, y: vel.vy + accel.y * dt }, MAX_SPEED);
      vel.vx = next.x;
      vel.vy = next.y;
    }
  },
};

function collectNeighbors(ctx: GameState, self: EntityId, x: number, y: number): Neighbor[] {
  const posStore = ctx.world.getStore(PositionDef);
  const velStore = ctx.world.getStore(VelocityDef);
  const neighbors: Neighbor[] = [];
  for (const other of ctx.grid.queryNear(x, y, NEIGHBOR_RADIUS)) {
    if (other === self)
      continue;
    const op = posStore.get(other);
    const ov = velStore.get(other);
    if (!op || !ov)
      continue;
    // queryNear returns a whole-cell superset of the radius, so re-check.
    if (Math.hypot(op.x - x, op.y - y) <= NEIGHBOR_RADIUS)
      neighbors.push({ position: { x: op.x, y: op.y }, velocity: { x: ov.vx, y: ov.vy } });
  }
  return neighbors;
}

interface FoodEntry {
  id: EntityId;
  pos: { x: number; y: number };
}

function collectFoods(ctx: GameState): FoodEntry[] {
  const posStore = ctx.world.getStore(PositionDef);
  const foods: FoodEntry[] = [];
  for (const id of ctx.world.getTag(FoodTag)) {
    const p = posStore.get(id);
    if (p)
      foods.push({ id, pos: { x: p.x, y: p.y } });
  }
  return foods;
}

function nearestFood(foods: readonly FoodEntry[], x: number, y: number): { id: EntityId; pos: { x: number; y: number }; dist: number } | null {
  let best: { id: EntityId; pos: { x: number; y: number }; dist: number } | null = null;
  for (const f of foods) {
    const d = Math.hypot(f.pos.x - x, f.pos.y - y);
    if (!best || d < best.dist)
      best = { id: f.id, dist: d, pos: f.pos };
  }
  return best;
}
