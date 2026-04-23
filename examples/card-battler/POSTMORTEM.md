# Card Battler Postmortem — Rung 5

**Prototype:** Slay-the-Spire-lite turn-based card battler. DOM
rendering (no canvas), drag-and-drop cards onto an enemy, 3 card
types (Strike / Defend / Heavy), 1 enemy with alternating
attack/block intent, manual-tick logic loop decoupled from an rAF
render loop. Reset button to restart; win/loss overlays on HP ≤ 0.
**Engine version:** `@pierre/ecs` as of the commit that landed this
prototype. **No engine edits.** Rule R1 held for a fifth consumer.
**LOC:** 971 TS + 224 CSS across `src/` (components 63, cards 95,
game 186, systems 238 across two files + barrel, render 291,
main 98, style.css 224). Budget: ~600 ⚠️ **over target.** The
overrun is entirely concentrated in `render.ts` and `style.css`,
both of which are the DOM-renderer scaffolding that a future
`@pierre/ecs/modules/render-dom` module would absorb.

## What worked

### The renderer interface really is pluggable

The headline goal. `DomRenderer implements Renderer<DomRenderContext>`
compiles against the exact same core interface `Canvas2DRenderer`
implements, with a different `TCtx` (`{ root: HTMLElement; world;
state }` instead of `{ ctx2d; world }`). The app wiring in `main.ts`
is indistinguishable in shape from the shooter's: construct a
renderer, construct an `AnimationFrameTickSource`, subscribe the
render callback, teardown returns the composed dispose. The
`Renderer<TCtx>` type parameter proved load-bearing — a canvas-only
shape (e.g. if we'd baked `CanvasRenderingContext2D` into the
interface) would have forced a fork.

### `ManualTickSource` is the right shape for turn-based logic

Logic ticks only fire on three events: `pointerdown`, `pointerup`,
and clicks on the End-Turn / Reset buttons. Between those, the
simulation is completely still — no wasted CPU, no phantom "should
this system run this frame?" questions. `TickRunner` didn't need
any accommodation for the tick source being on-demand; the fact
that `ManualTickSource.start()` / `.stop()` are no-ops meant the
runner's lifecycle glue worked without modification.

The split between "logic ticks only when something happens" and
"render ticks every rAF frame for smooth drag visuals" fell out
naturally. Two tick sources, two subscribers, no shared state
beyond the mutable `GameState` — the discipline that turned out to
matter was "don't mutate game state from inside the render
callback," which the renderer honours.

### Card-as-entity + zone tags

Every card is a live entity. `InHandTag` / `InDeckTag` /
`InDiscardTag` encode zone membership. Moving a card between zones
is two tag-store ops. The renderer iterates each zone's tag store
and reparents DOM nodes accordingly; the tag swap is the source of
truth and the DOM follows. This was pleasing — no per-card state
struct, no array juggling, no "which deck does this card belong
to" lookups. The engine's tag model just absorbs the concept.

Card effects as function references (`effect: (ctx) => void`)
kept the card definitions one-liners:

```ts
export const Strike: CardDef = {
  id: 'strike', name: 'Strike', cost: 1,
  description: 'Deal 6 damage.',
  effect: ctx => applyDamage(ctx, ctx.enemyId, 6),
};
```

