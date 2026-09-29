import type { EntityId } from '#entity-id';

import { describe, expect, it } from 'vitest';

import { EcsWorld } from '#world';

import { makeSeededRng } from '../rng';
import {
  addToPile,
  createPile,
  indexInPile,
  InPileDef,
  installPiles,
  moveAll,
  moveTop,
  PileDef,
  pileItems,
  pileOf,
  pileSize,
  pileTop,
  removeFromPile,
  shufflePile,
} from './pile';

function setup(count = 5): { items: EntityId[]; world: EcsWorld } {
  const world = new EcsWorld();
  installPiles(world);
  const items = Array.from({ length: count }, () => world.createEntity());
  return { items, world };
}

/** Every pile's items and every member's back-reference agree. */
function expectConsistent(world: EcsWorld): void {
  const members = world.getStore(InPileDef);
  let listed = 0;
  for (const [pile, value] of world.getStore(PileDef)) {
    expect(new Set(value.items).size).toBe(value.items.length);
    for (const item of value.items)
      expect(members.get(item)?.pile).toBe(pile);
    listed += value.items.length;
  }
  expect(members.size).toBe(listed);
}

describe('createPile and reads', () => {
  it('holds items bottom first', () => {
    const { items: [a, b, c], world } = setup(3);
    const pile = createPile(world, [a!, b!, c!]);
    expect(pileItems(world, pile)).toEqual([a, b, c]);
    expect(pileSize(world, pile)).toBe(3);
    expect(pileTop(world, pile)).toBe(c);
    expect(pileOf(world, b!)).toBe(pile);
    expect(indexInPile(world, b!)).toBe(1);
    expectConsistent(world);
  });

  it('reports an empty pile and an item in no pile', () => {
    const { items: [a], world } = setup(1);
    const pile = createPile(world);
    expect(pileSize(world, pile)).toBe(0);
    expect(pileTop(world, pile)).toBeUndefined();
    expect(pileOf(world, a!)).toBeUndefined();
    expect(indexInPile(world, a!)).toBe(-1);
  });

  it('throws when an entity that is not a pile is used as one', () => {
    const { items: [a], world } = setup(1);
    expect(() => pileItems(world, a!)).toThrow(/not a pile/);
    expect(() => addToPile(world, a!, a!)).toThrow(/into itself/);
  });

  it('throws when installed twice', () => {
    const { world } = setup(0);
    expect(() => installPiles(world)).toThrow(/already registered/);
  });
});

describe('moves keep piles and back-references in step', () => {
  it('addToPile appends by default and inserts at a clamped index', () => {
    const { items: [a, b, c, d], world } = setup(4);
    const pile = createPile(world, [a!, b!]);
    addToPile(world, pile, c!, 0);
    addToPile(world, pile, d!, 99);
    expect(pileItems(world, pile)).toEqual([c, a, b, d]);
    expectConsistent(world);
  });

  it('adding to another pile removes the item from its old pile', () => {
    const { items: [a, b], world } = setup(2);
    const hand = createPile(world, [a!, b!]);
    const discard = createPile(world);
    addToPile(world, discard, a!);
    expect(pileItems(world, hand)).toEqual([b]);
    expect(pileItems(world, discard)).toEqual([a]);
    expect(pileOf(world, a!)).toBe(discard);
    expectConsistent(world);
  });

  it('re-adding to the same pile repositions the item', () => {
    const { items: [a, b, c], world } = setup(3);
    const pile = createPile(world, [a!, b!, c!]);
    addToPile(world, pile, a!);
    expect(pileItems(world, pile)).toEqual([b, c, a]);
    addToPile(world, pile, a!, 1);
    expect(pileItems(world, pile)).toEqual([b, a, c]);
    expectConsistent(world);
  });

  it('createPile takes items out of the piles they were in', () => {
    const { items: [a, b], world } = setup(2);
    const first = createPile(world, [a!, b!]);
    const second = createPile(world, [b!]);
    expect(pileItems(world, first)).toEqual([a]);
    expect(pileItems(world, second)).toEqual([b]);
    expectConsistent(world);
  });

  it('removeFromPile takes the item out and reports whether it was in one', () => {
    const { items: [a, b], world } = setup(2);
    const pile = createPile(world, [a!, b!]);
    expect(removeFromPile(world, a!)).toBe(true);
    expect(removeFromPile(world, a!)).toBe(false);
    expect(pileItems(world, pile)).toEqual([b]);
    expect(pileOf(world, a!)).toBeUndefined();
    expectConsistent(world);
  });

  it('moveTop moves a run in order and returns it', () => {
    const { items: [a, b, c, d], world } = setup(4);
    const from = createPile(world, [a!, b!, c!]);
    const to = createPile(world, [d!]);
    expect(moveTop(world, from, to, 2)).toEqual([b, c]);
    expect(pileItems(world, from)).toEqual([a]);
    expect(pileItems(world, to)).toEqual([d, b, c]);
    expectConsistent(world);
  });

  it('moveTop defaults to one and moves only what is there', () => {
    const { items: [a, b], world } = setup(2);
    const from = createPile(world, [a!, b!]);
    const to = createPile(world);
    expect(moveTop(world, from, to)).toEqual([b]);
    expect(moveTop(world, from, to, 10)).toEqual([a]);
    expect(moveTop(world, from, to, 3)).toEqual([]);
    expect(pileItems(world, to)).toEqual([b, a]);
    expectConsistent(world);
  });

  it('moveAll keeps order, or reverses it', () => {
    const { items: [a, b, c], world } = setup(3);
    const waste = createPile(world, [a!, b!, c!]);
    const stock = createPile(world);
    expect(moveAll(world, waste, stock, { reverse: true })).toEqual([c, b, a]);
    expect(pileItems(world, stock)).toEqual([c, b, a]);
    expect(pileSize(world, waste)).toBe(0);

    moveAll(world, stock, waste);
    expect(pileItems(world, waste)).toEqual([c, b, a]);
    expectConsistent(world);
  });

  it('moveAll onto the same pile with reverse flips it in place', () => {
    const { items: [a, b, c], world } = setup(3);
    const pile = createPile(world, [a!, b!, c!]);
    moveAll(world, pile, pile, { reverse: true });
    expect(pileItems(world, pile)).toEqual([c, b, a]);
    expectConsistent(world);
  });

  it('shufflePile is reproducible with a seeded rng and keeps the members', () => {
    const { items, world } = setup(10);
    const first = createPile(world, items);
    shufflePile(world, first, makeSeededRng(42));
    const order = [...pileItems(world, first)];
    expect(order).not.toEqual(items);
    expect([...order].sort((x, y) => x - y)).toEqual(items);

    const other = setup(10);
    const second = createPile(other.world, other.items);
    shufflePile(other.world, second, makeSeededRng(42));
    expect(pileItems(other.world, second)).toEqual(order);
    expectConsistent(world);
  });

  it('records the pile as changed on every change', () => {
    const { items: [a], world } = setup(1);
    const pile = createPile(world);
    const changed = world.query(PileDef).changed(world.getStore(PileDef));
    const changedIds = (): number[] => changed.run().map(([id]) => id);
    changedIds();
    addToPile(world, pile, a!);
    expect(changedIds()).toEqual([pile]);
    removeFromPile(world, a!);
    expect(changedIds()).toEqual([pile]);
    shufflePile(world, pile);
    expect(changedIds()).toEqual([pile]);
    expect(changedIds()).toEqual([]);
  });
});

