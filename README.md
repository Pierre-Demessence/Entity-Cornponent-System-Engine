# @pierre/ecs

Project-agnostic Entity-Component-System (ECS) primitives for 2D games and
simulations: component stores, typed queries, a spatial index, entity
templates, a scheduler, and an event bus — plus opt-in modules (rendering,
input, audio, collision, camera, motion, and more). Built for clarity and
zero runtime cost over raw ECS throughput.

## Status

**Pre-release (`0.0.0`, `private: true`).** The API is still shifting as it's
validated across a suite of genre-spanning example games. Not yet published
to npm.

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

This package is not yet published to npm. Consume it locally as a sibling
folder via `file:` install:

```jsonc
// consumer's package.json
{
  "dependencies": {
    "@pierre/ecs": "file:../Entity-Cornponent-System-Engine"
  }
}
```

The package's `exports` field points at TypeScript sources directly, so
no build step is required for consumers using a TS-aware bundler (Vite,
esbuild, etc.). Edits in this repo are picked up live by the consumer.

```ts
import { ComponentStore, EcsWorld, QueryBuilder } from '@pierre/ecs';
```

## Local development

```sh
npm install     # installs devDeps + links example workspaces
npm test        # run the engine unit tests (vitest)
npm run lint    # eslint
```

Each example under `examples/` is its own workspace package and depends
on the engine via `file:../..`. Build any example with:

```sh
cd examples/snake
npm run build
```

The aggregate `examples/hub` mounts every example into a single dev app.

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

**Start here:** [Engine API surface](./docs/agent/engine-api.md) — a flat,
one-line-per-symbol catalog of every public export, grouped by import path.
The fastest way to find an existing helper before hand-rolling one
(regenerate with `npm run docs:api`).

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
