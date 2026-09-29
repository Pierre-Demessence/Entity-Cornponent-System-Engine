import type { EcsWorld, EntityId } from '@pierre/ecs';
import type { Easing } from '@pierre/ecs/modules/easing';
import type { Tween } from '@pierre/ecs/modules/tween';

import type { Level } from './level';

import { easeOutQuad, easeOutSine } from '@pierre/ecs/modules/easing';
import { bresenhamLine } from '@pierre/ecs/modules/grid-based';
import { lerp, pingPong } from '@pierre/ecs/modules/math';
import { OpacityDef, RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { PositionDef } from '@pierre/ecs/modules/transform';
import { makeTween, tickTween, tweenDone, tweenValue } from '@pierre/ecs/modules/tween';

import {
  ActorTag,
  cellCenter,
  FighterDef,
  GridPosDef,
  InventoryDef,
  ItemDef,
  LabelDef,
  PlayerTag,
  StairsTag,
} from './defs';
import { isFloor } from './level';

/** Everything the rules and the AI act on. Swapped wholesale on a new floor or a load. */
export interface Game {
  level: Level;
  /** Per-entity pixel animation; the turn logic never waits for it. */
  readonly motion: Map<EntityId, Motion>;
  over: boolean;
  playerId: EntityId;
  world: EcsWorld;
  log: (message: string) => void;
}

interface Motion {
  /** Destroy the entity once the tween ends (projectiles). */
  readonly destroyAtEnd: boolean;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly tween: Tween;
}

const SLIDE_MS = 90;
const BUMP_MS = 140;
const BOLT_MS_PER_CELL = 35;
/** Bump out and back: 0 → 1 → 0 over the tween, eased on each half. */
const bumpEasing: Easing = t => easeOutQuad(pingPong(t * 2, 1));

export function actorAt(game: Game, x: number, y: number): EntityId | undefined {
  const cells = game.world.getStore(GridPosDef);
  for (const id of game.world.getTag(ActorTag)) {
    const c = cells.get(id);
    if (c && c.x === x && c.y === y)
      return id;
  }
  return undefined;
}

export function isWalkable(game: Game, x: number, y: number): boolean {
  return isFloor(game.level, x, y) && actorAt(game, x, y) === undefined;
}

/** Step one cell, or attack whoever stands there. Returns false when nothing happened. */
export function stepOrAttack(game: Game, id: EntityId, dx: number, dy: number): boolean {
  const cell = game.world.getStore(GridPosDef).get(id)!;
  const tx = cell.x + dx;
  const ty = cell.y + dy;
  const target = actorAt(game, tx, ty);
  if (target !== undefined) {
    // Monsters don't infight; only the player and monsters trade blows.
    const isPlayer = (e: EntityId): boolean => game.world.getTag(PlayerTag).has(e);
    if (isPlayer(id) === isPlayer(target))
      return false;
    attack(game, id, target, dx, dy);
    return true;
  }
  if (!isFloor(game.level, tx, ty))
    return false;
  moveTo(game, id, tx, ty);
  return true;
}

export function moveTo(game: Game, id: EntityId, x: number, y: number): void {
  const cell = game.world.getStore(GridPosDef).get(id)!;
  cell.x = x;
  cell.y = y;
  const pos = game.world.getStore(PositionDef).get(id)!;
  animate(game, id, pos.x, pos.y, cellCenter(x), cellCenter(y), SLIDE_MS, easeOutSine);
}

export function attack(game: Game, attacker: EntityId, target: EntityId, dx: number, dy: number): void {
  const world = game.world;
  const cell = world.getStore(GridPosDef).get(attacker)!;
  const cx = cellCenter(cell.x);
  const cy = cellCenter(cell.y);
  animate(game, attacker, cx, cy, cx + dx * 6, cy + dy * 6, BUMP_MS, bumpEasing);
  damage(game, attacker, target);
}

export function damage(game: Game, attacker: EntityId, target: EntityId, verb = 'hit'): void {
  const world = game.world;
  const atk = world.getStore(FighterDef).get(attacker)!.atk;
  const fighter = world.getStore(FighterDef).get(target)!;
  fighter.hp -= atk;
  const who = nameOf(game, attacker);
  const whom = target === game.playerId ? 'you' : nameOf(game, target).toLowerCase();
  game.log(`${who} ${attacker === game.playerId ? verb : `${verb}s`} ${whom} for ${atk}.`);
  if (fighter.hp > 0)
    return;
  if (target === game.playerId) {
    game.over = true;
    world.getStore(OpacityDef).set(target, { value: 0.35 });
    game.log('You die. R for a new run, L to load.');
    return;
  }
  game.log(`${nameOf(game, target)} dies.`);
  game.motion.delete(target);
  world.destroyEntity(target);
}

/**
 * Fire along the Bresenham line. Stops at the first wall or actor, which takes
 * the hit. Returns false if the first cell on the line is already blocked.
 */
export function shoot(game: Game, shooter: EntityId, tx: number, ty: number): boolean {
  const from = game.world.getStore(GridPosDef).get(shooter)!;
  const path = bresenhamLine(from.x, from.y, tx, ty).slice(1);
  let end = path.length - 1;
  let hit: EntityId | undefined;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (!isFloor(game.level, p.x, p.y)) {
      end = i - 1;
      break;
    }
    hit = actorAt(game, p.x, p.y);
    if (hit !== undefined) {
      end = i;
      break;
    }
  }
  if (end < 0)
    return false;

  const last = path[end]!;
  const bolt = game.world.createEntity();
  game.world.getStore(PositionDef).set(bolt, { x: cellCenter(from.x), y: cellCenter(from.y) });
  game.world.getStore(RenderableDef).set(bolt, { fill: '#ffd166', kind: 'circle', radius: 2 });
  game.world.getStore(RenderOrderDef).set(bolt, { value: 20 });
  game.world.getStore(OpacityDef).set(bolt, { value: 1 });
  animate(game, bolt, cellCenter(from.x), cellCenter(from.y), cellCenter(last.x), cellCenter(last.y), BOLT_MS_PER_CELL * (end + 1), easeOutQuad, true);

  if (hit !== undefined && hit !== shooter)
    damage(game, shooter, hit, 'shoot');
  else
    game.log(`${nameOf(game, shooter)}'s shot misses.`);
  return true;
}

