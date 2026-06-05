---
last-updated: 2026-06-05
applicable: ["src/**", "examples/**", "scripts/**"]
owner: agent
---

# Agent Operational Doc

## Purpose

`@pierre/ecs` — TypeScript ECS engine: domain-neutral core primitives in
`src/` + opt-in modules under `src/modules/<name>/`. Consumed via
`file:` install by the prototype workspaces under `examples/*`.

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

The core primitive surface is catalogued in
[`docs/README.md`](../README.md) (Primitives + Supporting Files). Each
primitive also has a dedicated page under [`docs/`](../).

### Discovering engine capabilities (read before authoring a consumer)

[`engine-api.md`](engine-api.md) is a generated, one-line-per-symbol catalog
of the **entire public surface** — every `@pierre/ecs/*` and
`@pierre/ecs/modules/*` export plus its JSDoc summary. Read it first to find an
existing helper before hand-rolling one in an example (the cheap alternative to
opening every module README, and the fix for reinventing shipped primitives).

- Regenerate after changing any public export: `npm run docs:api`.
- A drift test (`scripts/engine-api.test.ts`) fails `npm test` if it is stale.

### Modules (`src/modules/<name>/`, exported as `@pierre/ecs/modules/<name>`)

Each module is exported as `@pierre/ecs/modules/<name>` and documents itself in
its own `src/modules/<name>/README.md` (deep reference). For the one-read
capability map across all modules, use [`engine-api.md`](engine-api.md).

### Tests

- `*.test.ts` colocated with source under `src/` and `src/modules/<name>/`
- `vitest.config.ts` — root config; modules and examples inherit

### Docs

- [`docs/README.md`](../README.md) — full docs index
- [`docs/extending-the-engine.md`](../extending-the-engine.md) — the sliding-scale promotion rule, layering principles, tradeoffs, prior art
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
- **Promotion rule-book is canon.** New core / module additions go through the sliding-scale evidence rule in `docs/extending-the-engine.md`: canon and internal consumers are interchangeable proof (unanimous canon → 0 consumers, solid canon → 1, novel shape → 2). The examples are deliberately generic, so don't reflexively defer canon.
- **Prototypes in `examples/` are first-class consumers.** Engine gaps they surface go to `docs/roadmap/engine-gap-ledger.md` (symptom only, no module decision); a triage pass promotes them into `docs/roadmap/ecs-module-backlog.md`. Don't treat the examples as throwaway demos.
- **Plan-file lifecycle.** Non-trivial work uses `docs/plans/<feature>.md` with a `[ ]` checklist. Move the plan to `docs/plans/done/<feature>.md` in the same commit as the final implementation change. `git mv` only works on tracked files.
