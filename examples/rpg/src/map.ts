import type { EcsWorld } from '@pierre/ecs';
import type { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';
import type { CollisionGrid } from '@pierre/ecs/modules/tilemap';
import type { TmxMap } from '@pierre/ecs/modules/tmx';

import {
  buildCollisionGrid,
  buildTilemapAtlas,

  spawnTilemap,
  tileTransform,
} from '@pierre/ecs/modules/tilemap';
import { parseTmx } from '@pierre/ecs/modules/tmx';
import { RotationDef, ScaleDef } from '@pierre/ecs/modules/transform';

export const MAP_ATLAS = 'dungeon';

export interface LoadedMap {
  atlas: TextureAtlasRegistry;
  map: TmxMap;
}

/** Parses the TMX (with its external `.tsx`) and builds a frame-per-GID atlas. */
export async function loadMap(
  tmxText: string,
  tsxText: string,
  tsxSource: string,
  image: HTMLImageElement,
): Promise<LoadedMap> {
  const map = await parseTmx(tmxText, { tilesets: { [tsxSource]: tsxText } });
  return { atlas: buildTilemapAtlas({ name: MAP_ATLAS, image, map }), map };
}

/**
 * Spawns one sprite entity per non-empty tile across every layer, anchored at
 * the tile centre so per-tile flip flags resolve to an in-place rotate/scale.
 * `RenderOrderDef` = layer index keeps upper layers on top.
 */
export function spawnTiles(world: EcsWorld, map: TmxMap): number {
  return spawnTilemap({
    anchor: 'center',
    atlas: MAP_ATLAS,
    map,
    world,
    onTile: (id, _gid, flags) => {
      const t = tileTransform(flags);
      if (t.angle !== 0)
        world.getStore(RotationDef).set(id, { angle: t.angle });
      if (t.sx !== 1 || t.sy !== 1)
        world.getStore(ScaleDef).set(id, { x: t.sx, y: t.sy });
    },
  });
}

export { type CollisionGrid };

/**
 * Derives a walkability grid. A cell blocks movement unless its ground-layer
 * (bottom) tile is one of `floorGroundGids` AND every upper-layer tile on it is
 * either empty or one of `walkablePropGids` (floor decor such as chairs, rails,
 * and the bridge). Solid props — walls, furniture, and the baked-in NPC
 * characters — therefore keep blocking. Two allowlists are more robust than
 * trying to enumerate every wall/obstacle GID.
 */
export function buildCollision(
  map: TmxMap,
  floorGroundGids: ReadonlySet<number>,
  walkablePropGids: ReadonlySet<number>,
): CollisionGrid {
  return buildCollisionGrid(map, { floorGids: floorGroundGids, walkablePropGids });
}
