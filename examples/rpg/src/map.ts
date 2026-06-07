import type { EcsWorld } from '@pierre/ecs';
import type { TmxMap } from '@pierre/ecs/modules/tmx';

import {
  RenderableDef,
  RenderOrderDef,
} from '@pierre/ecs/modules/render-canvas2d';
import { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';
import { gidToFrame, parseTmx } from '@pierre/ecs/modules/tmx';
import { PositionDef, RotationDef, ScaleDef } from '@pierre/ecs/modules/transform';

import { tileTransform } from './flip';

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
  const frames: Record<string, { h: number; w: number; x: number; y: number }> = {};
  for (const layer of map.layers) {
    for (const gid of layer.gids) {
      if (gid === 0)
        continue;
      const key = String(gid);
      frames[key] ??= gidToFrame(gid, map.tilesets[0]);
    }
  }
  return { atlas: new TextureAtlasRegistry().add(MAP_ATLAS, image, frames), map };
}

/**
 * Spawns one sprite entity per non-empty tile across every layer, anchored at
 * the tile centre so per-tile flip flags resolve to an in-place rotate/scale.
 * `RenderOrderDef` = layer index keeps upper layers on top.
 */
export function spawnTiles(world: EcsWorld, map: TmxMap): number {
  const positions = world.getStore(PositionDef);
  const renderables = world.getStore(RenderableDef);
  const orders = world.getStore(RenderOrderDef);
  const scales = world.getStore(ScaleDef);
  const rotations = world.getStore(RotationDef);
  const half = map.tileWidth / 2;
  const halfH = map.tileHeight / 2;
  let count = 0;

  map.layers.forEach((layer, layerIndex) => {
    for (let i = 0; i < layer.gids.length; i++) {
      const gid = layer.gids[i]!;
      if (gid === 0)
        continue;
      const col = i % layer.width;
      const row = Math.floor(i / layer.width);
      const id = world.createEntity();
      positions.set(id, {
        x: col * map.tileWidth + half,
        y: row * map.tileHeight + halfH,
      });
      renderables.set(id, {
        anchor: 'center',
        atlas: MAP_ATLAS,
        dh: map.tileHeight,
        dw: map.tileWidth,
        frame: String(gid),
        kind: 'sprite',
      });
      orders.set(id, { value: layerIndex });

      const t = tileTransform(layer.flags[i]!);
      if (t.angle !== 0)
        rotations.set(id, { angle: t.angle });
      if (t.sx !== 1 || t.sy !== 1)
        scales.set(id, { x: t.sx, y: t.sy });
      count++;
    }
  });
  return count;
}

export interface CollisionGrid {
  height: number;
  /** Row-major: `1` blocks movement, `0` is walkable. */
  solid: Uint8Array;
  width: number;
}

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
  const { height, width } = map;
  const solid = new Uint8Array(width * height);
  const ground = map.layers[0]!;
  for (let i = 0; i < solid.length; i++) {
    let blocked = !floorGroundGids.has(ground.gids[i] ?? 0);
    if (!blocked) {
      for (let l = 1; l < map.layers.length; l++) {
        const gid = map.layers[l]!.gids[i] ?? 0;
        if (gid !== 0 && !walkablePropGids.has(gid)) {
          blocked = true;
          break;
        }
      }
    }
    solid[i] = blocked ? 1 : 0;
  }
  return { height, solid, width };
}
