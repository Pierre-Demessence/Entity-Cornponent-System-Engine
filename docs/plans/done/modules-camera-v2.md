# Plan: `modules/camera` V2 — renderer camera-consume + view-rect cull (migration #10)

**Status:** validated; awaiting commit

## Scope (resolved with user)

Canon-complete **Godot `Camera2D` parity (minus rotation)**, per the canon-first
philosophy — build the full canonical camera surface proactively, consumers
validate as they land. Migrate both consumers.

Features: **zoom**, **limits / bounds clamp**, **smoothing (lerp follow)**,
**deadzone / drag-margin**, **offset**, **zoom-aware transforms + view-rect**,
and **renderer camera-consume + off-screen cull**. **Rotation deferred**
(costly rotated-cull, unused in 2D top-down/platformers). The renderer stays
**decoupled** — it consumes a plain `view` transform and never imports `camera`.

## Design

### `camera` — expanded `CameraDef` (Godot `Camera2D` parity)
- `Camera` gains (all flat numeric fields → `simpleComponent`-compatible):
  - `zoom` (default 1) — Godot `Camera2D.zoom`. `screen = (world − topLeft)·zoom`.
  - `offsetX`, `offsetY` (default 0) — Godot `Camera2D.offset` (shift from anchor).
  - `limitLeft` / `limitTop` / `limitRight` / `limitBottom` — Godot
    `Camera2D.limit_*`; bound the camera so it never shows past a world rect.
    "No limit" = a serialization-safe large sentinel (resolve exact value in impl;
    `Infinity` JSON-serializes to `null`, so use a big finite default).
- Zoom/offset-aware `worldToView` / `viewToWorld` — the latter is the canonical
  zoom-aware **mouse-unproject** (replaces tilemap's hand-rolled `(px−tx)/zoom`).
- `cameraViewRect(cam): { x, y, w, h }` — world rect the camera sees
  (`w = viewportW/zoom`), the V2 "exposed view rect" for cull.
- `cameraToView(cam): { x, y, zoom }` — the renderer input (viewport top-left in
  world + zoom); the cam→view bridge that keeps the renderer decoupled.

### `camera` — follow-system options (canon)
- `makeFollowCameraSystem` gains optional:
  - `smoothing` — ease the camera toward the target instead of snapping
    (Godot `position_smoothing`; frame-rate-independent via `math` lerp/damp —
    needs `dtMs` on the follow ctx).
  - `deadzone` — move the camera only when the target leaves a centered box
    (Godot `drag_*_margin` / Cinemachine deadzone).
  - applies the `limit*` clamp after following.

### `render-canvas2d` — camera-consume + cull (decoupled)
- `Canvas2DRenderContext` gains `view?: { x: number; y: number; zoom?: number }`
  (`(x,y)` = world top-left, `zoom` default 1). When present, inside the
  existing `save()/restore()`: `ctx2d.scale(zoom,zoom); translate(-x,-y)`.
- **Cull**: world view-rect `[x, x + canvasW/zoom] × [y, y + canvasH/zoom]`; skip
  entities whose world AABB (from the `Renderable` extent) misses it; text /
  unknown kinds are never culled; cull runs before the `RenderOrderDef` sort.
- **No `view` ⇒ no transform, no cull** (full back-compat). **No
  `render-canvas2d` → `camera` dependency** — it consumes a plain `view`.

### Consumers
- **rpg**: drop the manual `ctx2d.translate`; configure follow `smoothing` +
  `limit*` (replacing its hand-rolled bounds clamp); pass `cameraToView(cam)` as
  `view`.
- **tilemap**: **adopt `CameraDef`** (drop bespoke `tx/ty/zoom`); wheel sets
  `cam.zoom`, drag sets `cam.x/y`; render by **baking the static 10k-tile map
  to one offscreen bitmap** drawn through `cameraToView(cam)` (the canonical
  static-tilemap technique — a lone bitmap stays seam-free at fractional zoom,
  where per-tile drawing leaves sub-pixel gaps); mouse-unproject via the now
  zoom-aware `viewToWorld`. (rpg remains the live per-entity cull consumer.)
- snake ↔ `render-canvas2d` is unblocked by camera zoom (future consumer).

## Checklist

- [x] `camera`: expand `CameraDef` (zoom, offset, limits) + zoom/offset-aware
      `worldToView`/`viewToWorld` + `cameraViewRect` + `cameraToView` + tests
- [x] `camera`: follow `smoothing` + `deadzone` + limit-clamp options + tests
- [x] `render-canvas2d`: `view` transform + view-rect cull + tests
- [x] Migrate rpg (follow smoothing + limits; `view`)
- [x] Migrate tilemap (adopt `CameraDef`; bake static map to bitmap; zoom-aware pick)
- [x] camera README + render-canvas2d README + roadmap row #10 / backlog camera V2 / ledger B1
- [x] Lint + full test green
- [x] Browser-smoke rpg (smooth follow + limits) + tilemap (zoom / pan, seam-free)
- [x] Peer review (subagent, no-edit/no-askQuestions) → LGTM
- [ ] Move plan to `docs/plans/done/` in same commit

## Peer review → LGTM

Reviewer verified: zoom+offset transform inverse exact; `clampCameraToLimits`
offset-correct; cull AABBs match draw extents on all 4 anchor branches;
rpg limit-clamp **algebraically identical** to the old manual offset clamp;
tilemap zoom-pin/drag signs correct; renderer↔camera **decoupled** (no import).
No blocking issues. Fixed nits: N1 — renamed the `'camera'` follow tag to
`'cameraEntity'` in rpg + the camera test (a tag sharing `CameraDef`'s
component name collides on save/load, per the README caveat); N2 — documented
the `viewportW/H == canvas backing size` invariant in the camera README; N3 —
added offset+zoom clamp/round-trip tests + circle/center-rect cull tests.
Browser-smoked rpg (smooth follow, limit clamp at map edge) + tilemap
(zoom-toward-cursor 1.30→2.79×, drag-pan, zoom clamp at exactly 0.50×), 0 errors.

## Post-review fix: tilemap fractional-zoom seams

Browser review surfaced a regression: per-tile drawing through the camera
transform left sub-pixel **seams** between tiles at fractional zoom (e.g. 1.3×,
where a 16px tile spans 20.8px and adjacent edges round to different device
pixels). This is inherent to per-tile rasterization of a gapless grid — every
engine hits it (Unity Pixel-Perfect forces integer zoom; Godot/Phaser/Pixi use
atlas tile-extrusion + roundPixels; Unity Tilemap combines tiles into a chunk
mesh). Since smooth fractional zoom is wanted, the complete fix is the
**bake-to-bitmap** technique (Unity's chunk-mesh in spirit): render the static
10k-tile map once into an offscreen canvas, then draw that single seam-free
bitmap through `cameraToView` each frame. Verified seam-free at 1.30× and 1.43×.
rpg remains the live per-entity **cull** consumer; tilemap now exercises
`CameraDef` pan/zoom + zoom-aware `viewToWorld` picking. Engine code unchanged
(712 tests still green); docs corrected to describe tilemap as bake-not-cull.
