# Tilemap (Tiled TMX) — Postmortem

A small example that renders a [Tiled](https://www.mapeditor.org/)
`.tmx` map on top of `@pierre/ecs` with zero engine edits. The point was
not the map itself; it was being the **first sprite / texture-atlas
consumer** in the examples tree, and validating that a real third-party
asset format (TMX, base64 + zlib layer data) flows into the ECS as plain
per-tile sprite entities. A CSS-transform pan/zoom was added on top so
the 100×100 map is actually explorable.

Plan doc:
[../../docs/plans/done/tilemap-example.md](../../docs/plans/done/tilemap-example.md).

## What this prototype proved

- **The render + atlas + asset-loader + transform modules compose into a
  static scene with no glue beyond a tiny consumer file.** `AssetLoader`
  fetched the `.tmx` text and the sheet image, `TextureAtlasRegistry`
  held one frame per unique GID, and `Canvas2DRenderer` drew every tile
  from `PositionDef + RenderableDef{kind:'sprite'} + RenderOrderDef`.
- **`RenderOrderDef = layer index` is enough to stack Tiled layers.**
  Five layers (ground, water, decoration, buildings, interiors) rendered
  in the correct order by tagging each tile entity with its source layer
  index. No per-layer scene graph needed.
- **The renderer's per-entity sprite path is correct at ~10k entities.**
  The sample map produced 10,618 non-empty tile entities across 5 layers
  and rendered in a single `render()` call with visible-correct
  alignment to the map edges (no cumulative drift → tileset `spacing` /
  `margin` math in `gidToFrame` is right).
- **`DecompressionStream('deflate')` decodes Tiled's zlib layer data with
  zero dependencies.** The whole TMX parser is DOM-free except `atob`
  and `DecompressionStream`, both standard browser APIs.

## What was awkward

- **One entity per tile is wasteful for a static map.** 10,618 entities
  exist purely to be drawn once and never updated. For a scrolling or
  animated tilemap this would mean a `RenderOrderDef` sort over the whole
  set every frame. A batched "tilemap layer" renderable (one entity, one
  draw loop over a GID grid) is the obvious optimization — but it is a
  *second-consumer* concern, not something to promote off one example.
- **Vite asset handling needed `?url`, not `new URL(...)`.** Referencing
  the `.tmx` via `new URL('...tmx', import.meta.url)` did not emit the
  file (unknown extension). `import x from '...tmx?url'` forces emission;
  the small `.tmx` then inlines as a `data:` URI in the prod bundle,
  which `AssetLoader.fetchText` handles fine (only `javascript:` / `file:`
  schemes are blocked).
- **No flip/rotation support yet.** `gidToFrame` masks off the top 4 GID
  flag bits (`& 0x0FFFFFFF`) but the renderable has no per-tile flip, so
  a map that relies on flipped tiles would render them unflipped. The
  sample map does not, so this stayed out of scope.

## What was surprising

- **The texture-atlas module already had exactly the shape a tilemap
  wants.** `add(name, image, Record<frameName, {x,y,w,h}>)` maps cleanly
  onto "one frame per GID", with the GID string as the frame name. No
  new atlas surface was needed for the first atlas consumer.
- **A single static `render()` is a legitimate use of the renderer.**
  Nothing in the renderer assumes a tick loop; calling it once after
  load just works.
- **Downscaling a tilemap with `ctx.scale()` produces seams.** The first
  cut fit the 1600px map into an 800px viewport via `ctx.scale(0.5)` with
  `imageSmoothingEnabled = false`. The canvas rasterizer rounds some tile
  edges inconsistently, leaving 1px gaps (the dark background bled through
  as a grid) on *some* tiles but not others. Fix: render at the map's
  **native** pixel size (every 16px tile lands on an integer boundary, so
  neighbours abut exactly) and let **CSS** downscale the finished single
  raster (`image-rendering: pixelated`). Scaling one bitmap has no
  inter-tile seams. This is a pitfall any future batched-tilemap renderer
  will hit too.
- **Pan/zoom is a CSS transform on the canvas element, not an engine
  camera.** `modules/camera` only pans (zoom is explicitly deferred in
  the backlog because it invalidates the renderer's viewport-space
  assumptions). Since the map is a single static raster, a
  `translate(…) scale(…)` transform on the canvas inside an
  overflow-hidden viewport gives zoom-toward-cursor + drag-pan for free —
  no re-render, and `image-rendering: pixelated` keeps zoom-in crisp.
  This only works because the scene never changes; an animated tilemap
  would force the zoom/pan into the render transform and re-expose the
  seam problem, which is the real trigger for engine camera zoom.

## Engine changes required

None for the example itself. The TMX *parser* is promoted to
`@pierre/ecs/modules/tmx` (Path B) in the same change — see the plan
doc — but that is a new module, not an edit to existing engine code. The
tile → ECS integration glue stays example-local (Path A) until a second
tilemap consumer justifies promoting it.

## Follow-ups (not blocking)

- If a second tilemap consumer appears (scrolling, animated, or
  collision-bearing), revisit a batched tilemap-layer renderable instead
  of per-tile entities, and consider promoting the tile → ECS glue.
- Add tile flip/rotation to the sprite renderable + `gidToFrame` if a map
  that uses flipped GIDs shows up.
- External `.tsx` tilesets and CSV / uncompressed / gzip layer encodings
  are unimplemented; the parser throws on them deliberately. Add them
  when a real map needs them.
