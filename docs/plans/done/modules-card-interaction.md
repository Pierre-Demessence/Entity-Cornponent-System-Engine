# Plan — card interaction: `modules/pile` + `modules/drag-drop`

Backlog entry: `modules/card-interaction` — "zone/pile management … and
drag-and-drop hit-testing", **ready**, gate "Scheduling — build slot", on the
strength of two consumers (card-battler, solitaire).

Reading both consumers end to end moves the entry's boundaries. It holds two
different capabilities that do not share a module, and only one of them is about
cards:

- **Piles** — ordered stacks of entities with move operations. Card games are
  the consumers, but nothing in the shape says "card": a tile bag, a draw pool
  or a queue of turn tokens is the same data. It ships as **`modules/pile`**.
- **Drag-and-drop** — grab a payload, follow the pointer, ask each target
  whether it accepts, drop or snap back. This is generic UI interaction
  (inventories, editors, board games), not card-specific. It ships as
  **`modules/drag-drop`**.
- **Hit-testing** is not one primitive. The two consumers resolve "what is
  under the pointer" with two different backends (DOM vs canvas geometry), and
  each backend already has a module. The pickers land there, as small
  canon-complete additions: `entityAtPoint` in `modules/render-dom` and
  `aabbContainsPoint` / `circleContainsPoint` in `modules/collision`.

No module is named `card-interaction`; the backlog entry is replaced by what
ships.

## Dual-sided verification

**Engine — ABSENT.**

- No ordered-collection-of-entities primitive in `src/` or `src/modules/`.
  `TagStore` is an unordered membership set. Entity hierarchy is **declined**
  (`non-goals.md`, "Entity hierarchy / parenting"), and `modules/attach` is
  follow-only — neither is a pile.
- No drag-and-drop helper. `modules/input` supplies `PointerState` /
  `projectPointer` (the raw pointer), and nothing turns that into a drag
  session.
- No DOM picker. `modules/render-dom` writes `data-entity-id` on every node it
  reconciles, but nothing reads it back.
- No 2D point-containment test. `modules/collision-3d` ships
  `aabb3ContainsPoint` / `sphere3ContainsPoint`; the 2D `modules/collision`
  has overlap and ray tests but no `aabbContainsPoint` / `circleContainsPoint`.
- PRESENT and reused: `shuffle(arr, rand?)` in `modules/rng`
  (`src/modules/rng/rng.ts:46`), and `EntityDestroyed` on `world.lifecycle`
  (`src/lifecycle.ts:18`).

**Consumers — piles.**

- **card-battler models piles as tags**, and pays for the missing order:
  - `InHandTag` / `InDeckTag` / `InDiscardTag`
    (`examples/card-battler/src/components/tags.ts:3-5`).
  - `drawCards` draws a **random** deck card with `pick([...inDeck])`
    (`game.ts:146`). `resetGame` shuffles the deck before spawning it
    (`game.ts:123-125`), so that order is thrown away; a random pick stands in
    for "take the top card".
  - Four hand-rolled moves, each a tag delete + add: draw deck → hand
    (`game.ts:134-152`), reshuffle discard → deck (`:154-163`), discard the
    whole hand (`:166-174`), discard one card from the middle of the hand
    (`:177-180`).
  - Reverse lookup ("which pile is this card in?") is three tag probes
    (`render.ts:204-217`); per-pile iteration and counts go through the tags
    again (`render.ts:236-246`, `:258-259`, `:295-310`, `turn.ts:116`).
- **solitaire models piles as plain arrays outside the world**:
  - `GameState` holds `stock`, `waste`, `foundations[4]` and `tableau[7]` as
    `Card[]`, each `Card` carrying its sprite's `EntityId`
    (`examples/solitaire/src/game.ts:18-38`), resolved by `pileArray`
    (`:92-103`).
  - Moves: take the run from index `i` (`main.ts:172`, `pile.slice`),
    move that run (`main.ts:251-253`, `splice` + `push`), move the top card
    (`main.ts:215-216`, `pop` + `push`), deal stock → waste and recycle
    waste → stock **reversed** (`main.ts:259-273`).
  - Layout iterates every pile in order with the index
    (`render.ts:78-83`).
