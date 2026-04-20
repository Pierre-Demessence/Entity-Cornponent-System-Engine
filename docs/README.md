# ECS Engine Documentation

Project-agnostic ECS primitives in `src/ecs/`. These modules have
**zero imports from game-specific code** and can be reused in any project.

## Primitives

- [Component Store](component-store.md) — `ComponentDef<T>`, `TagDef`, `ComponentStore<T>`, `TagStore`, dev-mode validation
- [Query Builder](query.md) — fluent typed entity queries with tag filters
- [Scheduler](scheduler.md) — DAG-based system ordering with topological sort
- `spatial-structure.ts` — `SpatialStructure<TPos>` interface describing the minimum spatial-backend contract (`add`/`remove`/`move`/`queryAt`/`queryRect`/`queryNear`/`clear`). Query methods return `Iterable<EntityId>` so lazy backends can yield without materializing. Concrete implementations live in `modules/spatial/`.
- [Event Bus](event-bus.md) — generic queue-and-flush pub/sub system
- [Entity Templates](template.md) — declarative entity blueprints & `World.spawn()`
- [EcsWorld](world.md) — generic registry tying the primitives together
- `tick-source.ts` — `TickInfo` + `TickSource` interfaces describing the source of ticks (discrete or continuous). Concrete implementations live in `modules/tick/`.
- `tick-runner.ts` — `TickRunner` drives the universal per-tick ceremony: build ctx → run scheduler → `onBeforeFlush` hook → flush events/lifecycle/destroys/dirty → `onTickComplete` hook. A tick is atomic; consumers queue world swaps between ticks via `onTickComplete`, and emit tick-boundary events (e.g. `TurnCompleted`) via `onBeforeFlush` so they drain in the same flush.

## Supporting Files

- `entity-id.ts` — `EntityId` type definition
- `validation.ts` — pure data validation helpers (asObject, asArray, asNumber, asString, asBoolean)
- `test-utils.ts` — `createTestWorld()`, `GenericEntityBuilder`, `entity()` — domain-neutral fluent helpers for ECS unit tests. Import via `@pierre/ecs/test-utils`.

## Opt-in Modules

Genre-specific helpers that layer on top of the primitives. Each ships as a separate subpath export so consumers only pay for what they import.

Modules live under `src/modules/<name>/` and are exported via the wildcard `@pierre/ecs/modules/*` subpath (one folder per module, each with its own `index.ts` barrel).

- `turn-based/` — `TurnCycler` for round-robin active-turn rotation across tagged entities. Import via `@pierre/ecs/modules/turn-based`. See the [general-purpose-ecs-roadmap](../../../docs/roadmap/general-purpose-ecs-roadmap.md) Module Catalog for the broader module layering plan.
- `tick/` — concrete `TickSource` implementations: `ManualTickSource` (caller-driven ticks, useful for tests and turn-based games) and `FixedIntervalTickSource` (owns an internal `setInterval`, emits `{ kind: 'fixed', deltaMs }` ticks at a fixed cadence — the default pick for real-time action prototypes). Future: variable-step, hybrid. Import via `@pierre/ecs/modules/tick`. The `TickSource` interface and `TickRunner` themselves live in core (see Primitives above).
- `spatial/` — concrete `SpatialStructure` implementations (today: `HashGrid2D` for integer grid lookups; future: continuous-space quadtree, octree, R-tree, BVH/sweep-and-prune). Import via `@pierre/ecs/modules/spatial`. The `SpatialStructure` interface itself lives in core (see Primitives above). `EcsWorld.enableSpatial(def, structure?)` defaults to `new HashGrid2D()`.

## Contributing

- [Extending the Engine](extending-the-engine.md) — when to promote code into core vs a module vs leave in the consumer; Rule-of-Three extraction criteria; failure modes to avoid.
