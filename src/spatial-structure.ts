import type { EntityId } from '#entity-id';

/**
 * Generic spatial index contract. Every spatial backend — hash-grid,
 * quadtree, octree, R-tree, BVH, brute-force — implements this minimum
 * surface. `TPos` is the position shape: `{x, y}` for 2D, `{x, y, z}` for
 * 3D, `{min, max}` for AABBs, etc.
 *
 * Query methods return `Iterable<EntityId>` (never `Set` or `Array`) so
 * lazy backends can yield without materializing intermediate collections.
 * Consumers that need `Set` semantics call `new Set(queryAt(pos))`
 * explicitly. Grid-specific extras like `HashGrid2D.getAt` (which returns
 * `ReadonlySet | undefined` directly) live on the implementation, not the
 * interface contract.
 *
 * @see `@pierre/ecs/modules/spatial` for the shipped `HashGrid2D` impl.
 */
export interface SpatialStructure<TPos> {
  /** Register an entity at a position. No-op if already present at that position. */
  add: (id: EntityId, pos: TPos) => void;

  /** Remove all entries. */
  clear: () => void;

  /** Move an entity from one position to another. Equivalent to remove+add but may skip work when positions are equivalent. */
  move: (id: EntityId, from: TPos, to: TPos) => void;

  /** All entity IDs at `pos`. Empty iterable if none. */
  queryAt: (pos: TPos) => Iterable<EntityId>;

  /**
   * All entity IDs within `radius` of `pos` (Euclidean, inclusive).
   * `radius` is in the same units as the position coordinates.
   */
  queryNear: (pos: TPos, radius: number) => Iterable<EntityId>;

  /** All entity IDs within an axis-aligned region (inclusive bounds). `min` / `max` are the region corners. */
  queryRect: (min: TPos, max: TPos) => Iterable<EntityId>;

  /** Unregister an entity from a position. No-op if not present. */
  remove: (id: EntityId, pos: TPos) => void;
}
