# Introduction

The engine gives you four things — component storage, queries, a tick loop and a
scheduler — and then stays out of the way. The core is deliberately thin: it holds
component data, matches queries against it, and runs your systems in an order you
declare. It does not know what a player is, and it will not manage your assets,
your input or your game loop for you.

What that buys is a base that survives a genre change: the same storage and the
same loop serve a platformer, a card game and a 3D shooter, with everything
genre-specific added as an opt-in module.

This page is the shortest path to being able to read the rest of the Manual. It is
not a tutorial — [that is here](../../guides/tutorial/).

## The model in thirty seconds

- **An entity is an id.** It has no fields and no behaviour. What it *has* is
  whatever components are stored against it.
- **Components live in one store per type.** Every `position` in the world is in
  the same store, not inside a per-entity object.
- **A tag** is a component with no payload: it records that an entity belongs to
  a set.
- **Systems are functions** the scheduler runs once per tick. They never call each
  other; each declares what it must run after or before.
- **Queries select archetypes.** An entity's set of components and tags is its
  archetype, and the engine groups entities by it — so a query picks whole groups
  instead of scanning entities.
- **A tick is atomic.** Queued events, destroys and lifecycle work all drain at
  the end of the tick, so no system ever sees the world change shape underneath
  it.

[The model](../../concepts/model/) takes that apart properly. The one place the
engine makes you think about cost is [structural
changes](../../concepts/structural-changes/) — adding or removing a component.

## What a program looks like

```ts
import { EcsWorld } from '@pierre/ecs';
import { PositionDef } from '@pierre/ecs/modules/transform';

const world = new EcsWorld();
world.registerComponent(PositionDef);

world.spawn({ name: 'marker', components: { position: { x: 3, y: 4 } } });

for (const [entity, position] of world.query(PositionDef)) {
  position.x += 1;
  console.log(entity, position.x, position.y);
}
```

That is the whole shape: register a component, spawn an entity, query, write —
a write through the query's row lands in the store. The tick loop, rendering,
input and collision are all added around it; none of them change this structure.

## Where to next

- **Build something** — [Build a moving, drawn scene](../../guides/tutorial/) goes
  from an empty file to a moving, drawn rectangle in seven steps.
- **Find a capability** — [Module index](../module-index/) groups every module by
  the task it serves, rather than by name.
- **See it working** — [Examples](../../../examples/) runs the prototypes in the
  page, each with what it was built to prove.
- **Understand the loop** — [Ticks, frames and system
  order](../../concepts/ticks-and-order/) explains why simulation and drawing are
  separate clocks.
- **Look up a signature** — the [API reference](../../../api/) has every export
  with its full type signature.

## See also

- [`world`](../../core/world/) — the registry everything hangs off.
- [Glossary](../../concepts/glossary/) — the engine's vocabulary, if a term above is
  unfamiliar.
