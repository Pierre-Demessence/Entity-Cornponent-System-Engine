# `@pierre/ecs/modules/tmx`

Parse [Tiled](https://www.mapeditor.org/) `.tmx` maps into plain data and
resolve global tile ids to tileset source rectangles. Pure and DOM-free
(apart from the standard `atob` + `DecompressionStream` web APIs), so it
runs unchanged in the browser and under `jsdom`. Pairs with the `sprite`
renderable kind in
[`modules/render-canvas2d`](../render-canvas2d/README.md) and the frame
lookup in [`modules/texture-atlas`](../texture-atlas/README.md).

## Scope

Deliberately minimal — only what an image-based orthogonal map needs:

- orthogonal maps with a **single image-based tileset**,
- tile-layer `<data>` encoded as `base64` and compressed with `zlib`.

Everything else throws (or, for flip flags, is silently masked) rather
than mis-rendering:

- `csv` / `gzip` / `zstd` / uncompressed `<data>` encodings,
- multiple tilesets or external `.tsx` tilesets,
- object, image, or group layers,
- infinite / chunked maps,
- tile flip & rotation flags — the top 4 bits of each gid are masked
  off so callers see clean local tile ids.

## `parseTmx(xml)`

Async (it awaits `DecompressionStream`). Returns a `TmxMap`:

```ts
const map = await parseTmx(tmxText);
// map.width / map.height        — grid size in tiles
// map.tileWidth / map.tileHeight
// map.tileset                   — the single TmxTileset
// map.layers                    — TmxLayer[] in file order (bottom-most first)
```

Each `TmxLayer` carries a row-major `Uint32Array` of global tile ids
where `0` marks an empty cell.

## `gidToFrame(gid, tileset)`

Maps a non-zero global tile id to its source rectangle within the
tileset image, accounting for `margin`, `spacing`, and the derived
column count:

```ts
const frame = gidToFrame(gid, map.tileset);
// → { x, y, w, h } in tileset-image pixels
```

## End-to-end

The consumer composes loading itself — typically with
[`modules/asset-loader`](../asset-loader/README.md) — then registers one
[`texture-atlas`](../texture-atlas/README.md) frame per unique gid and
spawns a sprite entity per non-empty cell:

```ts
const [tmxText, image] = await loader.loadMany([
  textAsset('/level.tmx'),
  imageAsset('/tileset.png'),
]);
const map = await parseTmx(tmxText);

const registry = new TextureAtlasRegistry();
const frames: Record<string, TmxFrame> = {};
for (const layer of map.layers)
  for (const gid of layer.gids)
    if (gid !== 0 && frames[String(gid)] === undefined)
      frames[String(gid)] = gidToFrame(gid, map.tileset);
registry.add('level', image, frames);

// spawn one sprite entity per non-empty cell, ordered by layer index…
```

See [`examples/tilemap`](../../../examples/tilemap/) for the full
parse → atlas → spawn → render pipeline.
