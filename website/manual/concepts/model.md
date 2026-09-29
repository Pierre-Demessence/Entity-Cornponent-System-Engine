# The model: entities, components and systems

The engine has three nouns — entities, components and systems — and one piece of
machinery under them that decides how fast anything runs. This page explains the
nouns and that machinery. Each has its own guide for the API.

## An entity is an id, not an object

An entity is an identifier and nothing else. It has no fields, no methods and no
base class; what it *has* is whatever components are stored against that id.
That is the whole trick — behaviour lives in systems, data lives in stores, and
the id is just the thing both refer to.

```ts
const id = world.spawn({ name: 'player', components: { pos: { x: 0, y: 0 } } });
```

## Components live in one store per type

Registering a component gives you a store for it. Every component of that type,
across every entity, lives in that one store — not in a per-entity object.

```ts
import { simpleComponent } from '@pierre/ecs/component-store';

interface Pos { x: number; y: number }
const PosDef = simpleComponent<Pos>('pos', { x: 'number', y: 'number' });

const positions = world.registerComponent(PosDef);
positions.get(id); // Pos | undefined
```

`simpleComponent` builds the definition — its name, storage and save format —
from a flat schema; [`component-store`](../../core/component-store/) has the
other factories.

A **tag** is the same idea with no payload: it records that an entity belongs to
a set. Tags are how you mark state that needs no data of its own.

Because stores are per type, "does this entity have `pos`?" is a single lookup in
one store rather than a scan of an object's fields.

## Systems are functions the scheduler runs

A system is a function that reads and writes those stores:

```ts
scheduler.add({
  name: 'movement',
  writes: [PosDef],
  run: (ctx) => {
    for (const [id, pos] of ctx.world.query(PosDef)) { /* ... */ }
  },
});
```

Systems do not call each other. They declare `runAfter` / `runBefore` and the
scheduler works out the order — see [Ticks, frames and system
order](../ticks-and-order/).

## Queries pick buckets, not entities

This is the machinery worth knowing about.

An entity's **archetype** is its exact set of components and tags. Two entities
with `pos` + `vel` share an archetype; add a `sprite` to one and it belongs to a
different one.

Internally each archetype is a **signature**: a bitmask with one bit per
registered store, OR-ed together for whatever the entity currently holds.
Entities are grouped into a bucket per signature, and `world.query(...)` matches
signatures rather than walking entities. A query that matches an archetype gets
the whole bucket at once; an entity that cannot match is never looked at.

Two consequences follow:

- **The number of *kinds* of entity costs more than the number of entities.** Ten
  thousand identical entities are one bucket. Ten thousand entities in ten
  thousand distinct component sets are ten thousand buckets to match against.
- **The shape of a query matters less than you would expect.** Adding a component
  to a query narrows it, because it selects a smaller bucket — it does not make
  the engine probe each entity.

You never see the index, and it is not exported. It updates itself from the store
writes the world already observes.

## What the model asks of you

- **Register before you use.** Components and tags must be registered on the
  world first, and names must be unique within a world.
- **Move indexed positions through `world.move(def, id, to)`.** Once a world
  indexes a component, writing an indexed entity's value directly leaves the
  index stale.
  Without one, a position is a component like any other — see
  [`world`](../../core/world/).
- **Do not depend on iteration order.** Nothing in the query contract promises
  one, and the buckets it walks are an implementation detail.
- **Keep component sets stable when you can.** Changing which components an
  entity has is a [structural change](../structural-changes/), and that is the one
  place the model makes you pay.

## See also

- [`world`](../../core/world/) — registration, `spawn`, `move`, `query`.
- [`component-store`](../../core/component-store/) — the stores themselves.
- [`query`](../../core/query/) — filters and the iteration API.
- [Structural changes](../structural-changes/) — what changing an archetype costs.
