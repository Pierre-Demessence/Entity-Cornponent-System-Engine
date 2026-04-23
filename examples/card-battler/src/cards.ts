import type { EntityId } from '@pierre/ecs';

import type { GameState } from './game';

import { BlockDef, HealthDef } from './components/card';

/**
 * Static card definition. Effects are plain function refs — not
 * serializable, but simpler than a data-driven effect DSL for a
 * prototype. If a rung exercises save/load of in-hand cards later,
 * replace with a discriminated union (`{ kind: 'damage', amount } |
 * { kind: 'block', amount }`) and resolve through a dispatch table.
 *
 * Module-cycle note: `components/card.ts` imports `CardDef` (type) and
 * `getCardDef` (value) from this file for its deserialize hook, while
 * this file imports `HealthDef` / `BlockDef` values from that file.
 * ESM handles the cycle because the value imports here are only read
 * inside `applyDamage` / `applyBlock` (call-time), never at module
 * top-level. Leave this structure alone unless you know what you're
 * doing.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly description: string;
  readonly effect: (ctx: GameState) => void;
}

/**
 * Deal damage to the target entity. Defensive: no-ops if the entity no
 * longer has a `Health` component (e.g. enemy was destroyed earlier in
 * the same turn). Block absorbs damage first.
 */
function applyDamage(ctx: GameState, targetId: EntityId, amount: number): void {
  const health = ctx.world.getStore(HealthDef).get(targetId);
  if (!health)
    return;
  const block = ctx.world.getStore(BlockDef).get(targetId);
  let remaining = amount;
  if (block && block.amount > 0) {
    const absorbed = Math.min(block.amount, remaining);
    block.amount -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0)
    health.current = Math.max(0, health.current - remaining);
}

function applyBlock(ctx: GameState, targetId: EntityId, amount: number): void {
  const block = ctx.world.getStore(BlockDef).get(targetId);
  if (!block)
    return;
  block.amount += amount;
}

// --- Card definitions ---------------------------------------------------

export const Strike: CardDef = {
  id: 'strike',
  name: 'Strike',
  cost: 1,
  description: 'Deal 6 damage.',
  effect: ctx => applyDamage(ctx, ctx.enemyId, 6),
};

export const Defend: CardDef = {
  id: 'defend',
  name: 'Defend',
  cost: 1,
  description: 'Gain 5 Block.',
  effect: ctx => applyBlock(ctx, ctx.playerId, 5),
};

export const Heavy: CardDef = {
  id: 'heavy',
  name: 'Heavy Strike',
  cost: 2,
  description: 'Deal 9 damage.',
  effect: ctx => applyDamage(ctx, ctx.enemyId, 9),
};

const REGISTRY = new Map<string, CardDef>([
  [Strike.id, Strike],
  [Defend.id, Defend],
  [Heavy.id, Heavy],
]);

export function getCardDef(id: string): CardDef | undefined {
  return REGISTRY.get(id);
}

/** Canonical starting deck: 5 Strike, 4 Defend, 1 Heavy. */
export function buildStartingDeck(): CardDef[] {
  return [
    Strike,
    Strike,
    Strike,
    Strike,
    Strike,
    Defend,
    Defend,
    Defend,
    Defend,
    Heavy,
  ];
}
