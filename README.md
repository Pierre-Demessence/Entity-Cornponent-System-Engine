# @pierre/ecs

Project-agnostic Entity-Component-System (ECS) primitives extracted from
a TypeScript roguelike game. Designed for small to mid-scale turn-based
projects where clarity and zero runtime cost matter more than raw ECS
throughput.

## Status

**Pre-release (`0.0.0`, `private: true`).** The API is still shifting as
it's validated inside its first consumer. Not yet published to npm.

## What's included

- **`ComponentStore<T>`** — typed sparse storage for components with
  optional dev-mode `requires` validation and mutation hooks.
- **`TagStore`** — boolean-tag storage with the same hook surface.
- **`SpatialIndex`** — tile-keyed entity index kept in sync via store
  hooks (opt-in via `world.enableSpatial(def)`).
- **`QueryBuilder`** — multi-store intersection queries with typed
  iteration.
- **`EntityTemplate` + `world.spawn()`** — declarative prefab system
  with per-spawn overrides.
- **`EventBus<TEvent>`** — typed pub/sub bus with context (entity,
  turn, source).
- **`Scheduler<TCtx>`** — DAG-sorted system runner with `runAfter`/
  `runBefore` dependencies.
- **`EcsWorld`** — integrates all of the above into a single lifecycle
  with id allocation, component/tag registration, `spawn`, `query`,
  `toJSON`/`loadJSON`, and opt-in spatial wiring.

## Installation

This package is consumed locally via a TypeScript + Vite path alias.
See the consumer's `tsconfig.json` / `vite.config.ts` for alias setup.

```ts
import { EcsWorld, ComponentStore, QueryBuilder } from '@pierre/ecs';
```

Subpath imports are also supported for selective consumption:

```ts
import { EcsWorld } from '@pierre/ecs/world';
import type { ComponentDef } from '@pierre/ecs/component-store';
```

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
```

Longer walkthrough and full API in [`docs/`](./docs/).

## Documentation

See [`docs/`](./docs/) for per-primitive deep dives:

- [World](./docs/world.md)
- [ComponentStore](./docs/component-store.md)
- [SpatialStructure](./docs/spatial-structure.md) — interface; concrete backends under [`src/modules/spatial/`](./src/modules/spatial/README.md)
- [QueryBuilder](./docs/query.md)
- [EntityTemplate](./docs/template.md)
- [EventBus](./docs/event-bus.md)
- [Scheduler](./docs/scheduler.md)
- [Tick](./docs/tick.md) — `TickSource` interface + `TickRunner`; concrete sources under [`src/modules/tick/`](./src/modules/tick/README.md)

## License

MIT — see [LICENSE](./LICENSE).
