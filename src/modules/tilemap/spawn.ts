import type { EcsWorld, EntityId } from '@pierre/ecs';
import type { TmxMap } from '@pierre/ecs/modules/tmx';

import { RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { TMX_FLIP_H, TMX_FLIP_V } from '@pierre/ecs/modules/tmx';
import { PositionDef } from '@pierre/ecs/modules/transform';

export interface SpawnTilemapOptions {
  /**
   * Anchor for spawned tile sprites. `'top-left'` (default) places the
   * tile's top-left corner at the grid-aligned position — no extra
   * transform components are needed for H/V flips. `'center'` centres the
   * sprite on the tile cell so per-tile flip/rotate transforms pivot
   * correctly (required when applying {@link tileTransform} in `onTile`).
   */
  anchor?: 'center' | 'top-left';
  /**
   * Atlas registry key written into each spawned sprite's
   * `RenderableDef.atlas`. Must match a key previously registered via
   * {@link buildTilemapAtlas} or directly on `TextureAtlasRegistry`.
   */
  atlas: string;
  /** Parsed TMX map whose visible tile layers supply the tile grid. */
  map: TmxMap;
  /** World to spawn tile entities into. */
  world: EcsWorld;
  /**
   * Called for each spawned tile entity after the standard components are
   * written. Consumers use this to add extra components — for example
   * {@link RotationDef} + {@link ScaleDef} resolved from the full D4
   * dihedral group via {@link tileTransform}.
   *
   * @param id       The newly created entity.
   * @param gid      The flag-masked global tile ID (0 = empty, skipped).
   * @param flags    Per-tile flip bitfield (`TMX_FLIP_H | V | D`).
   * @param layerIndex  Zero-based layer index (bottom layer = 0).
   */
  onTile?: (id: EntityId, gid: number, flags: number, layerIndex: number) => void;
}

/**
 * Spawns one sprite entity per non-empty tile across every visible layer
 * of the map. Each entity receives `PositionDef` (grid-aligned),
 * `RenderableDef` (sprite, with `flipH` / `flipV` resolved from H/V
 * flags), and `RenderOrderDef` (layer index so upper layers draw on top).
 *
 * Diagonal flips (`TMX_FLIP_D`) are **not** resolved automatically —
 * they cannot be expressed as `flipH` + `flipV` alone. Consumers needing
 * the full 8-orientation D4 dihedral group should set `anchor: 'center'`,
 * register `RotationDef` + `ScaleDef`, and apply {@link tileTransform}
 * inside the {@link onTile} callback.
 *
 * @returns The number of tile entities spawned.
 */
export function spawnTilemap(opts: SpawnTilemapOptions): number {
  const { atlas, map, onTile, world } = opts;
  const anchor = opts.anchor ?? 'top-left';

  const positions = world.getStore(PositionDef);
  const renderables = world.getStore(RenderableDef);
  const orders = world.getStore(RenderOrderDef);

  const halfW = anchor === 'center' ? map.tileWidth / 2 : 0;
  const halfH = anchor === 'center' ? map.tileHeight / 2 : 0;

  let count = 0;
  map.layers.forEach((layer, layerIndex) => {
    const layerW = layer.width;
    for (let i = 0; i < layer.gids.length; i++) {
      const gid = layer.gids[i]!;
      if (gid === 0)
        continue;

      const col = i % layerW;
      const row = Math.floor(i / layerW);
      const id = world.createEntity();

      positions.set(id, {
        x: col * map.tileWidth + halfW,
        y: row * map.tileHeight + halfH,
      });

      const flags = layer.flags[i]!;
      // When centre-anchored the consumer is expected to handle all
      // orientations via onTile + tileTransform (D4 dihedral group).
      // Setting flipH/flipV here would double up with the ScaleDef the
      // callback applies, canceling the flip. Top-left-anchored tiles use
      // flipH/flipV exclusively — they never carry RotationDef/ScaleDef.
      const needsFlipFlags = anchor === 'top-left';
      const flipH = (needsFlipFlags && (flags & TMX_FLIP_H) !== 0) || undefined;
      const flipV = (needsFlipFlags && (flags & TMX_FLIP_V) !== 0) || undefined;
      renderables.set(id, {
        anchor,
        atlas,
        dh: map.tileHeight,
        dw: map.tileWidth,
        frame: String(gid),
        kind: 'sprite',
        ...(flipH ? { flipH } : {}),
        ...(flipV ? { flipV } : {}),
      });

      orders.set(id, { value: layerIndex });

      onTile?.(id, gid, flags, layerIndex);
      count++;
    }
  });
  return count;
}
