import type { SchedulableSystem } from '@pierre/ecs';
import type { Vec2 } from '@pierre/ecs/modules/motion';

import type { GameState, GuardBrain, Wall } from './game';

import { tickFsm } from '@pierre/ecs/modules/fsm';
import { clamp } from '@pierre/ecs/modules/math';
import { scaleToSpeed } from '@pierre/ecs/modules/motion';
import { arrive, combine, seek, truncate } from '@pierre/ecs/modules/steering';

import {
  CATCH_DIST,
  GUARD_RADIUS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PositionDef,
  VelocityDef,
} from './game';
import { GUARD_STATES } from './states';
import { guardSeesPlayer } from './vision';

const ARRIVE_SLOW_RADIUS = 44;
const WALL_AVOID_RADIUS = 46;

/** WASD / arrows → player velocity. */
export const playerInputSystem: SchedulableSystem<GameState> = {
  name: 'player-input',
  run(ctx) {
    const vel = ctx.world.getStore(VelocityDef).get(ctx.playerId);
    if (!vel)
      return;
    const dx = (ctx.input.isDown('right') ? 1 : 0) - (ctx.input.isDown('left') ? 1 : 0);
    const dy = (ctx.input.isDown('down') ? 1 : 0) - (ctx.input.isDown('up') ? 1 : 0);
    const v = scaleToSpeed(dx, dy, PLAYER_SPEED);
    vel.vx = v.x;
    vel.vy = v.y;
  },
};

/**
 * The guard brains. Per guard: refresh perception (vision cone + LoS),
 * run the FSM, then apply the state's movement intent via
 * `modules/steering` and update the vision facing. This is the FSM (brain)
 * + steering (muscles) composition the example exists to prove.
 */
export const guardSystem: SchedulableSystem<GameState> = {
  name: 'guard',
  runAfter: ['player-input'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(PositionDef);
    const velStore = ctx.world.getStore(VelocityDef);
    const player = posStore.get(ctx.playerId);
    if (!player)
      return;
    const playerVec: Vec2 = { x: player.x, y: player.y };

    for (const g of ctx.guards) {
      const pos = posStore.get(g.id);
      const vel = velStore.get(g.id);
      if (!pos || !vel)
        continue;

      g.canSeePlayer = guardSeesPlayer(g, pos, playerVec, ctx.walls);
      if (g.canSeePlayer)
        g.lastSeen = { x: playerVec.x, y: playerVec.y };

      ctx.activeGuard = g;
      tickFsm(g.fsm, GUARD_STATES, ctx, ctx.dtMs);
      ctx.activeGuard = null;

      applyMovement(g, pos, vel, dt, ctx.walls);
      updateFacing(g, pos);
    }
  },
};

function applyMovement(g: GuardBrain, pos: Vec2, vel: { vx: number; vy: number }, dt: number, walls: readonly Wall[]): void {
  if (!g.moveTarget) {
    vel.vx *= 0.8; // ease to a stop while standing (suspicious)
    vel.vy *= 0.8;
    return;
  }
  const v = { x: vel.vx, y: vel.vy };
  const moveForce = g.settle
    ? arrive(pos, g.moveTarget, v, g.moveSpeed, ARRIVE_SLOW_RADIUS)
    : seek(pos, g.moveTarget, v, g.moveSpeed);
  // Blend the state's seek/arrive with a wall-avoidance push so guards
  // curve around cover instead of pinning against it (the FSM decides
  // *where*; steering.combine decides *how* to get there past walls).
  const accel = combine([
    { force: moveForce, weight: 1 },
    { force: avoidWalls(pos, v, walls, g.moveSpeed), weight: 1.8 },
  ], g.moveSpeed * 12);
  const next = truncate({ x: v.x + accel.x * dt, y: v.y + accel.y * dt }, g.moveSpeed);
  vel.vx = next.x;
  vel.vy = next.y;
}

/**
 * A steering force away from nearby wall surfaces. Radial repulsion from
 * each wall's closest point, plus a consistent tangential (CCW) component
 * so a guard slides around a wall sitting head-on between it and its
 * target rather than stalling in the repulsion/seek deadlock.
 */
function avoidWalls(pos: Vec2, vel: Vec2, walls: readonly Wall[], maxSpeed: number): Vec2 {
  let px = 0;
  let py = 0;
  for (const w of walls) {
    const cx = clamp(pos.x, w.x, w.x + w.w);
    const cy = clamp(pos.y, w.y, w.y + w.h);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= WALL_AVOID_RADIUS)
      continue;
    const strength = (WALL_AVOID_RADIUS - d) / WALL_AVOID_RADIUS;
    if (d > 1e-4) {
      const nx = dx / d;
      const ny = dy / d;
      px += nx * strength - ny * strength * 0.7;
      py += ny * strength + nx * strength * 0.7;
    }
    else {
      py -= strength; // exactly on the wall centre: pop upward
    }
  }
  if (px === 0 && py === 0)
    return { x: 0, y: 0 };
  const desired = scaleToSpeed(px, py, maxSpeed);
  return { x: desired.x - vel.x, y: desired.y - vel.y };
}

function updateFacing(g: GuardBrain, pos: Vec2): void {
  const look = g.moveTarget ?? g.lastSeen;
  if (!look)
    return;
  const dx = look.x - pos.x;
  const dy = look.y - pos.y;
  if (Math.hypot(dx, dy) > 1e-3)
    g.facing = Math.atan2(dy, dx);
}

/** Push every mover out of walls after integration (circle vs AABB). */
export const wallCollisionSystem: SchedulableSystem<GameState> = {
  name: 'wall-collision',
  runAfter: ['motion'],
  run(ctx) {
    const posStore = ctx.world.getStore(PositionDef);
    const player = posStore.get(ctx.playerId);
    if (player)
      resolveWalls(player, PLAYER_RADIUS, ctx.walls);
    for (const g of ctx.guards) {
      const pos = posStore.get(g.id);
      if (pos)
        resolveWalls(pos, GUARD_RADIUS, ctx.walls);
    }
  },
};

function resolveWalls(pos: { x: number; y: number }, r: number, walls: readonly Wall[]): void {
  for (const w of walls) {
    const cx = clamp(pos.x, w.x, w.x + w.w);
    const cy = clamp(pos.y, w.y, w.y + w.h);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r)
      continue;
    const d = Math.sqrt(d2);
    if (d < 1e-4) {
      pos.y = w.y - r; // degenerate: sitting on the wall centre, pop upward
      continue;
    }
    const push = r - d;
    pos.x += (dx / d) * push;
    pos.y += (dy / d) * push;
  }
}

/** Any guard within catch distance of the player ends the run. */
export const catchSystem: SchedulableSystem<GameState> = {
  name: 'catch',
  runAfter: ['wall-collision'],
  run(ctx) {
    if (ctx.caught)
      return;
    const posStore = ctx.world.getStore(PositionDef);
    const player = posStore.get(ctx.playerId);
    if (!player)
      return;
    for (const g of ctx.guards) {
      const pos = posStore.get(g.id);
      if (pos && Math.hypot(pos.x - player.x, pos.y - player.y) < CATCH_DIST) {
        ctx.caught = true;
        return;
      }
    }
  },
};
