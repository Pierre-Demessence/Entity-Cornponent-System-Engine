# Plan: `examples/tilemap` — render Kenney roguelike TMX

## Goal

Render `examples/tilemap/kenney_roguelike-rpg-pack/Map/sample_map.tmx` to a
canvas. **Barebone**: just the tile layers appearing. No character, no
movement, no map transition, no input, no camera panning.

## Source-of-truth facts (from the asset files)

- **Map**: orthogonal, `width=100` `height=100`, `tilewidth=16`
  `tileheight=16` → **1600×1600 px world**.
- **5 layers**, draw order top→bottom in file:
  1. `Ground/terrain` 2. `Ground overlay` 3. `Objects`
  4. `Doors/windows/roof` 5. `Roof object`
- Each layer: `<data encoding="base64" compression="zlib">` →
  little-endian `uint32` GID per cell (100×100×4 = 40000 bytes/layer).
- **Tileset** `Roguelike`, `firstgid=1`, `tilewidth=16` `tileheight=16`,
  `spacing=1`, **no `margin` attr → margin=0**.
- **Sheet**: `../Spritesheet/roguelikeSheet_transparent.png`, 968×526.
  Columns = `floor((968 - 0 + 1) / (16 + 1)) = 57`; rows =
  `floor((526 + 1) / 17) = 31` → **1767 tiles**. (Both fit exactly,
  confirming margin=0/spacing=1.)
- GID `0` = empty cell (skip). The top **4 bits** are flip/rotation flags
  (H `0x80000000`, V `0x40000000`, diagonal `0x20000000`, hex-rotate
  `0x10000000`) — recover the tile id with `& 0x0FFFFFFF` (the flips
  themselves are ignored for barebone; this map has none set).
