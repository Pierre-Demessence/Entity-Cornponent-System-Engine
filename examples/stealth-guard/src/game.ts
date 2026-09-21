import type { EntityId } from '@pierre/ecs';
import type { Fsm } from '@pierre/ecs/modules/fsm';
import type { InputState } from '@pierre/ecs/modules/input';
import type { Vec2 } from '@pierre/ecs/modules/motion';

import { EcsWorld } from '@pierre/ecs';
import { makeFsm } from '@pierre/ecs/modules/fsm';
import { PositionDef, VelocityDef } from '@pierre/ecs/modules/transform';

export { PositionDef, VelocityDef };

export const SCREEN_W = 800;
export const SCREEN_H = 600;

export const PLAYER_SPEED = 145;

export const PATROL_SPEED = 58;
export const CHASE_SPEED = 132;
export const SEARCH_SPEED = 72;
export const RETURN_SPEED = 92;

export const VISION_RANGE = 185;
export const VISION_HALF_ANGLE = Math.PI / 5;

/** Continuous sight this long → escalate suspicious → chase. */
export const CONFIRM_MS = 480;
/** No sight this long while suspicious → give up → return. */
export const FORGET_MS = 1100;
/** Time spent searching last-known position before returning to patrol. */
export const SEARCH_MS = 3200;

export const CATCH_DIST = 16;
export const WAYPOINT_REACH = 12;
export const GUARD_RADIUS = 12;
export const PLAYER_RADIUS = 10;

export type Action = 'down' | 'left' | 'reset' | 'right' | 'up';

export type GuardStateKey = 'chase' | 'patrol' | 'return' | 'search' | 'suspicious';

export interface Wall {
  h: number;
  w: number;
  x: number;
  y: number;
}

/**
 * A guard's brain: the FSM runtime value plus the perception + movement
 * scratch the state handlers read/write. Kept as a plain object parallel
 * to the ECS entity (position/velocity live in stores) — this is the
 * "controller" layer, not component data.
 */
export interface GuardBrain {
  id: EntityId;
  /** True this tick iff the guard currently sees the player. */
  canSeePlayer: boolean;
  /** Vision-cone direction, radians. */
  facing: number;
  fsm: Fsm<GuardStateKey>;
  /** Freshest known player position, set by the vision system when seen. */
  lastSeen: Vec2 | null;
  moveSpeed: number;
  /** Movement target set by the current state, consumed by the move step. */
  moveTarget: Vec2 | null;
  /** `true` → decelerate/settle at the target (arrive); `false` → seek. */
  settle: boolean;
  waypointIndex: number;
  waypoints: Vec2[];
}

export interface GameState {
  /** Set per-guard by the FSM system so state handlers know whose brain they run. */
  activeGuard: GuardBrain | null;
  caught: boolean;
  dtMs: number;
  elapsedMs: number;
  guards: GuardBrain[];
  input: InputState<Action>;
  playerId: EntityId;
  walls: Wall[];
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  return w;
}

export function playerPos(state: GameState): Vec2 {
  const p = state.world.getStore(PositionDef).get(state.playerId);
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
}

function spawnMover(state: GameState, x: number, y: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  return id;
}

function makeGuard(state: GameState, waypoints: Vec2[]): GuardBrain {
  const start = waypoints[0];
  const id = spawnMover(state, start.x, start.y);
  return {
    id,
    canSeePlayer: false,
    facing: 0,
    fsm: makeFsm<GuardStateKey>('patrol'),
    lastSeen: null,
    moveSpeed: PATROL_SPEED,
    moveTarget: null,
    settle: true,
    waypointIndex: 0,
    waypoints,
  };
}

export const WALLS: Wall[] = [
  { h: 170, w: 24, x: 300, y: 150 },
  { h: 200, w: 24, x: 500, y: 300 },
  { h: 24, w: 180, x: 360, y: 430 },
];

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.elapsedMs = 0;
  state.caught = false;
  state.activeGuard = null;
  state.walls = WALLS;

  state.playerId = spawnMover(state, 80, SCREEN_H - 80);

  state.guards = [
    makeGuard(state, [
      { x: 140, y: 90 },
      { x: 450, y: 90 },
      { x: 450, y: 360 },
      { x: 140, y: 360 },
    ]),
    makeGuard(state, [
      { x: 600, y: 110 },
      { x: 600, y: 540 },
      { x: 720, y: 540 },
      { x: 720, y: 110 },
    ]),
  ];
}
