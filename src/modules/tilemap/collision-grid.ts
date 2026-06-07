import type { TmxMap } from '@pierre/ecs/modules/tmx';

/**
 * A walkability mask for tile-based collision queries. Row-major, with
 * `1` meaning solid/blocked and `0` meaning walkable.
 *
 * Consumers query with `grid.solid[row * grid.width + col]` and interpret
 * the result as a boolean.
 */
export interface CollisionGrid {
  height: number;
  /** Row-major: `1` blocks movement, `0` is walkable. */
  solid: Uint8Array;
  width: number;
}

export interface BuildCollisionGridOptions {
  /**
   * GIDs that define walkable ground (typically the bottom layer's floor
   * tiles). A cell whose ground-layer tile is NOT in this set is always
   * solid regardless of upper layers.
   */
  floorGids: ReadonlySet<number>;
  /**
   * GIDs for walkable decorations on upper layers — chairs, rails, carpets
   * that sit on top of walkable ground without blocking movement. A cell
   * stays walkable when every upper-layer tile on it is either empty (gid
   * 0) or in this set. A tile whose GID is in **neither** allowlist on any
   * upper layer makes the cell solid (walls, furniture, NPC sprites baked
   * into the tile layer).
   */
  walkablePropGids: ReadonlySet<number>;
}

/**
 * Derives a walkability mask from layered tile GIDs using two allowlists
 * (floor + walkable props). More robust than enumerating every wall GID:
 * new obstacle tiles added to the map are automatically solid without
 * updating an exclusion list.
 *
 * Floor GIDs are always walkable. Walkable-prop GIDs override solid tiles on
 * upper layers. Everything else is solid.
 */
export function buildCollisionGrid(
  map: TmxMap,
  opts: BuildCollisionGridOptions,
): CollisionGrid {
  const { height, width } = map;
  const solid = new Uint8Array(width * height);
  const ground = map.layers[0]!;
  for (let i = 0; i < solid.length; i++) {
    let blocked = !opts.floorGids.has(ground.gids[i] ?? 0);
    if (!blocked) {
      for (let l = 1; l < map.layers.length; l++) {
        const gid = map.layers[l]!.gids[i] ?? 0;
        if (gid !== 0 && !opts.walkablePropGids.has(gid)) {
          blocked = true;
          break;
        }
      }
    }
    solid[i] = blocked ? 1 : 0;
  }
  return { height, solid, width };
}