/** Player-only follow-ups after stepping: pick up items, report stairs. */
export function afterPlayerStep(game: Game): 'descend' | undefined {
  const world = game.world;
  const cell = world.getStore(GridPosDef).get(game.playerId)!;
  const cells = world.getStore(GridPosDef);
  for (const [id] of world.getStore(ItemDef)) {
    const c = cells.get(id);
    if (c && c.x === cell.x && c.y === cell.y) {
      world.getStore(InventoryDef).get(game.playerId)!.potions++;
      world.destroyEntity(id);
      game.log('You pick up a potion.');
      break;
    }
  }
  for (const id of world.getTag(StairsTag)) {
    const c = cells.get(id);
    if (c && c.x === cell.x && c.y === cell.y)
      return 'descend';
  }
  return undefined;
}

export function drinkPotion(game: Game): boolean {
  const inventory = game.world.getStore(InventoryDef).get(game.playerId)!;
  if (inventory.potions <= 0) {
    game.log('No potions left.');
    return false;
  }
  const fighter = game.world.getStore(FighterDef).get(game.playerId)!;
  inventory.potions--;
  fighter.hp = Math.min(fighter.maxHp, fighter.hp + 6);
  game.log('You drink a potion. You feel better.');
  return true;
}

export function nameOf(game: Game, id: EntityId): string {
  if (id === game.playerId)
    return 'You';
  const name = game.world.getStore(LabelDef).get(id)?.name ?? 'something';
  return `The ${name}`;
}

export function animate(
  game: Game,
  id: EntityId,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  durationMs: number,
  easing: Easing,
  destroyAtEnd = false,
): void {
  game.motion.set(id, { destroyAtEnd, fromX, fromY, toX, toY, tween: makeTween(durationMs, 0, 1, easing) });
}

/** Advance every running animation and write the result into `PositionDef`. */
export function tickMotion(game: Game, dtMs: number): void {
  const positions = game.world.getStore(PositionDef);
  for (const [id, m] of game.motion) {
    const pos = positions.get(id);
    if (!pos) {
      game.motion.delete(id);
      continue;
    }
    tickTween(m.tween, dtMs);
    const t = tweenValue(m.tween);
    pos.x = lerp(m.fromX, m.toX, t);
    pos.y = lerp(m.fromY, m.toY, t);
    if (tweenDone(m.tween)) {
      game.motion.delete(id);
      if (m.destroyAtEnd)
        game.world.destroyEntity(id);
    }
  }
}
