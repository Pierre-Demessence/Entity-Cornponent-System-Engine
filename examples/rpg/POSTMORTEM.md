# Top-Down RPG Postmortem

**Prototype:** Tiled-authored dungeon you can walk around. Smooth
4-direction movement (WASD/arrows) with wall + prop collision, a
camera that follows the player and clamps at the map edges, six NPCs
— each an existing character *already painted into the map* reused as
an invisible interaction point you can stand next to and talk to — and
a nine-slice dialogue box that advances box-by-box. **Engine version:**
`@pierre/ecs` as of the commit that landed this prototype. **Engine
edits: yes** — this is the first prototype that deliberately drove an
engine module (`modules/tmx`) past a real, externally-authored map.
**LOC:** ~707 across `src/` (`main.ts` 342, `map.ts` 126,
`characters.ts` 119, `dialogue.ts` 83, `flip.ts` 37).

## What worked

### The engine carried the spatial + render plumbing

- **`modules/tmx` parsed a real Tiled export end-to-end.** Once
  extended (see below), `parseTmx(xml, { tilesets })` +
  `gidToFrame(gid, tileset)` turned `sampleMap.tmx` into a frame-per-GID
  atlas with no app-side XML handling. The 3-layer map (Dungeon /
  Objects / Carts) spawns one `RenderableDef` sprite per non-empty
  tile and `RenderOrderDef = layerIndex` keeps the upper layers on
  top — the same "module emits entities, consumer composes" seam every
  other example uses.
- **`makeFollowCameraSystem` was the first real consumer of
  `modules/camera` and needed zero glue.** Calling `followCamera.run({
  world })` once per frame centres the camera on the player tag; the
  app only clamps the resulting offset to `[0, mapW - VIEW_W]` /
  `[0, mapH - VIEW_H]` and applies it with a single
  `ctx2d.translate(-offX, -offY)` before `Canvas2DRenderer.render()`.
  No scheduler was needed — the system's `.run()` composes fine inside
  a hand-written `requestAnimationFrame` loop.
- **`Canvas2DRenderer` drew flipped/rotated tiles in place.** Because
  the renderer applies `translate → rotate → scale` about the entity
  position and `anchor: 'center'` draws the sprite centred, spawning
  each tile at its *centre* (`col*tw + tw/2`) makes Tiled's per-tile
  flip flags resolve to an in-place mirror/rotate with no special
  cases in the renderer.
- **Axis-separated AABB collision against a derived grid is tiny.**
  `buildCollision` walks the layers once and marks a cell walkable only
  when its ground GID is in a small floor whitelist *and* every upper-
  layer tile on it is either empty or in a `WALKABLE_PROPS` allowlist
  (chairs, rail tracks, the bridge). Solid props — walls, furniture,
  and the baked-in NPC characters — therefore keep blocking with no
  special-casing. The mover tests the four corners of a `PLAYER_HALF`
  box per axis. That's the whole physics.

### Dialogue is pure DOM, exactly as the README prescribes

The dialogue box is a single absolutely-positioned `<div>` over the
canvas using `border-image` for the `kenney_ui-pack` nine-slice — the
first example to consume that pack. Proximity detection is a squared-
distance scan over the six NPCs (`TALK_RANGE²`), and the keydown handler
either advances the open box or opens the nearest NPC's. Movement is
gated on `!dialogue.open`, so the world freezes while talking with no
extra state machine.

## What was missing / awkward

### 1. `modules/tmx` only spoke a narrow TMX dialect — **real gap, now resolved**

The very first real Tiled map this engine met used three features the
parser did not support:

- **CSV layer encoding** (the parser only handled base64+zlib).
- **An external `<tileset source="sampleSheet.tsx"/>`** rather than an
  inline tileset.
- **Per-tile flip flags** packed into the high bits of each GID.

All three were added to `modules/tmx` rather than worked around in app
land:

- `parseLayer` now handles `encoding="csv"` alongside `base64`.
- `parseTileset` resolves an external `source` from a caller-supplied
  `ParseTmxOptions.tilesets` map (and throws a clear "not provided"
  error otherwise), so the host decides how to fetch the `.tsx`.
- GIDs are masked with `GID_FLAG_MASK` and the flip bits are surfaced
  as a parallel `TmxLayer.flags: Uint8Array` plus exported
  `TMX_FLIP_H/V/D` constants, leaving GID→frame lookup unchanged.

This is the intended loop: a prototype is the forcing function that
turns a module from "handles the maps we wrote in a test" into
"handles a map a level editor actually exported."

### 2. `.tsx` is a code extension to the bundler

Vite treats `*.tsx` as TypeScript/JSX, so importing the external
tileset with `?url` made the dev server try to *transpile* the Tiled
XML and 500. The fix was a one-liner — import it with `?raw` (inlined
file text) instead — but it is a sharp edge worth flagging for anyone
loading editor sidecar files whose extension collides with a source
language. The runtime `.tmx` and `.png` imports keep using `?url` +
`AssetLoader`, which Vite handles as plain assets.

### 3. NPCs should reuse the art the map already paints

The map's Objects layer already bakes a dozen character sprites into
the dungeon, so spawning *new* NPC sprites on top duplicated artwork
and forced hand-picked tile coordinates that kept landing on wall or
prop cells. The cleaner shape was to stop spawning NPC sprites
entirely: `NPC_DIALOGUES` keys each conversation by the **GID of a
character already in the map**, and `findNpcPlacements` scans every
layer to drop an invisible interaction point on each matching tile.
NPC positions then track the baked art for free, the characters block
movement because they are ordinary non-walkable props, and "can the
player reach this NPC" is answered by the same collision grid that
blocks them. The lesson generalises: when the level editor already
placed something, attach behaviour to *that* entity rather than
minting a parallel one.

## Validation

Static: `eslint --fix`, `tsc --noEmit`, full `vitest` suite (605
tests), and production builds of both the example and the hub all
pass. Browser E2E (embedded Chromium against the dev server) exercised:
map renders with all three layers and correct tile flips; player moves
on all four axes and is blocked by walls and solid props; floor decor
(rail tracks, chairs, the bridge) is walkable while the baked NPC
characters all read solid on the collision grid; the camera follows and
clamps at the edges; the proximity prompt appears beside each NPC; the
single-box NPCs (Gareth, Sera, Tobin) close on one press while the
multi-box NPCs (Mara ×3, Old Pip ×2, Brother Edwin ×2) advance
correctly; and movement is frozen while a box is open.
