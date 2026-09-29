# `@pierre/ecs/modules/pile`

Ordered piles of entities: a deck, a hand, a discard pile, a solitaire tableau
column, a bag of letter tiles. Each pile is an entity; its members are other
entities, kept in order from bottom to top.

Piles live in the world, so resetting it (`world.clearAll()`), saving it
(`world.toJSON()`) and loading it (`world.loadJSON()`) carry them along with no
extra code.

## Example

```ts
import { EcsWorld } from '@pierre/ecs';
import { addToPile, createPile, installPiles, moveAll, moveTop, pileItems, pileOf, pileSize, shufflePile } from '@pierre/ecs/modules/pile';
import { makeSeededRng } from '@pierre/ecs/modules/rng';

const world = new EcsWorld();
installPiles(world);

const cards = Array.from({ length: 10 }, () => world.createEntity());
const deck = createPile(world, cards);
const hand = createPile(world);
const discard = createPile(world);

shufflePile(world, deck, makeSeededRng(7));
moveTop(world, deck, hand, 5); // draw five

const played = pileItems(world, hand)[2]!;
addToPile(world, discard, played); // play a card from the middle of the hand
console.log(pileOf(world, played) === discard); // true

moveAll(world, hand, discard); // end of turn: discard the rest
console.log(pileSize(world, deck), pileSize(world, discard)); // 5 5
```

## API

```ts
interface Pile { items: EntityId[] }   // index 0 = bottom
interface InPile { pile: EntityId }
const PileDef: ComponentDef<Pile>;      // on the pile entity, saved as 'pile'
const InPileDef: ComponentDef<InPile>;  // on each member, saved as 'inPile'

function installPiles(world: EcsWorld): void;

function createPile(world: EcsWorld, items?: readonly EntityId[]): EntityId;
function pileItems(world: EcsWorld, pile: EntityId): readonly EntityId[];
function pileSize(world: EcsWorld, pile: EntityId): number;
function pileTop(world: EcsWorld, pile: EntityId): EntityId | undefined;
function pileOf(world: EcsWorld, item: EntityId): EntityId | undefined;
function indexInPile(world: EcsWorld, item: EntityId): number;

function addToPile(world: EcsWorld, pile: EntityId, item: EntityId, index?: number): void;
function removeFromPile(world: EcsWorld, item: EntityId): boolean;
function moveTop(world: EcsWorld, from: EntityId, to: EntityId, count?: number): EntityId[];
function moveAll(world: EcsWorld, from: EntityId, to: EntityId, options?: MoveAllOptions): EntityId[];
function shufflePile(world: EcsWorld, pile: EntityId, rand?: RandomFn): void;

interface MoveAllOptions { reverse?: boolean }
```

- **`installPiles`** registers both components and must be called once per
  world, instead of registering them yourself.
- **`addToPile`** puts an item on top, or at `index`. The item leaves the pile
  it was in first — the same pile included, which is how you reorder — so
  `index` counts positions after that removal. Out-of-range indices clamp.
- **`moveTop`** moves the top `count` items (default 1) and keeps their order:
  a draw, or a run of cards dragged as one. It moves fewer when the pile holds
  fewer, and returns what it moved, bottom first.
- **`moveAll`** empties one pile onto another. `reverse: true` flips the order
  on the way, as when a face-up waste pile is turned back into the stock.
- **`shufflePile`** shuffles in place; pass a seeded `rand` for a reproducible
  deal.
- Passing an entity that is not a pile where a pile is expected throws.

## One pile at a time

An entity is in at most one pile. Every operation keeps `Pile.items` and the
member's `InPile` in step, so "what is in this pile?" and "which pile is this
in?" always agree.

`pileItems` returns the live array. Read it, iterate it, index it — but do not
push to it or splice it. A change that bypasses this module leaves `InPile`
out of step. For the same reason, do not `set` `PileDef` or `InPileDef` on an
entity yourself; use `createPile` and `addToPile`.

## Destroying entities

`installPiles` subscribes to both component stores, so removal cleans up on
its own, immediately:

- Destroying a **member** (or deleting its `InPileDef`) removes it from its
  pile.
- Destroying a **pile** (or deleting its `PileDef`) releases its members. They
  keep existing, in no pile.

## Saving and loading

`PileDef` and `InPileDef` serialize with the rest of the world. Loading a save
restores the same entity ids, so the references stay valid. Merging a save into
a world that already uses those ids is not supported by the engine yet, for
piles or any other component that stores entity ids.

## Not included

- **Card data.** Face up or down, suit, cost — these are your components on
  the member entities.
- **Layout.** Where each member is drawn (a fanned column, a spread hand) is a
  rule of your game, computed from `pileItems` and `indexInPile`.
- **Move rules.** Whether a card may go onto a pile is your game's check,
  made before calling `addToPile` or `moveTop`. `modules/drag-drop` takes the
  same check as its `accepts` callback.

## Dependencies

- `modules/rng` — `shuffle` and `RandomFn`, used by `shufflePile`.
