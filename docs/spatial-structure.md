# Spatial Structure

Spatial indexing is a two-layer design: a **core interface** describing the
minimum contract every spatial backend satisfies, and **module implementations**
that plug in backend-specific storage.

## Core Interface (`packages/ecs/src/spatial-structure.ts`)

```ts
interface SpatialStructure<TPos> {
  add(id: EntityId, pos: TPos): void;
  remove(id: EntityId, pos: TPos): void;
  move(id: EntityId, from: TPos, to: TPos): void;
  queryAt(pos: TPos): Iterable<EntityId>;
  queryRect(min: TPos, max: TPos): Iterable<EntityId>;
  queryNear(pos: TPos, radius: number): Iterable<EntityId>;
  clear(): void;
}
```

Query methods return `Iterable<EntityId>` (never `Set` or `Array`). Lazy
backends (quadtree, R-tree, BVH) can yield entities without materializing
intermediate collections. Consumers that need `Set` semantics call
`new Set(queryAt(pos))` explicitly — no assumption about storage leaks
into the contract.

`TPos` is the position shape: `{x, y}` for 2D, `{x, y, z}` for 3D,
`{min, max}` for AABBs, etc. Pick it to match what your backend indexes.

Import via `@pierre/ecs/spatial-structure`.

## Implementations

Concrete backends live under `packages/ecs/src/modules/spatial/`. See
[`src/modules/spatial/README.md`](../src/modules/spatial/README.md) for the
current implementations (`HashGrid2D`, projection helpers) and
`enableSpatial` wiring.

## Why an interface?

- **Pay for what you use.** Games on a grid keep the zero-overhead
  `HashGrid2D`. Games with continuous positions swap in `QuadTree`
  without touching any system code.
- **Testability.** Mock `SpatialStructure<TPos>` implementations isolate
  the rest of the engine in tests.
- **Pluggability.** Plugins or mods can ship alternative indexing
  strategies (e.g. multi-resolution pyramids for large worlds) without
  forking the engine.

## See also

- [EcsWorld](world.md) - `world.enableSpatial(def)` wires a structure to component mutations.
- [`src/modules/spatial/README.md`](../src/modules/spatial/README.md) - concrete `HashGrid2D` backend.

