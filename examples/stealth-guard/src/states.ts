import type { FsmStates } from '@pierre/ecs/modules/fsm';
import type { Vec2 } from '@pierre/ecs/modules/math';

import type { GameState, GuardBrain, GuardStateKey } from './game';

import {
  CHASE_SPEED,
  CONFIRM_MS,
  FORGET_MS,
  PATROL_SPEED,
  PositionDef,
  RETURN_SPEED,
  SEARCH_MS,
  SEARCH_SPEED,
  WAYPOINT_REACH,
} from './game';

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function guardPos(ctx: GameState, g: GuardBrain): Vec2 {
  const pos = ctx.world.getStore(PositionDef).get(g.id);
  return pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
}

/**
 * The guard's 5-state brain. States set `moveTarget` / `moveSpeed` /
 * `settle` for the movement step (which composes `modules/steering`), and
 * return a key to transition. Perception (`canSeePlayer`, `lastSeen`) is
 * filled in by the guard system before each tick.
 */
export const GUARD_STATES: FsmStates<GameState, GuardStateKey> = {
  chase: {
    update(ctx) {
      const g = ctx.activeGuard!;
      if (!g.canSeePlayer)
        return 'search';
      g.moveTarget = g.lastSeen;
      g.moveSpeed = CHASE_SPEED;
      g.settle = false;
      return null;
    },
  },

  patrol: {
    update(ctx) {
      const g = ctx.activeGuard!;
      if (g.canSeePlayer)
        return 'suspicious';
      const target = g.waypoints[g.waypointIndex];
      g.moveTarget = target;
      g.moveSpeed = PATROL_SPEED;
      g.settle = true;
      if (dist(guardPos(ctx, g), target) <= WAYPOINT_REACH)
        g.waypointIndex = (g.waypointIndex + 1) % g.waypoints.length;
      return null;
    },
  },

  return: {
    onEnter(ctx) {
      const g = ctx.activeGuard!;
      // Resume patrol at the nearest waypoint.
      const here = guardPos(ctx, g);
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < g.waypoints.length; i++) {
        const d = dist(here, g.waypoints[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      g.waypointIndex = best;
    },
    update(ctx) {
      const g = ctx.activeGuard!;
      if (g.canSeePlayer)
        return 'suspicious';
      const target = g.waypoints[g.waypointIndex];
      g.moveTarget = target;
      g.moveSpeed = RETURN_SPEED;
      g.settle = true;
      if (dist(guardPos(ctx, g), target) <= WAYPOINT_REACH)
        return 'patrol';
      return null;
    },
  },

  search: {
    onEnter(ctx) {
      const g = ctx.activeGuard!;
      g.moveTarget = g.lastSeen;
      g.moveSpeed = SEARCH_SPEED;
      g.settle = true;
    },
    update(ctx, self) {
      const g = ctx.activeGuard!;
      if (g.canSeePlayer)
        return 'chase';
      g.moveTarget = g.lastSeen;
      g.moveSpeed = SEARCH_SPEED;
      g.settle = true;
      if (self.elapsedMs >= SEARCH_MS)
        return 'return';
      return null;
    },
  },

  suspicious: {
    onEnter(ctx) {
      const g = ctx.activeGuard!;
      g.moveTarget = null; // stop and stare
    },
    update(ctx, self) {
      const g = ctx.activeGuard!;
      g.moveTarget = null;
      if (g.canSeePlayer && self.elapsedMs >= CONFIRM_MS)
        return 'chase';
      if (!g.canSeePlayer && self.elapsedMs >= FORGET_MS)
        return 'return';
      return null;
    },
  },
};
