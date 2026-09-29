import type { EntityId } from '@pierre/ecs';
import type { BtStatus } from '@pierre/ecs/modules/behavior-tree';
import type { PathNode } from '@pierre/ecs/modules/pathfinding';

import type { Ai, GridPos } from './defs';
import type { Game } from './rules';

import { action, condition, inverter, selector, sequence } from '@pierre/ecs/modules/behavior-tree';
import { hasLineOfSight } from '@pierre/ecs/modules/grid-based';
import { findPath } from '@pierre/ecs/modules/pathfinding';
import { pick } from '@pierre/ecs/modules/rng';

import { AiDef, GridPosDef } from './defs';
import { FOV_RADIUS, inBounds, isFloor } from './level';
import { actorAt, attack, shoot, stepOrAttack } from './rules';

/** The blackboard: who is thinking this turn, and what they know. */
interface Brain {
  ai: Ai;
  cell: GridPos;
  game: Game;
  player: GridPos;
  self: EntityId;
}

const DIRS: readonly PathNode[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

const distance = (b: Brain): number => Math.abs(b.cell.x - b.player.x) + Math.abs(b.cell.y - b.player.y);

const adjacent = condition<Brain>(b => distance(b) === 1);
const isArcher = condition<Brain>(b => b.ai.kind === 'archer');
const inRange = condition<Brain>(b => distance(b) <= b.ai.range);

/** Sight is symmetric-ish: a monster sees the player when the line between them is clear. */
const seesPlayer = condition<Brain>((b) => {
  if (distance(b) > FOV_RADIUS)
    return false;
  const grid = {
    isInBounds: inBounds,
    blocksSight: (x: number, y: number) => !isFloor(b.game.level, x, y),
  };
  if (!hasLineOfSight(grid, b.cell.x, b.cell.y, b.player.x, b.player.y))
    return false;
  b.ai.hunting = true;
  b.ai.lastSeenX = b.player.x;
  b.ai.lastSeenY = b.player.y;
  return true;
});

const melee = action<Brain>((b) => {
  attack(b.game, b.self, b.game.playerId, Math.sign(b.player.x - b.cell.x), Math.sign(b.player.y - b.cell.y));
  return 'success';
});

const fire = action<Brain>(b => shoot(b.game, b.self, b.player.x, b.player.y) ? 'success' : 'failure');

/** Walk one step along an A* path to the last place the player was seen. */
const chase = action<Brain>((b): BtStatus => {
  if (!b.ai.hunting)
    return 'failure';
  const goal = { x: b.ai.lastSeenX, y: b.ai.lastSeenY };
  const path = findPath({
    from: { x: b.cell.x, y: b.cell.y },
    maxCost: 30,
    to: goal,
    cost: () => 1,
    heuristic: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
    neighbors: (x, y) => DIRS.map(d => ({ x: x + d.x, y: y + d.y })),
    // Other monsters block, but the goal cell stays open so a path to the
    // player (who stands on it) still exists.
    traversable: (x, y) => isFloor(b.game.level, x, y)
      && ((x === goal.x && y === goal.y) || actorAt(b.game, x, y) === undefined),
  });
  const next = path?.[0];
  if (!next) {
    b.ai.hunting = false; // lost the trail
    return 'failure';
  }
  if (!stepOrAttack(b.game, b.self, next.x - b.cell.x, next.y - b.cell.y))
    return 'failure';
  if (b.cell.x === goal.x && b.cell.y === goal.y)
    b.ai.hunting = false; // reached the last known spot and found nothing
  return 'success';
});

const wander = action<Brain>((b) => {
  const options = DIRS.filter(d => isFloor(b.game.level, b.cell.x + d.x, b.cell.y + d.y)
    && actorAt(b.game, b.cell.x + d.x, b.cell.y + d.y) === undefined);
  const d = pick(options);
  if (d)
    stepOrAttack(b.game, b.self, d.x, d.y);
  return 'success';
});

/** One tree shared by every monster; priorities are re-evaluated each turn. */
const brain = selector<Brain>(
  // Archers keep their distance: shoot when the player is visible, in range,
  // and *not* adjacent.
  sequence(isArcher, seesPlayer, inverter(adjacent), inRange, fire),
  sequence(adjacent, melee),
  sequence(seesPlayer, chase),
  chase, // out of sight: follow the trail to where the player was last seen
  wander,
);

export function takeMonsterTurn(game: Game, self: EntityId): void {
  const world = game.world;
  const ai = world.getStore(AiDef).get(self);
  const cell = world.getStore(GridPosDef).get(self);
  const player = world.getStore(GridPosDef).get(game.playerId);
  if (!ai || !cell || !player)
    return;
  brain({ ai, cell, game, player, self });
}