- **What both need** is an *ordered* pile. Solitaire's rules are about order
  (top card, runs, fan positions); card-battler has no order to use and falls
  back to a random pick. Tags cannot express it, and solitaire's arrays live
  outside the world, so neither reset nor save sees them.

**Consumers — drag-and-drop.**

- **The session is the same state in both.** A payload, a grab offset, the
  live pointer:
  - card-battler `DragState { cardId, offsetX, offsetY }`
    (`examples/card-battler/src/game.ts:41-45`), opened in `tryStartDrag`
    (`systems/drag.ts:46-65`). Offsets are left at 0 with a note that "a
    production feel would record the click-within-card offset"
    (`drag.ts:59-61`).
  - solitaire `Drag { cards, from, grabX, grabY, pointerX, pointerY }`
    (`examples/solitaire/src/main.ts:71-78`), opened in `onPointerDown`
    (`:151-183`) with the real grab offset (`:177-178`).
- **Drop is "find the target under the probe point that accepts the payload,
  else snap back".**
  - card-battler: over the enemy **and** affordable → play it, else the card
    stays in hand (`drag.ts:67-90`). Probe = the pointer.
  - solitaire: `dropTarget` walks foundations then tableau columns, and each
    needs *under the probe* **and** `canDropOn…` (`main.ts:374-402`); `null`
    means snap back (`:246-249`). Probe = the dragged card's centre
    (`:241-244`), not the pointer.
- **Lift-while-dragging** is in both, with backend-specific means: a
  `cb-drag-layer` reparent (`card-battler/src/render.ts:209-220`) and a
  `DRAG_ORDER_BUMP` render order (`solitaire/src/render.ts:85-93`). Where the
  dragged thing is drawn is `pointer − grab` in both.
- **Input plumbing differs and stays consumer-side.** card-battler drives the
  session from `justPressed` / `justReleased` inside a system ticked by DOM
  events (`card-battler/src/main.ts:86-95`); solitaire uses raw
  `pointerdown` / `pointermove` / `pointerup` with pointer capture
  (`solitaire/src/main.ts:222-226`). The module must take plain points and
  never bind a listener.

**Consumers — hit-testing.**

- card-battler: `elementFromPoint` → `closest('[data-entity-id]')` → parse
  (`systems/drag.ts:102-114`), which relies on the `data-entity-id` that
  `DomRenderer` writes.
- solitaire: `inSlot` point-in-rect (`main.ts:344-347`), `pickCard` walking
  piles top-down (`:350-371`). Its rects come from the layout, not from
  entity components.

**Canon.**

- **Drag-and-drop — unanimous, the same four-step shape everywhere.** Godot
  `Control._get_drag_data` / `_can_drop_data` / `_drop_data`; Unity
  `IBeginDragHandler` / `IDragHandler` / `IEndDragHandler` / `IDropHandler`;
  the HTML Drag and Drop API `dragstart` / `dragover` (accept by
  `preventDefault`) / `drop`; Phaser `dragstart` / `drag` / `drop` with drop
  zones. Payload, per-target accept, drop, cancel-and-return.
- **Point containment — unanimous.** Godot `Rect2.has_point`, Unity
  `Rect.Contains` / `Bounds.Contains`, Phaser `Rectangle.Contains`; and this
  engine's own `aabb3ContainsPoint`.
- **DOM picking** is the platform's `document.elementFromPoint`; the helper is
  its `data-entity-id` inverse, which only `render-dom` can own.
- **Piles — no engine canon.** General-purpose engines do not ship a deck or
  pile. The shape rests on the **two consumers**, which the rule-book accepts
  for a novel shape. Card-game frameworks corroborate the operation set
  (Tabletop Simulator's deck draw / shuffle / deal / put; boardgame.io keeps
  decks as ordered arrays in game state) — cited as context, not proof, and
  kept out of the README.

## Decision record

**Decision.** Ship two modules and two small additions to existing modules,
then migrate both card examples onto them in this change.

