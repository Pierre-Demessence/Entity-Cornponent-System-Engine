import type { RandomFn } from '@pierre/ecs/modules/rng';

import type { Dir, Vec } from './maze';

import { pick } from '@pierre/ecs/modules/rng';

import { DIRS, opposite, sameDir, UP } from './maze';

export type GhostKind = 'blinky' | 'clyde' | 'inky' | 'pinky';

export const GHOST_KINDS: readonly GhostKind[] = ['blinky', 'pinky', 'inky', 'clyde'];

export const GHOST_COLORS: Record<GhostKind, string> = {
  blinky: '#ff0000',
  clyde: '#ffb852',
  inky: '#00ffff',
  pinky: '#ffb8ff',
};

/** Where each ghost heads while scattering: a point just outside a corner of the maze. */
export const SCATTER_CORNERS: Record<GhostKind, Vec> = {
  blinky: { x: 25, y: -3 },
  clyde: { x: 0, y: 31 },
  inky: { x: 27, y: 31 },
  pinky: { x: 2, y: -3 },
};

/** What a ghost can see of the board when it picks a chase target. */
export interface TargetCtx {
  /** Blinky's tile: Inky aims relative to it. */
  blinky: Vec;
  /** The ghost picking a target. */
  ghost: Vec;
  pac: Vec;
  pacDir: Dir;
}

function ahead(pac: Vec, dir: Dir, tiles: number): Vec {
  const target = { x: pac.x + dir.dx * tiles, y: pac.y + dir.dy * tiles };
  // The original hardware computed "ahead" for an upward heading with an
  // overflow that also shifted the target left by the same amount.
  if (sameDir(dir, UP))
    target.x -= tiles;
  return target;
}

/** Each ghost's own idea of "chase Pac-Man" — the whole personality of the four. */
export function chaseTarget(kind: GhostKind, ctx: TargetCtx): Vec {
  const { blinky, ghost, pac, pacDir } = ctx;
  switch (kind) {
    case 'blinky':
      return pac;
    case 'pinky':
      return ahead(pac, pacDir, 4);
    case 'inky': {
      const pivot = ahead(pac, pacDir, 2);
      return { x: pivot.x * 2 - blinky.x, y: pivot.y * 2 - blinky.y };
    }
    case 'clyde': {
      const far = Math.hypot(ghost.x - pac.x, ghost.y - pac.y) > 8;
      return far ? pac : SCATTER_CORNERS.clyde;
    }
  }
}

export interface ChooseOptions {
  /** True on the handful of tiles where a roaming ghost may not turn upward. */
  noUp: boolean;
  /** Frightened ghosts wander: pick an exit at random instead of steering to `target`. */
  rand?: RandomFn;
  passable: (c: number, r: number) => boolean;
}

/**
 * The exit a ghost takes from tile `(c, r)`: never straight back the way it
 * came, and otherwise the one whose next tile lies closest to `target`. Ties
 * fall to up, left, down, right.
 */
export function chooseGhostDirection(c: number, r: number, heading: Dir, target: Vec, opts: ChooseOptions): Dir {
  const back = opposite(heading);
  const exits = DIRS.filter(d =>
    !sameDir(d, back)
    && !(opts.noUp && sameDir(d, UP))
    && opts.passable(c + d.dx, r + d.dy));
  if (exits.length === 0)
    return back;
  if (opts.rand)
    return pick(exits, opts.rand)!;
  let best = exits[0]!;
  let bestDist = Infinity;
  for (const d of exits) {
    const dist = (c + d.dx - target.x) ** 2 + (r + d.dy - target.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}
