import type { EntityId } from '@pierre/ecs';
import type { GoapAction } from '@pierre/ecs/modules/goap';
import type { Vec2 } from '@pierre/ecs/modules/motion';

import { EcsWorld } from '@pierre/ecs';
import { PositionDef, VelocityDef } from '@pierre/ecs/modules/transform';

export { PositionDef, VelocityDef };

export const SCREEN_W = 800;
export const SCREEN_H = 600;

export const WORKER_COUNT = 3;
export const WORKER_RADIUS = 11;
export const WORKER_SPEED = 96;
export const REACH_DIST = 16;
export const ARRIVE_SLOW_RADIUS = 42;
export const CHOP_MS = 2000;
export const DROP_MS = 300;

export const AXE_RACK: Vec2 = { x: 120, y: 130 };
export const STORE: Vec2 = { x: 680, y: 500 };
export const TREES: Vec2[] = [
  { x: 210, y: 470 },
  { x: 410, y: 180 },
  { x: 560, y: 430 },
];

/**
 * A worker's blackboard: its real inventory (the facts the planner
 * derives each replan), the plan it's executing, and runtime scratch
 * (reserved tree, chop timer). Position/velocity live in ECS stores.
 */
export interface Worker {
  id: EntityId;
  delivered: number;
  hasAxe: boolean;
  hasWood: boolean;
  plan: GoapAction[] | null;
  planIndex: number;
  /** Human-readable plan for rendering, e.g. "GoToTree1 ▸ ChopTree1 ▸ …". */
  planLabel: string;
  /** Tree index this worker currently holds (chopping), or null. */
  reservedTree: number | null;
  timer: number;
}

export interface GameState {
  /** Set per-worker by the worker system so action handlers know whose blackboard they run. */
  activeWorker: Worker | null;
  dtMs: number;
  elapsedMs: number;
  /** Per-tree occupancy: the worker chopping tree i, or null if free. */
  treeOccupant: (EntityId | null)[];
  workers: Worker[];
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  return w;
}

export function workerPos(state: GameState, w: Worker): Vec2 {
  const p = state.world.getStore(PositionDef).get(w.id);
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
}

function spawnWorker(state: GameState, x: number, y: number): Worker {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  return {
    id,
    delivered: 0,
    hasAxe: false,
    hasWood: false,
    plan: null,
    planIndex: 0,
    planLabel: '',
    reservedTree: null,
    timer: 0,
  };
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.elapsedMs = 0;
  state.activeWorker = null;
  state.treeOccupant = TREES.map(() => null);
  state.workers = [];
  for (let i = 0; i < WORKER_COUNT; i++)
    state.workers.push(spawnWorker(state, 360 + i * 40, 320));
}
