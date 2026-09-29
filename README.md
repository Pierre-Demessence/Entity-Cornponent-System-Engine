# @pierre/ecs

Project-agnostic Entity-Component-System (ECS) primitives for 2D and 3D games
and simulations: component stores, typed queries, a spatial index, entity
templates, a scheduler, and an event bus — plus opt-in modules for rendering,
input, audio, collision, camera, motion, and more, many with both 2D and 3D
variants. Built for clarity and minimal overhead over hand-written ECS.

## Status

**Pre-release (`0.0.0`, `private: true`).** The API is still shifting as it's
validated across a suite of genre-spanning example games. Not yet published
to npm.

## What's included

Core (`@pierre/ecs`):

- **`EcsWorld`** — entity ids and liveness (`isAlive`, `entityCount`),
  component/tag registration, `spawn` from templates, typed `query`,
  `toJSON` / `loadJSON`, a deferred command buffer (`queueSpawn`,
  `queueAdd`, `queueRemove`, `queueDestroy`, `flushCommands`), plugins via
  `use`, and opt-in spatial indexing.
- **Component storage** — `simpleComponent` / `registryComponent` build a
  `ComponentDef<T>` from a schema. All-numeric components are stored
  columnar (typed-array Structure-of-Arrays, with a `column()` / `slotOf()`
  fast path); the rest use an object-backed `ComponentStore<T>`. `TagStore`
  holds data-less tags. Stores carry change ticks, mutation hooks, schema
  versioning with migrations, and dev-mode `requires` validation.
- **`QueryBuilder`** — typed queries with `withComponent`,
  `withoutComponent`, `withTag`, `without`, `anyOf`, `optional`, and the
  `added` / `changed` change filters, served from an archetype index.
- **`EntityTemplate`** — declarative prefabs with per-spawn overrides.
- **`EventBus<TEvent>`** — typed queue-and-flush pub/sub with handler
  priorities and `stopPropagation`. The world's `lifecycle` bus reports
  entity and component/tag changes.
- **`Scheduler<TCtx>`** — DAG-sorted systems (`runAfter` / `runBefore`),
  optional phases, `init` / `dispose` hooks, and a dev-mode check of declared
  `reads` / `writes`.
- **`TickRunner`** — the per-tick ceremony: run systems, flush events,
  commands and lifecycle.
- **`SpatialStructure`** — the spatial-index contract;
  `world.enableSpatial(def, structure)` wires one in (e.g. `HashGrid2D`
  from `modules/spatial`).

Opt-in modules (`@pierre/ecs/modules/<name>`) cover rendering (Canvas2D,
DOM), input, audio, collision, kinematics, motion, transforms, camera,
tilemaps and TMX, animation, particles, AI (FSM, behavior tree, GOAP,
steering, pathfinding), save/load, math, noise, RNG, workers, and more,
many with 2D and 3D variants. Each documents itself in
[`src/modules/<name>/README.md`](./src/modules/).

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
import { simpleComponent } from '@pierre/ecs/component-store';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { EcsWorld } from '@pierre/ecs/world';

interface Pos { x: number; y: number }
const PosDef = simpleComponent<Pos>('pos', { x: 'number', y: 'number' });

const world = new EcsWorld();
world.registerComponent(PosDef);
world.enableSpatial(PosDef, new HashGrid2D());

const id = world.spawn({ name: 'marker', components: { pos: { x: 0, y: 0 } } });
world.move(id, 3, 4);

for (const [entity, pos] of world.query(PosDef)) {
  console.log(entity, pos.x, pos.y);
}
```

Longer walkthrough and full API in [`docs/`](./docs/).

## Documentation

Published site: [pierre-demessence.github.io/Entity-Cornponent-System-Engine](https://pierre-demessence.github.io/Entity-Cornponent-System-Engine/)
— an engine overview, a [Manual](https://pierre-demessence.github.io/Entity-Cornponent-System-Engine/manual/)
with a guide per module, and the full [API reference](https://pierre-demessence.github.io/Entity-Cornponent-System-Engine/api/).

**Start here:** [Engine API surface](./docs/agent/engine-api.md) — a flat,
one-line-per-symbol catalog of every public export with its signature and
JSDoc summary, grouped by import path. The fastest way to find an existing
helper before hand-rolling one (regenerate with `npm run docs:api`).

Per-primitive deep dives live beside their source in `src/` (and publish to the
[Manual](https://pierre-demessence.github.io/Entity-Cornponent-System-Engine/manual/)):

- [World](./src/world.md)
- [ComponentStore](./src/component-store.md)
- [SpatialStructure](./src/spatial-structure.md) — interface; concrete backends under [`src/modules/spatial/`](./src/modules/spatial/README.md)
- [QueryBuilder](./src/query.md)
- [EntityTemplate](./src/template.md)
- [EventBus](./src/event-bus.md)
- [Scheduler](./src/scheduler.md)
- [Tick](./src/tick.md) — `TickSource` interface + `TickRunner`; concrete sources under [`src/modules/tick/`](./src/modules/tick/README.md)

## License

MIT — see [LICENSE](./LICENSE).
