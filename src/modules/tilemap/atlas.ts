import type { TmxMap } from '@pierre/ecs/modules/tmx';

import { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';
import { gidToFrame } from '@pierre/ecs/modules/tmx';

export interface BuildTilemapAtlasOptions {
  /** Atlas registry key set on every spawned sprite's `RenderableDef.atlas`. */
  name: string;
  /** The loaded tileset image (already fetched, decoded, ready to draw). */
  image: CanvasImageSource;
  /** Parsed TMX map whose tile layers supply the GIDs to resolve. */
  map: TmxMap;
}

/**
 * Collects every unique GID across all visible tile layers, resolves each
 * to its source rectangle via {@link gidToFrame}, and registers the frames
 * under `name` in a new {@link TextureAtlasRegistry}.
 *
 * The returned registry is ready to hand to
 * `Canvas2DRenderContext.atlases`. Callers that load multiple maps or
 * layer additional atlases on top can call `registry.add(...)` on the
 * result before passing it to the renderer.
 *
 * The atlas is built **synchronously** — the image must already be loaded.
 */
export function buildTilemapAtlas(opts: BuildTilemapAtlasOptions): TextureAtlasRegistry {
  const frames: Record<string, { h: number; w: number; x: number; y: number }> = {};
  for (const layer of opts.map.layers) {
    for (const gid of layer.gids) {
      if (gid === 0)
        continue;
      const key = String(gid);
      if (frames[key] === undefined)
        frames[key] = gidToFrame(gid, opts.map.tilesets[0]);
    }
  }
  return new TextureAtlasRegistry().add(opts.name, opts.image, frames);
}
