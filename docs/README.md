# ECS Engine Documentation

Project-agnostic ECS primitives in `src/ecs/`. These modules have
**zero imports from game-specific code** and can be reused in any project.

## Primitives

- [Component Store](component-store.md) — `ComponentDef<T>`, `TagDef`, `ComponentStore<T>`, `TagStore`, dev-mode validation
- [Query Builder](query.md) — fluent typed entity queries with tag filters
- [Scheduler](scheduler.md) — DAG-based system ordering with topological sort
- [Spatial Index](spatial-index.md) — hash grid for O(1) position lookups
- [Event Bus](event-bus.md) — generic queue-and-flush pub/sub system
- [Entity Templates](template.md) — declarative entity blueprints & `World.spawn()`
- [EcsWorld](world.md) — generic registry tying the primitives together

## Supporting Files

- `entity-id.ts` — `EntityId` type definition
- `validation.ts` — pure data validation helpers (asObject, asArray, asNumber, asString, asBoolean)
- `test-utils.ts` — `createTestWorld()`, `GenericEntityBuilder`, `entity()` — domain-neutral fluent helpers for ECS unit tests. Import via `@pierre/ecs/test-utils`.

## Opt-in Modules

Genre-specific helpers that layer on top of the primitives. Each ships as a separate subpath export so consumers only pay for what they import.

Modules live under `src/modules/<name>/` and are exported via the wildcard `@pierre/ecs/modules/*` subpath (one folder per module, each with its own `index.ts` barrel).

- `turn-based/` — `TurnCycler` for round-robin active-turn rotation across tagged entities. Import via `@pierre/ecs/modules/turn-based`. See the [general-purpose-ecs-roadmap](../../../docs/roadmap/general-purpose-ecs-roadmap.md) Module Catalog for the broader module layering plan.
