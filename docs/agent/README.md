---
last-updated: 2026-05-07
applicable: ["src/**", "examples/**"]
owner: agent
---

# Agent Operational Doc

## Purpose

`@pierre/ecs` — TypeScript ECS engine: domain-neutral core primitives in
`src/` + opt-in modules under `src/modules/<name>/`. Consumed via
`file:` install by the sibling `Roguelike/` repo and by the 9
prototype workspaces under `examples/*`.

## Scripts

- `npm run lint` — ESLint check (`eslint --cache .`)
- `npm run lint:fix` — ESLint with autofix
- `npm test` — Vitest tests (`vitest run`)
- `npm run test:watch` — Vitest in watch mode
- `npx tsc --noEmit` — Type-check only (no build step; package ships as TypeScript source consumed via `file:` install)

## Git Hooks (Husky)

- **pre-commit**: `CI=1 npx lint-staged` — ESLint --fix on staged `.ts`/`.tsx`/`.yml`/`.yaml` files
- **pre-push**: `npm test` — full Vitest run

## Key Paths

### Core primitives (`src/`)

- `src/index.ts` — public barrel for the root export `@pierre/ecs`
- `src/world.ts` — `EcsWorld`: registry of component stores + tag stores + spatial + tick + scheduler
- `src/component-store.ts` — `ComponentStore<T>`, `TagStore`, `ComponentDef`, `simpleComponent`, `registryComponent`, store hooks (set/delete/validate)
- `src/query.ts` — `QueryBuilder`: fluent typed entity queries with tag filters
- `src/scheduler.ts` — `Scheduler`: DAG-based system ordering with topological sort, init/dispose
- `src/event-bus.ts` — `EventBus`: queue-and-flush, priorities, propagation control, nested flush
- `src/lifecycle.ts` — lifecycle event types: `EntityCreated`, `EntityDestroyed`, `ComponentAdded`, `ComponentRemoved`
- `src/template.ts` — `EntityTemplate` interface + `composeTemplates`
- `src/tick-source.ts` — `TickSource`, `TickInfo` (interface only)
- `src/tick-runner.ts` — `TickRunner`: drives tick + flushes registered event buses
- `src/spatial-structure.ts` — `SpatialStructure<TPos>` interface (no impl in core)
- `src/input-source.ts` — `InputProvider`, `InputRawEvent` (interface only)
- `src/audio-provider.ts` — `AudioProvider`, `AudioHandle`, `AudioPlayOptions` (interface only)
- `src/renderer.ts` — `Renderer<TCtx>` interface (no impl in core)
- `src/entity-id.ts` — `EntityId` opaque type
- `src/validation.ts` — `asArray`, `asBoolean`, `asNumber`, `asObject`, `asString`
- `src/test-utils.ts` — `createTestWorld()`, `GenericEntityBuilder`, `entity()` (exported as `@pierre/ecs/test-utils`)

### Modules (`src/modules/<name>/`, exported as `@pierre/ecs/modules/<name>`)

- `modules/asset-loader/` — generic asset registry + loader
- `modules/audio/` — Web Audio backed `AudioProvider`
- `modules/camera/` — 2D / 3D camera entities + drag-pan helper
- `modules/collision/` — AABB / sweep / hit events
- `modules/grid-based/` — grid-coordinate utilities (turn-based, roguelike-shape genres)
- `modules/input/` — keyboard / pointer / gamepad `InputProvider`s
- `modules/kinematics/` — velocity / acceleration / friction
- `modules/lifetime/` — `LifetimeDef { remainingMs }` + auto-destroy (Path-B canon, see `docs/extending-the-engine.md` worked example)
- `modules/motion/` — high-level movement helpers
- `modules/pathfinding/` — A* / flow-field
- `modules/render-canvas2d/` — Canvas 2D `Renderer<TCtx>`
- `modules/render-dom/` — DOM `Renderer<TCtx>`
- `modules/save/` — save-load registry, IndexedDB backend
- `modules/scene-transition/` — fade / cut transitions
- `modules/spatial/` — `HashGrid2D`, `HashGrid3D`, projection helpers (concrete impls of core's `SpatialStructure` interface)
- `modules/tick/` — `ManualTickSource`, `FixedIntervalTickSource`
- `modules/transform/` — `PositionDef`, `RotationDef`, `ScaleDef`
- `modules/turn-based/` — turn-cycler, initiative

### Tests

- `*.test.ts` colocated with source under `src/` and `src/modules/<name>/`
- `vitest.config.ts` — root config; modules and examples inherit

### Docs

- [`docs/README.md`](../README.md) — full docs index
- [`docs/extending-the-engine.md`](../extending-the-engine.md) — promotion paths (A/B/C), layering principles, tradeoffs, prior art
- [`docs/roadmap/core-engine-roadmap.md`](../roadmap/core-engine-roadmap.md) — open core-internals work
- [`docs/roadmap/ecs-module-backlog.md`](../roadmap/ecs-module-backlog.md) — open module work
- [`docs/roadmap/prototype-games-roadmap.md`](../roadmap/prototype-games-roadmap.md) — proof-via-prototypes ladder
- `docs/<primitive>.md` — per-primitive docs (component-store, event-bus, query, scheduler, spatial-structure, template, tick, world)

## Invariants

- **Domain-neutral core.** `src/` (root level) contains zero references to game-shape concepts — no "player", "enemy", "tile", "turn", "score". If a primitive at the root mentions a genre concept, it's a leak; demote it.
- **Modules are tree-shakeable subpath exports.** Every `src/modules/<name>/` ships as `@pierre/ecs/modules/<name>` via the `exports` map in `package.json`. `sideEffects: false` keeps unused modules out of consumer bundles.
- **No module imports `@pierre/ecs` itself.** Modules import core primitives by relative path; never round-trip through the package barrel. No module imports another module unless the dependency is documented in that module's README.
- **Internal imports use `#*` aliases.** `package.json#imports` maps `#*` → `./src/*.ts`. Inside `src/`, prefer `from '#world'` over relative `from './world'`.
- **No enums.** Use `as const` objects (TypeScript `erasableSyntaxOnly`).
- **No `private` constructor parameter properties** (same reason).
- **Tests live alongside source.** `*.test.ts` next to the file under test; no separate `__tests__/` or top-level `test/`.
- **Single-symbol re-export shims are forbidden.** When migrating a symbol's home, delete the old file in the same change. Aggregating barrels (e.g. `src/index.ts`, `src/modules/<name>/index.ts`) re-exporting from many siblings are NOT relays — keep them.
- **Promotion rule-book is canon.** New core / module additions go through Path A / B / C in `docs/extending-the-engine.md`. Default to Path A under uncertainty.
- **Prototypes in `examples/` are first-class consumers.** Each `examples/<name>/POSTMORTEM.md` is the input to `docs/roadmap/ecs-module-backlog.md`. Don't treat them as throwaway demos.
- **Plan-file lifecycle.** Non-trivial work uses `docs/plans/<feature>.md` with a `[ ]` checklist. Move the plan to `docs/plans/done/<feature>.md` in the same commit as the final implementation change. `git mv` only works on tracked files.