1. `modules/pile` — ordered piles stored **in the world**: each pile is an
   entity carrying `PileDef { items: EntityId[] }`, and each member carries
   `InPileDef { pile: EntityId }` as a back-reference. The module's operations
   keep the two in step.
2. `modules/drag-drop` — a backend-agnostic `DragDrop<TPayload, TTarget>`
   session: plain points in, a drop result out, no listeners, no rendering.
3. `modules/render-dom` — `entityAtPoint(x, y, root?)`.
4. `modules/collision` — `aabbContainsPoint`, `circleContainsPoint`.

**Pile representation — options considered.**

1. *Tags, one per pile (card-battler today).* Rejected. Unordered, so "top of
   the deck" and runs are not expressible; a tag per tableau column would also
   make pile count a registration-time constant.
2. *A component on each member, `{ pile, order }`, with the pile's order read
   by sorting.* Rejected. Every read of a pile in order (solitaire lays out
   every pile every frame) becomes a query plus a sort, and every insert
   renumbers.
3. *A module-owned `Map<pileKey, EntityId[]>` outside the world (solitaire
   today).* Rejected. The world does not see it: `world.clearAll()` (the
   card-battler reset, `game.ts:110`) leaves it stale, `toJSON` / `loadJSON`
   miss it, and destroying an entity leaves a dangling id — the same
   world-reset hazard `render-scene3d` had to document.
4. **Chosen:** *a pile entity with an ordered `PileDef`, plus an `InPileDef`
   back-reference on each member.* Ordered reads are one array; "which pile is
   this in?" is one component read (card-battler's three tag probes collapse);
   reset, save and load go through the world. Piles are created at runtime, so
   solitaire's 13 piles are 13 entities with no registration-time count.

**Invariant the module owns.** An entity is in at most one pile. Every
operation that inserts a member first removes it from its current pile, so
`PileDef.items` and `InPileDef` never disagree. Writing `PileDef.items`
directly is allowed for reads only; the README says so.

**Destroy semantics.** Destroying a member must drop it from its pile, and
destroying a pile must release its members (remove their `InPileDef`), so
games never hand-clean. The test suite pins both directions.

*Built differently from the first draft.* The draft routed this through
`world.lifecycle` `EntityDestroyed`, but that bus is buffered until
`lifecycle.flush()` and neither card example flushes it, so a destroyed card
would linger in its pile until someone did. `installPiles` instead subscribes
to the two component stores' `delete` events, which fire synchronously inside
`destroyEntity`. Removing a member is then *one* code path — the `InPileDef`
delete handler splices it out — whether it is destroyed, removed with
`removeFromPile`, or moved (replacing its `InPileDef` fires the same handler).

Store `delete` events also fire during `clearAll()` and `loadJSON()`, which
wipe stores in registration order. `installPiles` registers `PileDef` before
`InPileDef`, so wiping the piles first releases every member from the *old*
piles before the member store is touched, and neither handler ever reaches a
freshly loaded row. A test loads a save over a world that reuses the same ids
to pin this.

**Save/load.** `PileDef` holds an `EntityId[]`, which `simpleComponent`
cannot express (scalar fields only, `src/component-store.ts:382`), so it is a
hand-written `ComponentDef` with `serialize` / `deserialize`. `loadJSON`
restores the same ids, so no remap is needed today; cross-world id remapping is
the separately deferred `ecs-entity-id-remapping.md`, and `PileDef` is one of
the components it will have to rewrite — named there, not solved here.

**Drag-drop boundaries.**

- **Points in, result out.** The session takes the pointer as `{ x, y }` in
  whatever space the consumer hit-tests in (client pixels for card-battler,
  canvas pixels via `projectPointer` for solitaire). It never reads
  `PointerState`, binds a listener or calls `setPointerCapture`, so both
  consumers' input plumbing stays as it is and the module has no `input`
  dependency.
- **The probe point is configurable.** card-battler drops where the pointer is;
  solitaire drops where the dragged card's centre is. The option is
  `probe: 'pointer' | 'origin' | ((session) => Vec2)`, defaulting to the
  pointer. `'origin'` is the dragged item's top-left; solitaire passes a
  function returning the centre.
