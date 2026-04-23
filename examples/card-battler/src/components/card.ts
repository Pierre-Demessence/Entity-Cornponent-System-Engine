import type { ComponentDef } from '@pierre/ecs';

import type { CardDef } from '../cards';

import { simpleComponent } from '@pierre/ecs';

import { getCardDef } from '../cards';

/**
 * Card component: binds an entity to its card definition. Zone membership
 * is expressed via tags (`InHandTag` / `InDeckTag` / `InDiscardTag`), so
 * the card component itself only stores the def reference.
 *
 * Serialization is id-based — `CardDef` carries a function ref that
 * can't round-trip through JSON. Not actually used this rung, but the
 * shape is correct for future save/load work.
 */
export interface Card {
  def: CardDef;
}

export const CardDefComp: ComponentDef<Card> = {
  name: 'card',
  deserialize(raw, label) {
    if (raw === null || typeof raw !== 'object')
      throw new Error(`${label} must be an object`);
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== 'string')
      throw new TypeError(`${label}.id must be a string`);
    const def = getCardDef(id);
    if (!def)
      throw new Error(`${label}.id '${id}' is not a registered card def`);
    return { def };
  },
  serialize(value) {
    return { id: value.def.id };
  },
};

/** Player and enemy health. */
export interface Health { current: number; max: number }
export const HealthDef: ComponentDef<Health> = simpleComponent<Health>(
  'health',
  { current: 'number', max: 'number' },
);

/** Damage-absorbing armor that resets to 0 at the start of the player's turn. */
export interface Block { amount: number }
export const BlockDef: ComponentDef<Block> = simpleComponent<Block>(
  'block',
  { amount: 'number' },
);

/** What the enemy intends to do on its next turn. */
export interface EnemyIntent {
  /** `'attack' | 'block'` but kept as a string for `simpleComponent` compatibility. */
  kind: string;
  value: number;
}
export const EnemyIntentDef: ComponentDef<EnemyIntent> = simpleComponent<EnemyIntent>(
  'enemyIntent',
  { kind: 'string', value: 'number' },
);
