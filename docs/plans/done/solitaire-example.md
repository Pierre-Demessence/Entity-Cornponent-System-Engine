# Solitaire (Klondike) example

A draw-1 Klondike Solitaire built on `@pierre/ecs`, rendered with the
Canvas2D renderer + `TextureAtlasRegistry` using the
`examples/assets/kenney_boardgame-pack` `playingCards.png` atlas.

## Why this example exists (shape-validation goal)

card-battler already covers DOM card-drag. tilemap proved the canvas
sprite renderer for a **static** scene. Solitaire is the first example to
stress the canvas renderer + `RenderOrderDef` under **interactive**
conditions:

- per-frame sprite movement (a dragged stack follows the cursor),
- dynamic z-ordering (the dragged stack floats above every pile),
- world-space pointer hit-testing (which pile / which card was clicked),
- the audio module driving one-shot SFX from gameplay events.

If any of those are awkward, that is the finding worth writing down.

## Assets

- `examples/assets/kenney_boardgame-pack/Spritesheets/playingCards.png`
  (1024×2048) + `playingCards.xml` — 53 frames, each card 140×190.
  Parse the XML `<SubTexture name x y width height>` into atlas frames
  keyed by the frame name (e.g. `cardHeartsK.png`).
- A card back from the same pack for face-down cards
  (`playingCardBacks.png` atlas, pick one back frame).
- SFX (`Bonus/cardSlide*.ogg`, `Bonus/cardPlace*.ogg`) via the audio
  module.

## Game model (Klondike, draw-1)

- 52-card deck, 4 suits × 13 ranks. Card = `{ suit, rank, faceUp }`.
- Piles: **stock**, **waste**, 4 **foundations** (one per suit), 7
  **tableau** columns. Deal: column *i* gets *i+1* cards, top card face up.
- Moves:
  - Click stock → flip top card to waste (draw-1). Empty stock + click →
    recycle waste back to stock.
  - Drag a face-up card (and the valid face-up run beneath it) from
    tableau/waste onto:
    - a tableau column: legal if the target is empty and the moved card
      is a King, OR the moved card is one rank below + opposite color of
      the column's top card.
    - a foundation: legal only for a single card that is next-in-suit
      (A first, then 2…K of the same suit).
  - Double-click a face-up card → auto-send to a foundation if legal.
  - Illegal drop → snap the stack back to its origin.
  - After a tableau move, auto-flip the newly-exposed face-down top card.
- Win: all 4 foundations hold 13 cards → show a win banner.

## Tasks

- [x] Scaffold `examples/solitaire/` (index.html, package.json,
      tsconfig.json, vite.config.ts, src/) mirroring tilemap/card-battler.
- [x] `cards.ts`: deck construction, suit/rank/color helpers, frame-name
      mapping (`card{Suit}{Rank}.png`).
- [x] Atlas XML parse → `TextureAtlasRegistry` (cards + one back frame).
- [x] ECS components: `CardDef` (suit/rank/faceUp), `PileRef`
      (which pile + index), reuse `PositionDef`/`RenderableDef`/
      `RenderOrderDef` from the engine.
- [x] Game state: piles as entity-id arrays; deal/shuffle (seeded so a
      win is reachable for the demo? — or honest random + new-deal button).
- [x] Layout system: map pile + stack index → world position (tableau
      fan-down offset, foundation/stock/waste fixed slots).
- [x] Render: `Canvas2DRenderer.render` each frame; dragged stack gets a
      high `RenderOrderDef` so it floats on top.
- [x] Input: pointer hit-testing (point-in-card-rect, topmost wins),
      drag start/move/drop via the tick-source pattern from card-battler.
- [x] Move legality + apply (tableau/foundation rules, auto-flip).
- [x] Stock click → waste; waste recycle; double-click auto-foundation.
- [x] Win detection + banner.
- [x] SFX: slide on pick-up/move, place on foundation drop, via audio
      module.
- [x] Register in the hub manifest + controls text.
- [x] Add to `examples/README.md` count + list.
- [x] Validate: example `tsc --noEmit && vite build`, eslint clean,
      browser E2E (deal, drag a run, foundation send, stock recycle, win).
- [x] POSTMORTEM.md (what the interactive canvas path proved / awkward).
- [x] Move this plan to `docs/plans/done/` in the commit.

## Out of scope (first cut)

Undo/redo, move-count/timer scoring, draw-3 variant, auto-complete
animation, persistence, responsive scaling beyond a fixed board size.