- **Targets and acceptance are callbacks.** `targets()` lists candidate drop
  targets in priority order (solitaire: foundations before tableau);
  `contains(target, point)` and `accepts(target, payload)` decide. The first
  target that contains the probe **and** accepts wins; none → the result's
  target is `null` and the consumer snaps back. Card rules (`canDropOnTableau`,
  energy cost) stay in the consumer's `accepts`.
- **No lift, no render.** The session exposes `position` (`pointer − grab`,
  where to draw the dragged item) and `hovered` (the accepting target under
  the probe, for highlight). Lifting — a drag layer, a render-order bump — is
  the renderer's job, which each consumer already does.
- **No snap-back animation.** Snap-back today is instant in both consumers;
  a consumer that wants a return tween drives `modules/tween` from the drop
  result.
- **Drag threshold.** A press only becomes a drag after the pointer moves
  `threshold` pixels (default 0 — both consumers drag immediately). It is in
  every canon listed (Unity `pixelDragThreshold`, Godot's drag deadzone), and
  solitaire needs it to keep double-click-to-foundation from starting a drag.
- **One session at a time.** Multi-pointer drag waits on the deferred
  `modules/input` multi-touch entry.

**Out of scope, by design.**

- Face-up / face-down, suits, costs, any card data — consumer components.
- Pile layout (fanning, spread offsets) — solitaire's `cardPosition` is a game
  rule, not a pile property.
- Card-specific move rules — `accepts` callbacks.
- Native HTML5 `draggable` / `DataTransfer` — DOM-only and awkward over canvas;
  the session works for both backends.
- Renaming the backlog entry's "zones" vocabulary into the API: `pile` is the
  one term.

## API

```ts
// modules/pile
interface Pile { items: EntityId[] }          // ordered, index 0 = bottom
interface InPile { pile: EntityId }
const PileDef: ComponentDef<Pile>;
const InPileDef: ComponentDef<InPile>;

/** Register PileDef + InPileDef and install the destroy cleanup. */
function installPiles(world: EcsWorld): void;

function createPile(world: EcsWorld, items?: readonly EntityId[]): EntityId;
function pileItems(world: EcsWorld, pile: EntityId): readonly EntityId[];
function pileSize(world: EcsWorld, pile: EntityId): number;
function pileTop(world: EcsWorld, pile: EntityId): EntityId | undefined;
function pileOf(world: EcsWorld, item: EntityId): EntityId | undefined;
function indexInPile(world: EcsWorld, item: EntityId): number;   // -1 if none

/** Insert at `index` (default: top). Removes `item` from its current pile first. */
function addToPile(world: EcsWorld, pile: EntityId, item: EntityId, index?: number): void;
function removeFromPile(world: EcsWorld, item: EntityId): void;
/** Move the top `count` items, keeping their order (a solitaire run). */
function moveTop(world: EcsWorld, from: EntityId, to: EntityId, count?: number): EntityId[];
/** Move every item; `reverse` flips the order (waste → stock recycle). */
function moveAll(world: EcsWorld, from: EntityId, to: EntityId, options?: { reverse?: boolean }): void;
function shufflePile(world: EcsWorld, pile: EntityId, rand?: RandomFn): void;
```

A draw is `moveTop(world, deck, hand, n)`; card-battler's reshuffle is
`moveAll(discard, deck)` + `shufflePile(deck)`; discarding one card from the
middle of a hand is `addToPile(world, discard, card)`. Functions over the world
rather than a class, as `modules/particles` `burst(world, …)` and
`modules/camera-3d` `getCameraPose(world, …)` do: piles are world state, and a
class instance would be a second place to hold it.
Final names are settled in the build and recorded in the README; the operation
set is what this plan pins.

```ts
// modules/drag-drop
interface DragSession<TPayload> {
  readonly payload: TPayload;
  readonly grab: Vec2;       // pointer − origin at press
  readonly pointer: Vec2;    // latest pointer
  readonly position: Vec2;   // pointer − grab: where to draw the dragged item
  readonly started: boolean; // false until the threshold is crossed
}

interface DragDropOptions<TPayload, TTarget> {
  targets: () => Iterable<TTarget>;                   // priority order
  contains: (target: TTarget, point: Vec2) => boolean;
  accepts: (target: TTarget, payload: TPayload) => boolean;
  probe?: 'pointer' | 'origin' | ((session: DragSession<TPayload>) => Vec2);
  threshold?: number;
}

interface DropResult<TPayload, TTarget> {
  payload: TPayload;
  target: TTarget | null;    // null → snap back
}

class DragDrop<TPayload, TTarget> {
  constructor(options: DragDropOptions<TPayload, TTarget>);
  readonly session: DragSession<TPayload> | null;
  /** The first accepting target under the probe, or null. */
  readonly hovered: TTarget | null;
  begin(payload: TPayload, pointer: Vec2, origin: Vec2): void;
  move(pointer: Vec2): void;
  /** Resolve the drop and close the session. Null if no drag was started. */
  end(pointer?: Vec2): DropResult<TPayload, TTarget> | null;
  cancel(): void;
}
```

```ts
// modules/render-dom
/** The entity whose rendered node (or a descendant) is at client (x, y), or null. */
function entityAtPoint(x: number, y: number, root?: ParentNode): EntityId | null;

// modules/collision
function aabbContainsPoint(box: Aabb, p: Vec2): boolean;
function circleContainsPoint(center: Vec2, radius: number, p: Vec2): boolean;
```

## Tasks

- [x] `modules/collision` — `aabbContainsPoint`, `circleContainsPoint`
      (boundary-inclusive, matching `aabb3ContainsPoint`), tests, README.
- [x] `modules/render-dom` — `entityAtPoint`, tests (jsdom: nested child hit,
      miss, a node outside `root`), README section.
- [x] `src/modules/pile/` — `pile.ts` (components, `installPiles`,
      operations), `index.ts` barrel.
- [x] `src/modules/pile/pile.test.ts`, proving:
  - [x] every operation keeps `PileDef.items` and `InPileDef` in step,
        including a move between piles and a re-add to the same pile.
  - [x] `moveTop` keeps run order; `moveAll({ reverse: true })` reverses it.
  - [x] `shufflePile` with a seeded `RandomFn` is deterministic and keeps the
        member set.
  - [x] destroying a member removes it from its pile; destroying a pile
        releases its members.
  - [x] `toJSON` → `loadJSON` round-trips piles and back-references.
  - [x] `world.clearAll()` leaves no stale pile state.
- [x] `src/modules/pile/README.md` — API, the one-pile invariant, destroy
      semantics, save/load, not-included list. Document the `rng` dependency
      (`shufflePile` uses `shuffle`), as the architectural rules require.
- [x] `src/modules/drag-drop/` — `drag-drop.ts`, `index.ts`.
- [x] `src/modules/drag-drop/drag-drop.test.ts`, proving:
  - [x] target priority: the first containing **and** accepting target wins;
        a containing but rejecting target is skipped.
  - [x] each `probe` mode (pointer, origin, function).
  - [x] `threshold`: below it, `end` returns null and `session.started` is
        false.
  - [x] `hovered` tracks `move`; `cancel` clears the session.
  - [x] `position` is `pointer − grab`.
- [x] `src/modules/drag-drop/README.md` — API, the points-in boundary (no
      listeners, no rendering), how each consumer's input feeds it,
      not-included list. No cross-module source dependency beyond
      `modules/math` for `Vec2`, if it uses it; document whichever it is.
- [x] Migrate **card-battler**:
  - [x] Deck, hand and discard become pile entities; `InHandTag` /
        `InDeckTag` / `InDiscardTag` are deleted.
  - [x] `drawCards` becomes `moveTop` from a deck shuffled at reset — the
        `pick([...inDeck])` random draw goes away.
  - [x] Reshuffle, discard-hand and discard-card use the pile operations.
  - [x] The renderer's zone lookup and counts read `pileOf` / `pileSize`.
  - [x] `systems/drag.ts` drives `DragDrop` from `justPressed` /
        `justReleased`; `hitTestEntityAt` becomes `entityAtPoint`; the
        enemy is the one target, accepting affordable cards. Record the real
        grab offset (the `drag.ts:59-61` note).
- [x] Migrate **solitaire**:
  - [x] Stock, waste, 4 foundations and 7 tableau columns become pile
        entities; `GameState` holds their ids. Card data (suit, rank, face)
        stays in the example, keyed by entity.
  - [x] Deal, stock ↔ waste, run moves and the double-click send use the pile
        operations; `pileArray` is deleted.
  - [x] `DragDrop` replaces `Drag`: targets are foundations then tableau,
        `probe` returns the card centre, `accepts` wraps `canDropOn…`,
        `contains` uses `aabbContainsPoint` over each pile's drop rect.
  - [x] `inSlot` is replaced by `aabbContainsPoint`.
- [x] `scripts/manual.ts` — add `pile` and `drag-drop` to a category, each
      exactly once (`scripts/manual.test.ts` enforces this). `drag-drop` fits
      "Input and timing"; `pile` fits "World, saves and services".
- [x] `npm run docs:api` and `npm run docs:usage` — regenerate both catalogs.
- [x] `docs/roadmap/ecs-module-backlog.md` — delete the
      `modules/card-interaction` entry and its status-table row.
- [x] `docs/plans/ecs-entity-id-remapping.md` — name `PileDef` / `InPileDef`
      among the components a remap must rewrite.
- [x] `examples/manifest.ts` — add the new modules (and `collision` for
      solitaire) to both examples' `modules` lists. (Planned against
      `website/manual/getting-started/examples.md`, which `main` retired for
      this generated catalogue while this change was in flight.)
