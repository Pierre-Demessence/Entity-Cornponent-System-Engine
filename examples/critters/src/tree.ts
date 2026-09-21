import type { EntityId } from '@pierre/ecs';
import type { BtNode } from '@pierre/ecs/modules/behavior-tree';
import type { Vec2 } from '@pierre/ecs/modules/motion';

import type { GameState } from './game';

import { action, condition, selector, sequence } from '@pierre/ecs/modules/behavior-tree';
import { arrive, flee, truncate, wander } from '@pierre/ecs/modules/steering';

import {
  ARRIVE_SLOW_RADIUS,
  critterPos,
  EAT_DIST,
  ENERGY_RECOVER,
  FLEE_SPEED,
  FORAGE_SPEED,
  HOME_DIST,
  HOME_SPEED,
  HUNGRY_AT,
  PositionDef,
  relocateFood,
  RESTED_AT,
  THREAT_RADIUS,
  TIRED_AT,
  VelocityDef,
  WANDER_SPEED,
} from './game';

const ACCEL_GAIN = 9;
const WANDER_PARAMS = { distance: 24, jitter: 0.5, radius: 14 };

/** Integrate a steering force into the active critter's velocity (force model). */
function applyForce(ctx: GameState, force: Vec2, maxSpeed: number): void {
  const vel = ctx.world.getStore(VelocityDef).get(ctx.activeCritter!.id);
  if (!vel)
    return;
  const dt = ctx.dtMs / 1000;
  const next = truncate({ x: vel.vx + force.x * dt * ACCEL_GAIN, y: vel.vy + force.y * dt * ACCEL_GAIN }, maxSpeed);
  vel.vx = next.x;
  vel.vy = next.y;
}

function brake(ctx: GameState): void {
  const vel = ctx.world.getStore(VelocityDef).get(ctx.activeCritter!.id);
  if (!vel)
    return;
  vel.vx *= 0.8;
  vel.vy *= 0.8;
}

function nearestFood(ctx: GameState, from: Vec2): { id: EntityId; pos: Vec2; dist: number } | null {
  const posStore = ctx.world.getStore(PositionDef);
  let best: { id: EntityId; pos: Vec2; dist: number } | null = null;
  for (const id of ctx.foodIds) {
    const p = posStore.get(id);
    if (!p)
      continue;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (!best || d < best.dist)
      best = { id, dist: d, pos: { x: p.x, y: p.y } };
  }
  return best;
}

function vel(ctx: GameState): Vec2 {
  const v = ctx.world.getStore(VelocityDef).get(ctx.activeCritter!.id);
  return v ? { x: v.vx, y: v.vy } : { x: 0, y: 0 };
}

// -- Conditions -------------------------------------------------------

const isThreatened = condition<GameState>((ctx) => {
  const c = ctx.activeCritter!;
  if (!ctx.pointer.over)
    return false;
  const p = critterPos(ctx, c);
  return Math.hypot(ctx.pointer.x - p.x, ctx.pointer.y - p.y) < THREAT_RADIUS;
});

const isHungry = condition<GameState>(ctx => ctx.activeCritter!.hunger >= HUNGRY_AT);
const isTired = condition<GameState>(ctx => ctx.activeCritter!.energy <= TIRED_AT);

// -- Actions ----------------------------------------------------------

const fleeThreat = action<GameState>((ctx) => {
  const c = ctx.activeCritter!;
  c.behavior = 'flee';
  const pos = critterPos(ctx, c);
  applyForce(ctx, flee(pos, { x: ctx.pointer.x, y: ctx.pointer.y }, vel(ctx), FLEE_SPEED), FLEE_SPEED);
  return 'running';
});

const seekFood = action<GameState>((ctx) => {
  const c = ctx.activeCritter!;
  const pos = critterPos(ctx, c);
  const food = nearestFood(ctx, pos);
  if (!food) {
    c.targetFood = null;
    return 'failure';
  }
  c.targetFood = food.id;
  if (food.dist <= EAT_DIST)
    return 'success'; // arrived — let the eat leaf run this tick
  c.behavior = 'seekFood';
  applyForce(ctx, arrive(pos, food.pos, vel(ctx), FORAGE_SPEED, ARRIVE_SLOW_RADIUS), FORAGE_SPEED);
  return 'running';
});

const eat = action<GameState>((ctx) => {
  const c = ctx.activeCritter!;
  if (c.targetFood === null)
    return 'failure';
  c.behavior = 'eat';
  c.hunger = 0;
  relocateFood(ctx, c.targetFood);
  c.targetFood = null;
  brake(ctx);
  return 'success';
});

const seekHome = action<GameState>((ctx) => {
  const c = ctx.activeCritter!;
  const pos = critterPos(ctx, c);
  if (Math.hypot(c.home.x - pos.x, c.home.y - pos.y) <= HOME_DIST)
    return 'success';
  c.behavior = 'seekHome';
  applyForce(ctx, arrive(pos, c.home, vel(ctx), HOME_SPEED, ARRIVE_SLOW_RADIUS), HOME_SPEED);
  return 'running';
});

const rest = action<GameState>((ctx) => {
  const c = ctx.activeCritter!;
  c.behavior = 'rest';
  brake(ctx);
  c.energy = Math.min(1, c.energy + ENERGY_RECOVER * (ctx.dtMs / 1000));
  if (c.energy >= RESTED_AT)
    return 'success';
  return 'running';
});

const wanderAbout = action<GameState>((ctx) => {
  const c = ctx.activeCritter!;
  c.behavior = 'wander';
  applyForce(ctx, wander(vel(ctx), c.wander, WANDER_PARAMS, WANDER_SPEED), WANDER_SPEED);
  return 'running';
});

/**
 * The shared critter brain. A selector picks the first branch that isn't
 * failing, so priorities read top-to-bottom: survive (flee) > eat when
 * hungry > sleep when tired > wander. Each need is a sequence gated by its
 * condition; `running` leaves hold the selector on that branch until the
 * need is met.
 */
export const CRITTER_BT: BtNode<GameState> = selector<GameState>(
  sequence(isThreatened, fleeThreat),
  sequence(isHungry, seekFood, eat),
  sequence(isTired, seekHome, rest),
  wanderAbout,
);
