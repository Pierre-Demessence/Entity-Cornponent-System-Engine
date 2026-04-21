# ECS Engine Documentation

Project-agnostic ECS primitives in `packages/ecs/src/`. These modules have
**zero imports from game-specific code** and can be reused in any project.

## Primitives

- [Component Store](component-store.md) — `ComponentDef<T>`, `TagDef`, `ComponentStore<T>`, `TagStore`, dev-mode validation
- [Query Builder](query.md) — fluent typed entity queries with tag filters
- [Scheduler](scheduler.md) — DAG-based system ordering with topological sort
- [Spatial Structure](spatial-structure.md) — `SpatialStructure<TPos>` interface describing the minimum spatial-backend contract. Concrete implementations live in `modules/spatial/`.
- [Event Bus](event-bus.md) — generic queue-and-flush pub/sub system
- [Entity Templates](template.md) — declarative entity blueprints & `World.spawn()`
- [EcsWorld](world.md) — generic registry tying the primitives together
- [Tick](tick.md) — `TickSource` interface + `TickRunner` per-tick ceremony. Concrete sources live in `modules/tick/`.

## Supporting Files

- `entity-id.ts` — `EntityId` type definition
- `validation.ts` — pure data validation helpers (asObject, asArray, asNumber, asString, asBoolean)
- `test-utils.ts` — `createTestWorld()`, `GenericEntityBuilder`, `entity()` — domain-neutral fluent helpers for ECS unit tests. Import via `@pierre/ecs/test-utils`.

## Quick Start

```ts
import { EcsWorld } from '@pierre/ecs/world';
import type { ComponentDef } from '@pierre/ecs/component-store';

interface Pos { x: number; y: number }
const PosDef: ComponentDef<Pos> = {
  name: 'pos',
  serialize: v => v,
  deserialize: raw => raw as Pos,
};

const world = new EcsWorld();
world.registerComponent(PosDef);
world.enableSpatial(PosDef);

const id = world.spawn({ name: 'marker', components: { pos: { x: 0, y: 0 } } });
world.move(id, 3, 4);

for (const [entity, pos] of world.query(PosDef)) {
  console.log(entity, pos.x, pos.y);
}

world.queueDestroy(id);
world.flushDestroys();
```

See [EcsWorld](world.md) for the full registry API.

## Opt-in Modules

Genre-specific helpers that layer on top of the primitives. Each opt-in
module ships as a `@pierre/ecs/modules/<name>` subpath export and
documents itself in its source folder
(`packages/ecs/src/modules/<name>/README.md`). Browse
[`src/modules/`](../src/modules/) for the current catalog.

See the [general-purpose-ecs-roadmap](../../../docs/roadmap/general-purpose-ecs-roadmap.md)
Module Catalog for the broader module layering plan.

## Examples

End-to-end prototypes that exercise the engine in different genres, each
with a short postmortem:

- [Snake](../examples/snake/POSTMORTEM.md) — minimal grid game; validates `HashGrid2D` + `ManualTickSource`.
- [Asteroids](../examples/asteroids/POSTMORTEM.md) — continuous-space arcade; validates `FixedIntervalTickSource` + spatial projection helpers.
- [Platformer](../examples/platformer/POSTMORTEM.md) — AABB-based movement and pickups.

Start from [`../examples/README.md`](../examples/README.md) for the full tour.

## Contributing

- [Extending the Engine](extending-the-engine.md) — when to promote code into core vs a module vs leave in the consumer; Rule-of-Three extraction criteria; failure modes to avoid.