describe('entity removal', () => {
  it('destroying a member removes it from its pile', () => {
    const { items: [a, b, c], world } = setup(3);
    const pile = createPile(world, [a!, b!, c!]);
    world.destroyEntity(b!);
    expect(pileItems(world, pile)).toEqual([a, c]);
    expectConsistent(world);
  });

  it('deleting a member\'s InPile directly also removes it', () => {
    const { items: [a, b], world } = setup(2);
    const pile = createPile(world, [a!, b!]);
    world.getStore(InPileDef).delete(a!);
    expect(pileItems(world, pile)).toEqual([b]);
  });

  it('destroying a pile releases its members, which keep existing', () => {
    const { items: [a, b], world } = setup(2);
    const pile = createPile(world, [a!, b!]);
    world.destroyEntity(pile);
    expect(pileOf(world, a!)).toBeUndefined();
    expect(pileOf(world, b!)).toBeUndefined();
    expect(world.isAlive(a!)).toBe(true);
    expectConsistent(world);
  });

  it('a pile can be a member of another pile', () => {
    const { items: [a], world } = setup(1);
    const inner = createPile(world, [a!]);
    const outer = createPile(world, [inner]);
    expect(pileOf(world, inner)).toBe(outer);
    world.destroyEntity(inner);
    expect(pileSize(world, outer)).toBe(0);
    expect(pileOf(world, a!)).toBeUndefined();
    expectConsistent(world);
  });
});

describe('world reset and persistence', () => {
  it('clearAll leaves no pile state behind, and piles work after it', () => {
    const { items: [a, b], world } = setup(2);
    createPile(world, [a!, b!]);
    world.clearAll();
    expect(world.getStore(PileDef).size).toBe(0);
    expect(world.getStore(InPileDef).size).toBe(0);
    expect([...world.query(InPileDef)]).toEqual([]);
    expect([...world.query(PileDef)]).toEqual([]);

    const c = world.createEntity();
    const pile = createPile(world, [c]);
    expect(pileItems(world, pile)).toEqual([c]);
    expect([...world.query(InPileDef)].map(([id]) => id)).toEqual([c]);
    expectConsistent(world);
  });

  it('round-trips through toJSON / loadJSON', () => {
    const { items: [a, b, c], world } = setup(3);
    const deck = createPile(world, [a!, b!]);
    const hand = createPile(world, [c!]);

    const loaded = new EcsWorld();
    installPiles(loaded);
    loaded.loadJSON(JSON.parse(JSON.stringify(world.toJSON())));
    expect(pileItems(loaded, deck)).toEqual([a, b]);
    expect(pileItems(loaded, hand)).toEqual([c]);
    expect(pileOf(loaded, c!)).toBe(hand);
    expectConsistent(loaded);
  });

  it('loading over a world with the same ids keeps the loaded piles intact', () => {
    const { items: [a, b, c], world } = setup(3);
    const deck = createPile(world, [a!, b!, c!]);
    const hand = createPile(world);
    const save = JSON.parse(JSON.stringify(world.toJSON()));

    moveTop(world, deck, hand, 2);
    world.loadJSON(save);
    expect(pileItems(world, deck)).toEqual([a, b, c]);
    expect(pileItems(world, hand)).toEqual([]);
    expectConsistent(world);

    moveTop(world, deck, hand);
    expect(pileItems(world, hand)).toEqual([c]);
    expectConsistent(world);
  });

  it('rejects a malformed pile payload', () => {
    expect(() => PileDef.deserialize({ items: [1, 'x'] }, 'pile')).toThrow(/pile\.items\[1\]/);
    expect(() => InPileDef.deserialize({}, 'inPile')).toThrow(/inPile\.pile/);
  });
});