- Format reference: this is the documented [Tiled TMX format](https://doc.mapeditor.org/en/stable/reference/tmx-map-format/).
  Spec confirms: base64-decode → decompress → array of little-endian
  `uint32` GIDs. We support **only** `base64` + `zlib` (this map's
  encoding); `csv`, `gzip`, `zstd`, infinite/chunked maps, object/image/
  group layers are out of scope.

## Approach — two phases (decided)

The concern splits across two promotion paths
([docs/extending-the-engine.md](../extending-the-engine.md)):

- **Pure TMX parser** (`xml → tileset metadata + GID arrays`) is **Path B**
  (well-known external format; canon does the rule-of-three's job). Ships
  with one consumer, minimal surface, cite the Tiled spec.
- **Tile→ECS integration** (entities/components, render strategy,
  layer→render-order) is **Path A** (opinionated game-shape, uncertain).
  Stays in the example until a 2nd consumer reveals the real shape.

**Sequencing**: build the parser as a clean, **DOM-free, ECS-free,
module-shaped** file inside the example first (`src/tmx.ts`), ship +
validate the example, **then promote the parser to `src/modules/tmx/`**
(Path B) in the same session once the example renders correctly. The
tile→entity/render glue stays example-local.

### Parser shape constraints (so promotion is mechanical)

`src/tmx.ts` must: import nothing from `@pierre/ecs` or its modules; use no
DOM APIs beyond `atob` + `DecompressionStream` (both standard, runtime-
agnostic enough for the module layer); export pure functions + plain data
types only. Identical file content moves to `src/modules/tmx/tmx.ts`
unchanged at promotion time.

### Engine modules reused

- `@pierre/ecs`: `World`, `simpleComponent`.
- `@pierre/ecs/modules/transform`: `PositionDef`.
- `@pierre/ecs/modules/render-canvas2d`: `Canvas2DRenderer`,
  `RenderableDef` (`kind:'sprite'`, `anchor:'top-left'`), `RenderOrderDef`.
- `@pierre/ecs/modules/texture-atlas`: `TextureAtlasRegistry` (one frame
  per used GID; structurally satisfies the renderer's `SpriteFrameSource`).
- `@pierre/ecs/modules/asset-loader`: `AssetLoader`, `imageAsset`,
  `textAsset`.

### Decompression

Native `DecompressionStream('deflate')` (handles zlib header). No deps.
base64 → `Uint8Array` (via `atob`) → inflate → `DataView` →
`getUint32(i*4, /*littleEndian*/ true)`.

## Tasks

### Phase 1 — example (prototype-local, parser module-shaped)

- [x] `examples/tilemap/package.json` — name
      `@pierre/ecs-example-tilemap`, `@pierre/ecs` `file:../..`, vite+ts
      devDeps (mirror an existing example).
- [x] `examples/tilemap/tsconfig.json` — extends `../../tsconfig.json`,
      `include: ["src"]`.
- [x] `examples/tilemap/vite.config.ts` — unique dev port (5182).
- [x] `examples/tilemap/index.html` — `#root`, `import { start }`.
- [x] `examples/tilemap/src/tmx.ts`:
  - `parseTmx(xml)` → `{ map:{w,h,tileW,tileH}, tileset:{firstgid,
    columns,tileW,tileH,spacing,margin,imageSource}, layers:[{name,
    gids:Uint32Array}] }`. Layer order preserved. Mask GIDs `& 0x0FFFFFFF`.
  - `inflateLayerData(b64)` → `Promise<Uint32Array>` (async, uses
    `DecompressionStream`).
  - `gidToFrame(gid, tileset)` → `{x,y,w,h}` source rect.
  - Image path resolved relative to the `.tmx` URL.
- [x] `examples/tilemap/src/main.ts`:
  - `start(container)`: load `.tmx` text + sheet image via `AssetLoader`.
  - Build `TextureAtlasRegistry`: for each **unique** non-zero GID across
    all layers, `add`/register frame `String(gid)` → rect from
    `gidToFrame`. (Register under one atlas name, e.g. `'roguelike'`.)
  - Spawn one entity per non-zero cell: `PositionDef{x:col*16,y:row*16}`,
    `RenderableDef{kind:'sprite',atlas:'roguelike',frame:String(gid),
    dw:16,dh:16,anchor:'top-left'}`, `RenderOrderDef{value:layerIndex}`.
  - `Canvas2DRenderer.render({ctx2d, world, atlases:registry})` **once**
    after load (static — no rAF/tick loop required).
  - Canvas sized to a viewport; apply a fit `ctx.scale`/`translate` so the
    1600×1600 map is visible (or size canvas to full map + CSS max-width).
  - Return a teardown that detaches.
  - Loading/empty + error states (asset 404, unsupported compression).
- [x] `examples/tilemap/POSTMORTEM.md`: what shape-validation revealed —
      per-tile-entity count, renderer throughput, whether a batched
      `tilemap` module is warranted; feed
      `docs/roadmap/ecs-module-backlog.md`.
- [x] Register in `examples/hub`: `package.json` dep +
      `src/main.ts` (`ExampleId` union, manifest entry with `load:
      () => import('@pierre/ecs-example-tilemap/src/main.ts')`).
- [x] Update `examples/README.md` listing if it enumerates examples.
- [x] Validate: `tsc --noEmit` (root + example), example `vite build`,
      then **E2E in the browser** — confirm all 5 layers visibly stack
      and tiles align (no off-by-one in GID→rect).

### Phase 2 — promote parser to `modules/tmx` (Path B, after Phase 1 green)

- [x] Create `src/modules/tmx/tmx.ts` (moved verbatim from the example),
      `tmx.test.ts` (round-trip a known base64+zlib layer → GIDs;
      `gidToFrame` math; flag-bit masking), `index.ts` barrel, `README.md`
      (scope: base64+zlib, orthogonal, single tileset; cite Tiled spec;
      list out-of-scope encodings/layer types).
- [x] ~~Add the `@pierre/ecs/modules/tmx` subpath to root `package.json`
      `exports` map~~ — **not needed**: the existing wildcard
      `"./modules/*": "./src/modules/*/index.ts"` auto-resolves it.
- [x] Repoint the example to import the parser from
      `@pierre/ecs/modules/tmx`; delete the example's local `tmx.ts`
      (no relay shim — AGENTS.md).
- [x] Re-validate root `tsc`/`vitest`, example build + browser E2E.
- [x] Note the promotion in
      `docs/roadmap/ecs-module-backlog.md`. (`docs/README.md` has no
      per-module map — it points at the `src/modules/` catalog, which the
      new `README.md` joins automatically.)

### Phase 3 — pan/zoom (added post-render, on request)

The "barebone static" scope was relaxed: at full-map fit-scale the
individual tiles are too small to read, so the example needs to be
explorable.

- [x] Native-resolution render (1600×1600) to kill `ctx.scale` downscale
      seams; the dark background was bleeding through 1px tile gaps.
- [x] Pan/zoom via a CSS `transform` on the canvas inside an
      overflow-hidden viewport (zoom-toward-cursor wheel + pointer drag).
      Not the engine `modules/camera` — it has no zoom (deferred in the
      backlog), and a single static raster doesn't need a render-time
      camera. Starts zoomed (`INITIAL_ZOOM=1.3`) on world `(570, 500)`.
- [x] Live overlay showing current `zoom` + viewport-center world
      coordinate, so the default focus can be dialled in by eye.
- [x] Update hub manifest controls text + POSTMORTEM.

## Open decisions (confirm before/while implementing)

1. **Viewport**: fit-scale the whole 1600² map into ~800px, OR native-size
   canvas with CSS scroll/max-width? (Barebone leans fit-scale.)
2. **Entity-per-tile vs. single custom draw pass**: per-tile sprite
   entities is the honest test of the existing renderer (preferred for
   shape-validation data). Accept the ~10k–18k entity count for a static
   scene.

## Out of scope (explicit)

Player/character, movement, collision, map transitions, animation, tile
flipping, multiple tilesets, infinite/chunked maps, CSV/uncompressed TMX
encodings (only base64+zlib needed here).
