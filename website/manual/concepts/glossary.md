# Glossary

The engine's own vocabulary, as it uses the words. Where a term has a page that
explains it properly, that page is linked.

**archetype** — an entity's exact set of components and tags. Two entities with
`position` + `velocity` share an archetype; add `renderable` to one and it belongs
to a different one. See [The model](../model/).

**bucket** — the set of entities sharing one archetype. Queries select buckets
rather than walking entities.

**component** — one piece of typed data, stored in a store shared by every entity
that has it. A component is defined by a `ComponentDef`, which carries its name
and its serialize/deserialize pair. Tags are the payload-free case.

**core** — the domain-neutral primitives under `src/`, imported from
`@pierre/ecs/<name>`. Core knows nothing about players, tiles or turns.

**dirty flag** — the per-tick record of which entities a store mutated. `set`,
`add` and `delete` mark an entity dirty; the set is cleared at the end of the
tick, so "changed this tick" is a question with a definite answer.

**entity** — an identifier, and nothing else. An entity has no fields and no
behaviour; what it has is whatever components are stored against its id.

**flush** — the step at the end of a tick that drains everything queued during
it: events, lifecycle callbacks, destroys and dirty flags. It is why nothing
structural is ever observed half-applied. See [Ticks, frames and system
order](../ticks-and-order/).

**module** — an opt-in, genre-specific package layered on core, imported from
`@pierre/ecs/modules/<name>`. Each is a separate subpath, so modules you never
import are never in your bundle.

**query** — a request for entities matching a component set, optionally filtered
by tags. `world.query(...)` resolves it against the archetype buckets.

**signature** — the bitmask behind an archetype: one bit per registered store,
OR-ed together for whatever an entity currently holds. Internal; you never
handle one.

**store** — the per-type container for one component. Registering a component
gives you its store, and every component of that type across the world is in it.

**structural change** — a change to *which* components or tags an entity has, as
opposed to a change to one of their values. It is what moves an entity between
archetype buckets. See [Structural changes](../structural-changes/).

**subpath export** — one entry of the package's `exports` map, such as
`@pierre/ecs/world` or `@pierre/ecs/modules/spatial`. Importing a subpath pulls
in that entry point and nothing else.

**system** — a function the scheduler runs once per tick. Systems do not call one
another; they declare `runAfter` / `runBefore` and let the order be computed.

**tag** — a component with no payload: it records that an entity belongs to a set.
Tags are how you mark state that needs no data of its own.

**template** — a declarative blueprint passed to `world.spawn`, naming the
components to put on the new entity.

**tick** — one pass of the simulation, and the atomic unit of change. A tick
builds its context, runs the scheduler, then flushes. See [Ticks, frames and
system order](../ticks-and-order/).

**tick context** — the object systems receive when they run, carrying the world
and the tick's `dtMs`. Its shape is the type parameter of `Scheduler` and
`TickRunner`, so a project can pass its own.

**tick source** — the thing that decides *when* ticks fire: manual, fixed
interval, per animation frame, or fixed timestep with interpolation. Core defines
the interface; `modules/tick` ships the implementations.

**world** — the registry that owns everything: entity ids, component and tag
stores, and the queries over them. See [`world`](../../core/world/).
