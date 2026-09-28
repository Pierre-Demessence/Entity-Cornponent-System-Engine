# Explicit spatial backend

`EcsWorld.enableSpatial(def, structure = new HashGrid2D())` is the one core →
module import (`world.ts` → `#modules/spatial/hash-grid-2d`), allowlisted in
`scripts/architecture.test.ts`. Its only purpose is the default argument. It
also costs every `EcsWorld` bundle the `HashGrid2D` class whether or not the
game enables spatial indexing, and `world.spatial` casts whatever backend was
passed to `HashGrid2D`, so TypeScript accepts grid-only calls on a backend that
lacks them.

A first step of core roadmap 2.6 (generalized spatial wiring), which needs the
world to name no concrete backend anyway.

## Design

- `enableSpatial<T, S extends SpatialStructure<{ x: number; y: number }>>(def, structure: S): S`
  — the structure is required and returned with its own type, so the caller
  keeps a precisely typed handle (`const grid = world.enableSpatial(PosDef, new HashGrid2D())`).
- `world.spatial` returns `SpatialStructure<{ x: number; y: number }>` — the
  contract, no cast.
- `world.ts` imports nothing from `src/modules/`; the `CORE_MODULE_EDGES`
  allowlist becomes empty, so any core → module import fails the test.
- A subclass that wants grid extras through `world.spatial` keeps its handle
  and narrows the getter (`override get spatial(): HashGrid2D`).

## Consumers

- `examples/snake` — uses the interface's `queryAt({ x, y })`.
- `../Roguelike` `World` — keeps a `HashGrid2D` field and narrows `spatial`,
  so its call sites are unchanged.

## Checklist

- [x] `world.ts`: required structure, typed return, honest `spatial` getter, import removed
- [x] `scripts/architecture.test.ts`: allowlist emptied, its unit test updated
- [x] `world.test.ts` spatial tests pass an in-test `SpatialStructure` fake (core tests stay module-free); test for the returned handle
- [x] Snake migrated
- [x] Roguelike migrated; its 873 tests green. Its typecheck adds no new errors: the 12 left predate this change (`ComponentStore<T>` fields typed against `registerComponent`, which returns `ComponentStoreLike<T>` since columnar storage shipped)
- [x] Docs: `world.md`, `spatial-structure.md`, `modules/spatial/README.md`, `extending-the-engine.md`, README + site quick start, core roadmap 2.6 problem text
- [x] `npm run docs:api` + `npm run docs:usage`
- [x] lint + typecheck + typecheck:examples + tests green
- [x] Peer review (haiku, one pass) — two findings fixed (a "(current default)" heading in the spatial README; the rest were stale generated site copies)
