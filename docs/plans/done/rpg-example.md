# Top-down RPG / Adventure example

A small top-down RPG base built on `@pierre/ecs`: one player character
walks a Tiled dungeon map, a few NPCs stand around, and the player can
talk to them through a Kenney-UI dialogue box.

## Why this example exists (shape-validation goals)

- **First consumer of `modules/camera`** — and the first to drive a
  follow-camera through `Canvas2DRenderer` (translate the 2D context by
  the camera transform before `render`). Proves the camera module is not
  coupled to a specific renderer.
- **Pushes `modules/tmx` past its first map.** The tilemap example used a
  hand-made base64+zlib map with an inline tileset. This real Kenney map
  is **CSV-encoded, references an external `.tsx`, and uses flip flags** —
  three standard Tiled features the module did not support. Extending the
  module (rather than forking a parser into the example) is the engine
  work this example drives.
- **First sprite-flip rendering.** Flipped/rotated map tiles are honored
  by mapping Tiled's flip bits onto the renderer's existing `ScaleDef` /
  `RotationDef`, proving those components cover tile mirroring with no new
  renderable field.
- **First Kenney-UI consumer.** The dialogue box is a DOM overlay using a
  ui-pack nine-slice panel via CSS `border-image`.
- **Interaction model:** proximity + key-press to talk, multi-box dialogue
  advance — discrete game-state interaction over the live world.

## Assets

- Map: `examples/assets/kenney_tiny-dungeon/Tiled/sampleMap.tmx`
  (32×20 tiles @ 16px = 512×320 world px; layers Dungeon / Objects /
  Carts; CSV; external `sampleSheet.tsx`; flip flags).
- Map tileset image: `kenney_tiny-dungeon/Tilemap/tilemap.png`
  (203×186, spacing 1, 12 cols, 132 tiles).
- Player + NPC sprites: `kenney_tiny-dungeon/Tilemap/tilemap_packed.png`
  (192×176, 12 cols, no spacing) — characters in the bottom ~3 rows;
  exact tile indices pinned in-browser.
- Dialogue panel: a nine-slice from `examples/assets/kenney_ui-pack`.

## Engine change: `modules/tmx` (backward compatible)

- **CSV layer encoding** in `parseLayer` (split on commas, parse ints).
- **External `.tsx` tilesets**: `parseTmx(xml, { tilesets })` option maps
  a `source` path → its `.tsx` text; `firstgid` comes from the map's
  `<tileset>` reference, the rest from the `.tsx`.
- **Flip flags exposed**: add `TmxLayer.flags: Uint8Array` (per-tile bits
  `H=1 | V=2 | D=4`); keep `gids` flag-masked as before. Export
  `TMX_FLIP_H / V / D` constants. The base64 path fills `flags` too.
- Keep every existing throw for genuinely unsupported features (multiple
  tilesets, object/group/image layers, infinite maps, gzip/zstd).
- New unit tests cover CSV decode, external-tsx merge, and flag extraction
  alongside the existing base64 tests.

## Example design

- **Render:** small viewport (e.g. 24×15 tiles = 384×240), canvas
  upscaled with `image-rendering: pixelated`. Each non-empty map tile is a
  sprite entity (`PositionDef + RenderableDef + RenderOrderDef` = layer
  index), plus `ScaleDef`/`RotationDef` derived from flip flags. Player +
  NPCs are sprite entities on a layer above the map.
- **Camera:** `CameraDef` + `makeFollowCameraSystem` follows the player;
  the render loop translates `ctx2d` by `-(cam.x - viewportW/2), …` before
  `renderer.render`, clamped to map bounds.
- **Movement:** WASD/arrows, continuous pixel velocity. Collision against
  a walkability grid built from a whitelist of walkable floor tiles
  (`WALKABLE_GROUND`), AABB-vs-grid, axis-separated; clamped to map bounds.
- **NPCs:** a few placed on walkable floor tiles, each with a `dialog`
  (array of text boxes). Standing adjacent + pressing the talk key (E /
  Space) opens the dialogue; the same key advances boxes and closes after
  the last. At least one NPC has 1 box, another has ≥2 boxes. Movement is
  locked while a dialogue is open.
- **Dialogue UI:** a DOM panel overlaid on the canvas, nine-sliced from
  the ui-pack via `border-image`, showing the NPC line + an advance hint.

## Tasks

- [x] Extend `modules/tmx`: CSV encoding, external `.tsx` option, flip
      flags (`flags` array + constants).
- [x] tmx tests: CSV decode, external-tsx merge, flip-flag extraction.
- [x] Scaffold `examples/rpg/` (index.html, package.json, tsconfig,
      vite.config.ts, src/) mirroring tilemap/solitaire.
- [x] Load map (`?url` tmx + `?raw` tsx text) + both sheet images; build
      the map-tile atlas and the character atlas.
- [x] Render all 3 tile layers as sprites, honoring flips via Scale/Rotation.
- [x] Player entity + 4-dir movement + AABB wall collision + map clamp.
- [x] Camera follow via `modules/camera`, ctx translate, bounds clamp.
- [x] Place NPCs with sprites + dialog data.
- [x] Proximity detection + talk key + movement lock.
- [x] DOM nine-slice dialogue box (ui-pack), advance/close flow.
- [x] Register in the hub manifest + controls text; add to `examples/README.md`.
- [x] Validate: `tsc --noEmit && vite build`, eslint clean, full repo
      tests green (tmx), browser E2E (walk, collide, talk 1-box + multi-box).
- [x] POSTMORTEM.md (camera-first + tmx-extension + flip + UI findings).
- [x] Move this plan to `docs/plans/done/` in the commit.

## Out of scope (first cut)

Combat, inventory, quests/state machines, multiple maps / map transitions,
save/load, animated character walk cycles, pathfinding NPCs, sound. This
is a *traversal + talk* base, not a game.