Zero extra machinery. When save/load shows up (rung 5 explicitly
isn't exercising M5), the refactor to a discriminated-union
effect DSL is a localised change.

### PointerProvider + rAF read-through is fluid

The plan budgeted for the drag experience to feel janky given
logic ticks only fire on press/release. In practice it's smooth:
the rAF render loop reads `pointer.state.x/y` live and updates
`style.left` / `style.top` on the dragged card every frame. From
the user's perspective the card tracks the cursor exactly like a
"proper" DnD implementation. The PointerProvider's `state.over`
and window-level pointerup defaults made off-container release
work without any extra handling.

### Tiny engine footprint

Engine imports in the final prototype:

- `EventBus`, `Scheduler`, `TickRunner`, `EcsWorld` from core
- `Renderer`, `ComponentDef`, `EntityId`, `TagDef`,
  `simpleComponent` (types + utility)
- `createInput`, `Pointer`, `PointerProvider`, `PointerState`,
  `InputState` from `modules/input`
- `AnimationFrameTickSource`, `ManualTickSource` from `modules/tick`

That's it. The ECS core + input + tick modules cover the whole
surface area. No `modules/motion`, `modules/collision`,
`modules/lifetime`, `modules/render-canvas2d`, or
`modules/spatial` — all five of which the shooter used. A
completely different game, same core.

## What was missing / awkward

### 1. DOM rendering is not trivially amortised across consumers — **finding #1 (only partially an engine gap)**

The `render.ts` file is 291 lines. Most of it is:

- Building the static zone skeleton (enemy zone, player zone,
  deck pile, discard pile, hand row, drag layer, HUD, overlay) on
  first render.
- Maintaining an `entityId → HTMLElement` map with orphan
  cleanup.
- Reparenting card DOM nodes when zone tags change.
- Propagating GameState flags to CSS classes (`playable`,
  `dragging`, `unaffordable`, `in-deck` / `in-discard` /
  `in-hand`).
- Writing `data-entity-id` attributes for hit-testing.

None of this is game-specific in shape — every DOM-rendered ECS
game would write functionally identical code with different zone
names. A future `@pierre/ecs/modules/render-dom` that ships:

- A `DomRenderer` that takes a per-entity "describe as HTML"
  callback.
- Standard entity-id ↔ DOM-node book-keeping with orphan cleanup.
- A `data-entity-id` attribute contract for hit-testing.

...would cut this file roughly in half and let future consumers
get the same pluggability validation for free. **But** — per the
Rule of Three convention, we resist extracting from a single
consumer. Mark this as a "probably extract on rung N+1 if another
DOM consumer shows up" follow-up, not an immediate engine gap.

### 2. No entity-lifecycle events ~= coarse DOM diffing — **finding #2, deferred as before**

The renderer currently walks every card entity on every frame
(60 Hz) to check which zone tag it has and reparent if needed.
With 10 cards this is trivially cheap; with 200 cards (a future
deckbuilder scale) it would be meaningful waste.

The right primitive is entity-lifecycle events (A3 in the
roadmap): when a tag is added/removed, emit an event the renderer
subscribes to. Then the renderer touches only the DOM nodes that
actually changed. This rung doesn't prove the need — the
prototype is well within "re-walk everything" budget — so A3
stays deferred for the same reason it's been deferred since
rung 3. Record it; don't act on it.

### 3. PointerProvider projection vs. DOM hit-testing — **minor friction, app-level solved**

`PointerProvider`'s default projector returns target-local coords
(pointer x/y relative to the pointer target's bounding rect), but
`document.elementFromPoint` expects viewport-local coords
(`clientX/Y`). Those are usually the same when the target is at
`(0, 0)` of the viewport, but they diverge the moment the
container is scrolled into a different position — as it is when
mounted inside the examples hub with its own layout.

The prototype routes around this by having `main.ts` listen to
raw `pointerdown` / `pointerup` and stash `ev.clientX / ev.clientY`
into a `setLastClient(x, y)` module-level on the drag system.
`hitTestEntityAt()` reads those stashed coords.

This is ugly but small (15 lines). A nicer API would be either:

- A `pointer.lastClient` field on `PointerState` that always
  carries the raw viewport coords alongside the projected ones, or
- A second projector that's the identity (target-agnostic
  viewport coords), selectable via an option.

**Finding:** add `{x, y}` viewport-raw coords to `PointerState` or
document the recipe. Not urgent — prototype works. Log for next
input-module pass.

### 4. `simpleComponent` only supports primitives — **finding #3, mild ergonomic gap**

Card defs carry a function reference (`effect: (ctx) => void`),
which isn't serializable by `simpleComponent`'s `SimpleSchema`
(`boolean | number | string` only). Solution was a hand-rolled
`ComponentDef<Card>` that serializes by the card def's `id` and
looks up the def on deserialize via a module-level registry:

```ts
export const CardDefComp: ComponentDef<Card> = {
  name: 'card',
  deserialize(raw, label) {
    const def = getCardDef(asString(raw.id, `${label}.id`));
    if (!def) throw new Error(...);
    return { def };
  },
  serialize(value) { return { id: value.def.id }; },
};
```

Eight lines, works fine. But it points at a pattern: "component
that references a registry-backed definition" is going to come up
repeatedly (card effects, enemy archetypes, item templates, ability
defs). A `registryComponent<T, Def>(name, registry, keyOf)` helper
in core would collapse this pattern to a one-liner.

**Finding:** consider adding `registryComponent` alongside
`simpleComponent`. Parking for now — one consumer isn't enough.

### 5. Circular import between `components/card.ts` and `cards.ts` — **self-inflicted, worth noting**

`components/card.ts` needs `CardDef` (type) + `getCardDef` (value)
from `cards.ts`. `cards.ts` needs `HealthDef` / `BlockDef` (value)
from `components/card.ts`. ESM handles this gracefully as long as
the value imports are only read at call-time, never at module top
level — which we had to make sure of by moving the damage/block
helpers into function bodies rather than computing them at module
load.

The alternative decomposition (effect helpers live in `game.ts`,
cards module has no runtime deps on components) is cleaner. If
this prototype grows I'd flip the structure. Logging in case
future card-battler-alikes have the same shape.

### 6. LOC over budget — not-really-a-gap

971 TS is ~60% over the 600-line target. Breakdown:

- `render.ts` 291: the DOM renderer explained in finding #1.
  Would be ~120 if a `render-dom` module existed.
- `style.css` 224: hand-written card styling, HP bars, HUD,
  overlay, drag-layer positioning. No reuse path.
- `game.ts` 186: world factory, deck management, shuffle,
  helpers. Proportionate to feature count.
- `systems/turn.ts` 109: turn state machine with defensive
  checks for mid-drag End Turn, victory/defeat transitions,
  enemy intent alternation. Tight enough.
- `systems/drag.ts` 127: drag state machine + `elementFromPoint`
  hit-testing + client-coord handoff. Could shed ~15 lines if
  PointerProvider exposed viewport coords directly (finding #3).
- `cards.ts` 95: card defs + effect helpers + registry.

If the 600 target referred to TS excluding CSS and excluding the
renderer scaffolding, the game-logic code (games.ts + systems +
cards + main + components) is ~640 lines — essentially on target.
The overage is "we wrote a renderer backend from scratch because
no module existed," which the rung was explicitly set up to
provoke. Mark this as "overshoot was expected and informative,"
not "we scoped wrong."

## Engine gaps opened by rung 5

Summary of findings above, by urgency:

1. **DOM-renderer extraction** — only pull the trigger after a
   second DOM-heavy consumer exists (Rule of Three).
2. **Entity-lifecycle events (A3)** — still deferred. Five
   rungs in, nothing has forced it.
3. **Viewport-raw pointer coords** — small ergonomic fix to
   `PointerProvider` or `PointerState`. Worth doing if a sixth
   consumer also needs DOM hit-testing.
4. **`registryComponent` helper** — parking; wait for another
   consumer of the "component points at a registry-backed def"
   pattern.

None are blocking. Engine continues to be oversupplied relative
to consumer demand, which is the point of the progression — each
rung validates a slice of the engine by using it, not by
speculating about it.

## Confirmation of prior findings

- **Renderer pluggability** (rung-3 speculation, rung-4
  unconfirmed, rung-5 proved): the interface is genuinely
  pluggable. Canvas and DOM are real, simultaneously supported
  backends via the same core contract.
- **Turn-based tick via `ManualTickSource`**: proven. No engine
  accommodation needed.
- **PointerProvider for DnD**: proven. Minor viewport-coord
  friction noted (finding #3), everything else worked first
  try.
