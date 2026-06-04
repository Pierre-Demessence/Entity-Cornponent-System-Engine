# ECS Engine Documentation

Project-agnostic ECS primitives in `src/`. These modules have
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
- `audio-provider.ts` — `AudioProvider` contract (`play`, `stop`, `setVolume`, `dispose`) used by `modules/audio`
- `validation.ts` — pure data validation helpers (asObject, asArray, asNumber, asString, asBoolean)
- `test-utils.ts` — `createTestWorld()`, `GenericEntityBuilder`, `entity()` — domain-neutral fluent helpers for ECS unit tests. Import via `@pierre/ecs/test-utils`.

## Quick Start

See [`../README.md`](../README.md#quick-start) for a minimal
register-component / spawn / query example. The primitive docs above
cover the full API surface.

## Opt-in Modules

Genre-specific helpers that layer on top of the primitives. Each opt-in
module ships as a `@pierre/ecs/modules/<name>` subpath export and
documents itself in its source folder
(`src/modules/<name>/README.md`). Browse
[`../src/modules/`](../src/modules/) for the current catalog.

## Examples

End-to-end prototypes that exercise the engine in different genres. Each
subfolder of [`../examples/`](../examples/) is one runnable example; see
[`../examples/README.md`](../examples/README.md) for the guided tour and
the [prototype roadmap](roadmap/prototype-games-roadmap.md) for what each
one proves. Engine gaps these prototypes surface are tracked in the
[engine gap ledger](roadmap/engine-gap-ledger.md).

## Contributing

- [Extending the Engine](extending-the-engine.md) — when to promote code into core vs a module vs leave in the consumer; the sliding-scale evidence rule (canon vs internal consumers); failure modes to avoid.
- [Engine Gap Ledger](roadmap/engine-gap-ledger.md) — central log of engine gaps surfaced by the examples, awaiting triage into the module backlog.

## Roadmap

- [Core-Engine Roadmap](roadmap/core-engine-roadmap.md) - core-engine internals (component stores, queries, scheduler, hooks)
- [ECS Module Backlog](roadmap/ecs-module-backlog.md) - shipped, deferred, speculative, declined modules
- [Prototype Games Roadmap](roadmap/prototype-games-roadmap.md) - ladder of small games validating the engine

## Plans

Active engine plans live in [docs/plans/](plans/). Done plans for engine work performed while the engine was still in the Roguelike monorepo are kept in that repo's docs/plans/done/ directory for historical context.
