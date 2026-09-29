# Spatial Integration Generalized (core 2.6)

Roadmap entry: [core-engine-roadmap.md §2.6](../../roadmap/core-engine-roadmap.md)
(removed on delivery).
Canon: bevy_spatial (one index per tracked component, restricted to a marker
component), Unity / Godot physics broadphase (backend chosen per world,
populations separated by layer), Flecs / Bevy `Transform` being dimension
agnostic. Canon settles the shape; platformer-3d is the 3D consumer, pacman /
snake / game-of-life the 2D ones.

## Problem

`SpatialStructure<TPos>` is generic, but the world's wiring is not:

- `enableSpatial` / `move(id, x, y)` / `spatial` are hard-wired to `{x, y}`,
  so a 3D game cannot index `Position3D` through the world at all — the 3D
  examples brute-force their broadphase.
- A world may index exactly one component with one structure, so a 2D game
  cannot keep separate indexes for two populations (bodies and pickups) that
  share a position component.
- There is no 3D backend to plug in.

## Decisions

1. **`enableSpatial<T, S extends SpatialStructure<T>>(def, structure, options?)`.**
   Generic in the component's value type. Callable any number of times; the
   same structure instance twice throws. Returns `structure` with its own type,
   as today.
2. **Population filter: `options.withTag`.** An index with `withTag` holds
   only entities that have both the component and the tag. It tracks the tag's
   `add` / `delete` events as well as the store's `set` / `delete`, so the
   order components and tags arrive in does not matter. No tag = every holder
   of the component. Entities that already qualify when `enableSpatial` is
   called are indexed at once (the old wiring silently skipped them).
3. **`world.move(def, id, to)`** replaces `move(id, x, y)`. It calls
   `structure.move(id, current, to)` on every index bound to `def` that holds
   the entity, then writes `to`'s fields into the stored value and stamps the
   change. Throws when `def` has no index (the old guard, per component). A
   no-op when the entity lacks the component.
4. **`world.spatial` is removed.** Consumers keep the typed handle
   `enableSpatial` returns — on a world subclass (game-of-life's pattern) or
   in their game state.
5. **`clearAll` clears every bound structure**; `loadJSON` keeps relying on the
   store / tag `delete` events, as today.
6. **`HashGrid3D` in `modules/spatial`**, implementing
   `SpatialStructure<{x, y, z}>` over continuous positions: `cellSize`
   (default `1`) projects positions to cells internally. It stores a copy of
   each entity's position, so `queryNear` / `queryRect` are exact (Euclidean
   / inclusive AABB), as the contract states; `queryAt(pos)` returns the
   entities in the cell containing `pos`.
7. **platformer-3d pickups** move onto a coin-only `HashGrid3D`
   (`withTag: CoinTag`), replacing the all-coins brute-force broadphase with
   a `queryNear` around the player (radius = sum of the cubes'
   half-diagonals, so no overlapping coin is missed).
8. **game-of-life adopts `withTag: CellTag`.** Its grid indexed ghosts and HUD
   text beside live cells and filtered them with a predicate on every lookup;
   the cell-only index drops the predicate.

## Checklist

- [x] `src/world.ts`: generic multi-binding `enableSpatial` with `withTag`;
      `move(def, id, to)`; drop `spatial` getter and `spatialDef`; clear all
      structures in `clearAll`. Export `SpatialOptions`.
- [x] `src/world.test.ts`: generic `TPos`; two indexes on one component split
      by tag; tag added before / after the component; tag removed; component
      replaced and deleted; `destroyEntity`; `clearAll`; `move` updates only
      member indexes and writes + stamps; `move` without an index throws;
      same structure twice throws.
- [x] `src/modules/spatial/hash-grid-3d.ts` + tests; barrel export.
- [x] Migrate snake, pacman (world subclasses holding the grid handle),
      game-of-life (cell-only index), platformer-3d pickups (+ manifest
      `spatial` module).
- [x] Docs: `src/world.md`, `src/spatial-structure.md`,
      `src/modules/spatial/README.md` (HashGrid3D section),
      `website/manual/concepts/model.md`, `website/manual/guides/troubleshooting.md`,
      backlog note on the future `HashGrid3D` (now shipped),
      `docs/extending-the-engine.md` tradeoff example.
- [x] Remove §2.6 from the roadmap and the suggested order.
- [x] `npm run docs:api`, `npm run docs:usage`.
- [x] Gate: lint, typecheck, typecheck:examples, test.
- [x] Peer review (haiku, one pass).
