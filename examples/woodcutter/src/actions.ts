import type { GoapAction, WorldState } from '@pierre/ecs/modules/goap';
import type { Vec2 } from '@pierre/ecs/modules/motion';

import type { GameState, Worker } from './game';

import { arrive, truncate } from '@pierre/ecs/modules/steering';

import {
  ARRIVE_SLOW_RADIUS,
  AXE_RACK,
  CHOP_MS,
  DROP_MS,
  REACH_DIST,
  STORE,
  TREES,
  VelocityDef,
  WORKER_SPEED,
  workerPos,
} from './game';

/** Runtime status of an action being executed in the world. */
export type ExecStatus = 'failure' | 'running' | 'success';

const ACCEL_GAIN = 10;

export const GOAL: WorldState = { delivered: true };

/** Effects that clear every `atTreeN` except `except` (−1 clears all). */
function clearTrees(except: number): WorldState {
  const e: WorldState = {};
  for (let j = 0; j < TREES.length; j++) {
    if (j !== except)
      e[`atTree${j}`] = false;
  }
  return e;
}

/**
 * Build the planner's action set for a worker at `from`. `GoToTree{i}` cost
 * is distance-based, so the planner prefers the *nearest* free tree — the
 * GOAP-native way to spread workers out (cost drives A*), while `ChopTree{i}`
 * requires `tree{i}Free`, so an occupied tree is avoided at plan time.
 */
export function buildActions(from: Vec2): GoapAction[] {
  const actions: GoapAction[] = [
    { name: 'GetAxe', cost: 1, effects: { hasAxe: true }, preconditions: { hasAxe: false } },
  ];
  for (let i = 0; i < TREES.length; i++) {
    const dist = Math.hypot(TREES[i].x - from.x, TREES[i].y - from.y);
    actions.push({
      name: `GoToTree${i}`,
      cost: 1 + dist / 120,
      effects: { [`atTree${i}`]: true, atStore: false, ...clearTrees(i) },
      preconditions: {},
    });
    actions.push({
      name: `ChopTree${i}`,
      cost: 1,
      effects: { hasWood: true },
      preconditions: { [`atTree${i}`]: true, [`tree${i}Free`]: true, hasAxe: true, hasWood: false },
    });
  }
  actions.push({
    name: 'GoToStore',
    cost: 1,
    effects: { atStore: true, ...clearTrees(-1) },
    preconditions: {},
  });
  actions.push({
    name: 'DropWood',
    cost: 1,
    effects: { delivered: true, hasWood: false },
    preconditions: { atStore: true, hasWood: true },
  });
  return actions;
}

/** Derive the current world facts for a worker from real game state. */
export function buildFacts(state: GameState, w: Worker): WorldState {
  const pos = workerPos(state, w);
  const facts: WorldState = {};
  if (w.hasAxe)
    facts.hasAxe = true;
  if (w.hasWood)
    facts.hasWood = true;
  if (Math.hypot(STORE.x - pos.x, STORE.y - pos.y) <= REACH_DIST)
    facts.atStore = true;
  for (let i = 0; i < TREES.length; i++) {
    if (Math.hypot(TREES[i].x - pos.x, TREES[i].y - pos.y) <= REACH_DIST)
      facts[`atTree${i}`] = true;
    const occ = state.treeOccupant[i];
    if (occ === null || occ === w.id)
      facts[`tree${i}Free`] = true;
  }
  return facts;
}

function moveTo(ctx: GameState, target: Vec2, speed: number): ExecStatus {
  const w = ctx.activeWorker!;
  const pos = workerPos(ctx, w);
  if (Math.hypot(target.x - pos.x, target.y - pos.y) <= REACH_DIST) {
    brake(ctx);
    return 'success';
  }
  const vel = ctx.world.getStore(VelocityDef).get(w.id);
  if (!vel)
    return 'failure';
  const dt = ctx.dtMs / 1000;
  const force = arrive(pos, target, { x: vel.vx, y: vel.vy }, speed, ARRIVE_SLOW_RADIUS);
  const next = truncate({ x: vel.vx + force.x * dt * ACCEL_GAIN, y: vel.vy + force.y * dt * ACCEL_GAIN }, speed);
  vel.vx = next.x;
  vel.vy = next.y;
  return 'running';
}

function brake(ctx: GameState): void {
  const vel = ctx.world.getStore(VelocityDef).get(ctx.activeWorker!.id);
  if (!vel)
    return;
  vel.vx *= 0.6;
  vel.vy *= 0.6;
}

/**
 * Chop tree `i`. Reserve it when work starts; if another worker holds it,
 * fail so the plan-runner replans onto a different free tree.
 */
function chop(ctx: GameState, i: number): ExecStatus {
  const w = ctx.activeWorker!;
  const occ = ctx.treeOccupant[i];
  if (occ !== null && occ !== w.id)
    return 'failure';
  ctx.treeOccupant[i] = w.id;
  w.reservedTree = i;
  brake(ctx);
  w.timer += ctx.dtMs;
  if (w.timer >= CHOP_MS) {
    w.timer = 0;
    w.hasWood = true;
    ctx.treeOccupant[i] = null;
    w.reservedTree = null;
    return 'success';
  }
  return 'running';
}

/** name → world-executor. Movement actions drive velocity via steering. */
export const RUNTIME: Record<string, (ctx: GameState) => ExecStatus> = {
  DropWood(ctx) {
    const w = ctx.activeWorker!;
    brake(ctx);
    w.timer += ctx.dtMs;
    if (w.timer >= DROP_MS) {
      w.timer = 0;
      w.hasWood = false;
      w.delivered++;
      return 'success';
    }
    return 'running';
  },
  GetAxe(ctx) {
    const status = moveTo(ctx, AXE_RACK, WORKER_SPEED);
    if (status === 'success')
      ctx.activeWorker!.hasAxe = true;
    return status;
  },
  GoToStore(ctx) {
    return moveTo(ctx, STORE, WORKER_SPEED);
  },
};

for (let i = 0; i < TREES.length; i++) {
  const tree = TREES[i];
  RUNTIME[`GoToTree${i}`] = ctx => moveTo(ctx, tree, WORKER_SPEED);
  RUNTIME[`ChopTree${i}`] = ctx => chop(ctx, i);
}
