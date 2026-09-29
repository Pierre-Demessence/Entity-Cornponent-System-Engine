import type { ComponentDef, ComponentStoreLike, EcsWorld, EntityId } from '#index';
import type { RandomFn } from '../rng';

import { asArray, asNumber, asObject } from '#validation';

import { shuffle } from '../rng';

/**
 * An ordered pile of entities — a deck, a hand, a discard pile, a tableau
 * column. Index `0` is the bottom, the last index is the top.
 *
 * Read it through {@link pileItems}; change it only through this module's
 * operations, which keep each member's {@link InPile} in step.
 */
export interface Pile {
  items: EntityId[];
}

/** Back-reference on a pile member: the pile entity it sits in. */
export interface InPile {
  pile: EntityId;
}

/** The {@link Pile} component, carried by a pile entity; serializes under `'pile'`. */
export const PileDef: ComponentDef<Pile> = {
  name: 'pile',
  serialize: value => ({ items: [...value.items] }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    const items = asArray(obj.items, `${label}.items`);
    return { items: items.map((id, i) => asNumber(id, `${label}.items[${i}]`)) };
  },
};

/** The {@link InPile} component, carried by each pile member; serializes under `'inPile'`. */
export const InPileDef: ComponentDef<InPile> = {
  name: 'inPile',
  serialize: value => ({ pile: value.pile }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return { pile: asNumber(obj.pile, `${label}.pile`) };
  },
};

/**
 * Register {@link PileDef} and {@link InPileDef} on `world` and install the
 * cleanup that keeps them consistent when entities go away:
 *
 * - destroying a member (or deleting its `InPile`) removes it from its pile;
 * - destroying a pile (or deleting its `Pile`) releases its members, which
 *   keep existing outside any pile.
 *
 * Call once per world, in place of registering the two components yourself.
 */
export function installPiles(world: EcsWorld): void {
  // Registration order is load-bearing: `loadJSON` and `clearAll` wipe stores
  // in registration order, so the pile store is emptied — releasing members
  // from the *old* piles — before the member store is touched, and neither
  // cleanup ever reaches a freshly loaded row.
  const piles = world.registerComponent(PileDef);
  const members = world.registerComponent(InPileDef);

  piles.subscribe('delete', (pileId, pile) => {
    for (const item of [...pile.items]) {
      if (members.get(item)?.pile === pileId)
        members.delete(item);
    }
  });

  members.subscribe('delete', (item, old) => {
    const pile = piles.get(old.pile);
    if (!pile)
      return;
    const index = pile.items.indexOf(item);
    if (index >= 0) {
      pile.items.splice(index, 1);
      piles.markChanged(old.pile);
    }
  });
}

function pileStore(world: EcsWorld): ComponentStoreLike<Pile> {
  return world.getStore(PileDef);
}

function requirePile(world: EcsWorld, pile: EntityId): Pile {
  const value = pileStore(world).get(pile);
  if (!value)
    throw new Error(`Entity ${pile} is not a pile; create it with createPile().`);
  return value;
}

/** Create a pile entity holding `items` in order (bottom first). Each item leaves any pile it was in. */
export function createPile(world: EcsWorld, items: readonly EntityId[] = []): EntityId {
  const pile = world.createEntity();
  pileStore(world).set(pile, { items: [] });
  for (const item of items)
    addToPile(world, pile, item);
  return pile;
}

/**
 * The pile's members, bottom first. This is the live array — read it, do not
 * mutate it; a change that bypasses this module leaves `InPile` out of step.
 */
export function pileItems(world: EcsWorld, pile: EntityId): readonly EntityId[] {
  return requirePile(world, pile).items;
}

/** How many entities are in the pile. */
export function pileSize(world: EcsWorld, pile: EntityId): number {
  return requirePile(world, pile).items.length;
}

/** The top entity of the pile, or `undefined` when it is empty. */
export function pileTop(world: EcsWorld, pile: EntityId): EntityId | undefined {
  return requirePile(world, pile).items.at(-1);
}

/** The pile `item` sits in, or `undefined` when it is in none. */
export function pileOf(world: EcsWorld, item: EntityId): EntityId | undefined {
  return world.getStore(InPileDef).get(item)?.pile;
}

/** `item`'s position in its pile (`0` = bottom), or `-1` when it is in none. */
export function indexInPile(world: EcsWorld, item: EntityId): number {
  const pile = pileOf(world, item);
  return pile === undefined ? -1 : requirePile(world, pile).items.indexOf(item);
}

/**
 * Put `item` into `pile` at `index` (default: on top). The item first leaves
 * the pile it was in — the same pile included — so `index` counts positions
 * after that removal. An out-of-range `index` is clamped.
 */
export function addToPile(world: EcsWorld, pile: EntityId, item: EntityId, index?: number): void {
  if (item === pile)
    throw new Error(`Entity ${pile} cannot be put into itself.`);
  const target = requirePile(world, pile);
  // Replacing an existing InPile fires its delete handler, which takes the
  // item out of its previous pile.
  world.getStore(InPileDef).set(item, { pile });
  const at = index === undefined
    ? target.items.length
    : Math.max(0, Math.min(Math.trunc(index), target.items.length));
  target.items.splice(at, 0, item);
  pileStore(world).markChanged(pile);
}

/** Take `item` out of its pile. Returns `false` when it was in none. */
export function removeFromPile(world: EcsWorld, item: EntityId): boolean {
  return world.getStore(InPileDef).delete(item);
}

/**
 * Move the top `count` entities of `from` onto `to`, keeping their order — a
 * draw, or a run of cards moved as one. Moves fewer when `from` holds fewer.
 * Returns the moved entities, bottom first.
 */
export function moveTop(world: EcsWorld, from: EntityId, to: EntityId, count = 1): EntityId[] {
  const source = requirePile(world, from);
  requirePile(world, to);
  const take = Math.max(0, Math.min(Math.trunc(count), source.items.length));
  const moved = source.items.slice(source.items.length - take);
  for (const item of moved)
    addToPile(world, to, item);
  return moved;
}

/** Options for {@link moveAll}. */
export interface MoveAllOptions {
  /** Flip the order on the way, as when a face-up waste pile is turned back into the stock. */
  reverse?: boolean;
}

/**
 * Move every entity of `from` onto the top of `to`, keeping their order unless
 * `reverse` is set. Returns the moved entities in the order they were added.
 */
export function moveAll(world: EcsWorld, from: EntityId, to: EntityId, options: MoveAllOptions = {}): EntityId[] {
  requirePile(world, to);
  const moved = [...requirePile(world, from).items];
  if (options.reverse)
    moved.reverse();
  for (const item of moved)
    addToPile(world, to, item);
  return moved;
}

/** Shuffle the pile in place (Fisher–Yates). Pass a seeded `rand` for a reproducible deal. */
export function shufflePile(world: EcsWorld, pile: EntityId, rand?: RandomFn): void {
  shuffle(requirePile(world, pile).items, rand);
  pileStore(world).markChanged(pile);
}
