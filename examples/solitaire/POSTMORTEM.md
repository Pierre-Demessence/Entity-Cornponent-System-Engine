# Solitaire (Klondike) — Postmortem

A draw-1 [Klondike](https://en.wikipedia.org/wiki/Klondike_(solitaire))
solitaire built on `@pierre/ecs` with zero engine edits. The point was
not the card game; it was being the **first interactive canvas scene**
in the examples tree — the first consumer that moves sprites every frame,
re-orders their z-index dynamically (a dragged card and the cards under
it), and hit-tests pointer input back into world space over a real
texture atlas (Kenney's boardgame pack).

Plan doc:
[../../docs/plans/done/solitaire-example.md](../../docs/plans/done/solitaire-example.md).

## What this prototype proved

- **`RenderOrderDef` is enough for dynamic z-order.** Every card is a
  sprite entity tagged with `PositionDef + RenderableDef{kind:'sprite'} +
  RenderOrderDef`. A single monotonic counter assigned in
  stock → waste → foundation → tableau order produces correct stacking,
  and bumping a dragged run's order by a large constant
  (`DRAG_ORDER_BUMP`) lifts it above everything else without touching any
  other entity. Ties break on insertion order, so a fanned tableau column
  stacks correctly with no per-card fractional ordering.
- **Per-frame layout from game state composes cleanly.** `syncLayout`
  rewrites Position/Renderable/RenderOrder for all 52 cards each frame
  straight from the plain `GameState` (stock/waste/foundations/tableau
  arrays). The ECS holds only *render* data; the rules live in ordinary
  arrays and pure functions (`canDropOnTableau`, `canDropOnFoundation`,
  `findFoundationFor`). The engine never needed to know what a "card" is.
- **World-space hit-testing is a consumer concern and stays small.**
  Pointer events scale through the canvas rect into the fixed
  700×720 world, then `pickCard` walks piles top-down to find the
  topmost card under the point. No engine raycast/picking API was
  needed — the example owns its geometry.
- **The atlas path from tilemap generalizes.** Two `TextureAtlasRegistry`
  atlases (card faces + card backs) parsed from Kenney's `.xml`
  TextureAtlas files via `DOMParser`, fed to the same `Canvas2DRenderer`
  used by the static tilemap. The renderer didn't care that sprites now
  move and reorder every frame.
- **Audio module wired as a mechanic, not decoration.** `WebAudioProvider`
  plays a random slide/place clip on each move via the asset-loader's
  `audioBufferAsset` decode path — the same module the rhythm example
  proved, now driven by discrete UI events instead of a clock.

## What was awkward

- **`syncLayout` rewrites all 52 entities every frame even when nothing
  moves.** Fine at 52 entities, but it means the render data is fully
  derived state recomputed per frame rather than mutated on change. A
  larger scene would want dirty-tracking; here the simplicity of "state
  is truth, layout is a pure projection" was worth the waste.
- **Dragged-stack override lives outside `syncLayout`.** Because the drag
  follows the pointer between layout passes, `applyDragOverride` patches
  the dragged cards' Position/RenderOrder *after* `syncLayout` each frame.
  Two writers to the same components in one frame works but is a smell —
  a cleaner design would pass the drag into `syncLayout` as input.
- **Vite asset handling needed `?url`, not `new URL(...)`.** Same lesson
  as tilemap: `new URL('...png', import.meta.url)` did not reliably emit
  the `.png`/`.xml`/`.ogg` assets. Static `import x from '...?url'`
  forces emission and fingerprinting. Ten explicit imports is verbose but
  it is the proven pattern.
- **No undo, scoring, timer, draw-3, or auto-complete.** Deliberately out
  of scope — those are game-feature depth, not new engine surface. The
  example proves the interactive-canvas mechanic and stops.

## Files

- `src/cards.ts` — suit/rank model, atlas frame names.
- `src/atlas.ts` — Kenney TextureAtlas `.xml` → frame map.
- `src/game.ts` — pure game model: deal, layout geometry, move legality.
- `src/render.ts` — `syncLayout` projection + `renderFrame` (slots,
  win banner) over `Canvas2DRenderer`.
- `src/main.ts` — entry: asset load, audio, pointer input, drag, render
  loop.