- [x] Gate green: lint, typecheck, `npm test`, every example typechecks; both
      card examples played through in a browser with no console errors — draw,
      play, reshuffle and reset in card-battler; deal, run move, foundation
      drop, double-click, stock recycle and an illegal-drop snap-back in
      solitaire.
- [x] Move this plan to `docs/plans/done/` in the same commit.

Also done in this change: `examples/stealth-guard` faked "is this point in a
wall?" with a zero-size `aabbVsAabb`, which the collision README flagged as
missing the boundary; it now calls `aabbContainsPoint`, and the README and
`rayVsAabb` JSDoc point there instead of at the workaround.

## Implementation notes

Where the build refined the sketch above:

- `entityAtPoint(x, y, root?: Element)` — `root` is an `Element` (it needs
  `contains` and `ownerDocument`), not any `ParentNode`.
- `DragSession` also exposes `press` (the pointer at the press), which the
  threshold is measured from. `moveAll` returns the moved entities like
  `moveTop`, so solitaire can turn the recycled waste face down in one loop.
- **card-battler** runs its drag in client pixels — the space
  `entityAtPoint` hit-tests in — and its renderer shifts the dragged card by
  the root's rect into root-local space. Pointer moves go straight to
  `state.drag.move` from a `pointermove` listener; the logic tick still only
  runs on press and release. With a real grab offset, the dragged card's CSS
  `translate(-50%, -50%)` centring is gone.
- **solitaire** uses `threshold: 4`, so clicking or double-clicking a card no
  longer opens a zero-length drag that snapped back with a slide sound.
  `pointercancel` now cancels the drag instead of resolving a drop.
- Verified in Chromium: card-battler — play onto the enemy, drop on empty
  space, three end turns through a discard reshuffle, reset, grab offset held
  exactly; solitaire (seeded deal) — illegal drop snaps back, two run moves
  with face-down cards flipping, double-click to a foundation, drag onto a
  foundation, waste to tableau, stock emptied and recycled. No console errors
  beyond the dev server's missing `favicon.ico`.

No `package.json` change is needed: `"./modules/*"` already publishes new
subpaths.

## What this deliberately leaves open

- **A drag *component* form** (`DraggableDef` + a system). No consumer wants
  it; both hold one session in app state.
- **Multi-pointer drag.** Waits on `modules/input` multi-touch.
- **Pile views / sorted hands.** A hand sorted by cost for display is a
  consumer read of `pileItems`, not a pile mode.
- **Face-down / hidden-information piles.** Visibility is card data; a
  networked card game would need it, and none exists.
