# Platformer Postmortem — Rung 3

**Prototype:** Side-scrolling platformer sandbox (gravity, AABB physics, static
vs dynamic bodies, jump, coin pickup, fall-out respawn).
**Engine version:** `@pierre/ecs` as of commit `87fd00c` (post-Asteroids).
**LOC:** ~485 across `src/` (components 6×~7, game 175, render 50, main 120,
systems 3×~35 + barrel). Budget: 600–800 ✅ (came in under).
**Engine edits required:** **zero.** Rule R1 held across a third consumer.

## What worked (engine carried physics)

- **Scheduler + `runAfter` ordered three systems first try.**
  `input → physics → pickup` composed declaratively. The physics system
  reads the velocity the input system wrote that same tick, then the
  pickup system reads the position the physics system wrote — all in
  one deterministic pass.
- **AABB collision resolution is ~60 LOC of app code.** Gravity + X-axis
  resolve + Y-axis resolve + grounded-flag write. No engine support
  needed. Confirms the roadmap M7 stance that physics is an *optional,
  pluggable* layer — not a first-class engine concern.
- **Static vs dynamic via tags alone was enough.** `StaticBodyTag` and
  `DynamicBodyTag` are just named entity sets. The engine knows nothing
  about "physics bodies," "gravity," or "collision layers." Physics
  iterates `StaticBodyTag` for broadphase; the rest is component data.
  **Engine should not get first-class static bodies.**
- **`HashGrid2D` with AABB cell-expansion handled broadphase.** Each
  static is indexed into *every cell its AABB overlaps* via a
  `cellsForAabb(x, y, w, h)` generator; the player queries the same
  set of cells for its own AABB. ~10 lines of helper code.
- **`CoinTag` iterated directly for pickup.** Only ~5 coins, so pickup
  skips the spatial index entirely and does a linear AABB test. That
  this is *cheap to write* because `getTag()` returns an iterable is a
  win — no "query layer" needed for small sets.
- **Edge-triggered jump via `InputState.jumpPressed` flag** cleared by
  the input system each tick. Two lines of state, no engine input
  abstraction required. Same simplicity as Asteroids' "shoot on press."
- **`GroundedDef { onGround }` as a component** lets the input system
  gate the jump without reaching into the physics system. The physics
  system writes it on Y-axis landing; the input system reads it on
  jump. Clean one-way data flow, ECS-native.

## What reinforced prior findings

### 1. Continuous-to-cell projection boilerplate — **third consumer confirms**

This was the rung-2 finding. Platformer reproduces the exact same
boilerplate Asteroids wrote:

1. `cellOf(x, y)` manual projection.
2. `cellsForAabb(x, y, w, h)` generator iterating `cellOf` across a
   rectangle — new *variant* of the same pattern (AABB vs point).
3. `indexStatic` / `unindexStatic` helpers calling `grid.add` /
   `grid.remove` per cell.
4. Broadphase `queryStatics` building a `Set` from `grid.getAt`.

**Asteroids needed point projection; Platformer needed AABB-expansion
projection.** That's two distinct continuous-space consumers with two
(related) projection shapes. The simple `{ cellSize, project }` proposal
from the Asteroids postmortem would cover the point case but *not* the
AABB case — a complete solution needs a slightly richer API:

```ts
world.enableSpatial(PositionDef, {
  cellSize?: number;
  project?: (pos: TPos) => { x: number; y: number };
  // AND
  projectRange?: (pos: TPos, extent?: ExtentComponent) =>
    Iterable<{ x: number; y: number }>;
});
```

…or keep the spatial index purely projection-agnostic (take integer
cells) and ship *separate* utility functions (`cellOfPoint`,
`cellsForAabb`) that consumers compose. **The prototype evidence
now favours the latter:** the AABB iteration shape is too varied
(radius, ellipse, polygon, tile-footprint) to bake into `HashGrid2D`
itself. A `@pierre/ecs/modules/spatial/projections` sub-module exposing
`cellOfPoint`, `cellsForAabb`, `cellsForCircle` would satisfy 80% of
consumers without committing the engine to a projection interface.

**Promotion bar:** **three consumers** on the grid-boilerplate problem,
now with enough shape-variance to pick the right abstraction. Ready
for M-next. Lower my previous "implicit projection in `enableSpatial`"
recommendation and instead propose "projection utilities as a separate
sub-module."

### 2. `world.reset()` — **third consumer, promotion clearly met**

Snake, Asteroids, and Platformer all hand-drain stores with
`[...posStore.keys()].forEach(queueDestroy)` followed by
`flushDestroys` + `lifecycle.flush`. The Platformer variant *also*
has to clear the spatial grid (`state.grid.clear()`). Three consumers,
same pattern. Should have been an M2 helper after Asteroids; now it's
overdue.

### 3. `FixedIntervalTickSource` — **third consumer, same pattern**

`new ManualTickSource()` + `setInterval(() => tickSource.tick(), 1000/60)`
+ manual unsubscribe on teardown appears in all three prototypes
verbatim. The wrapper is trivial (~15 LOC). Flag remains as M2
candidate — low-risk, high-ergonomics win.

### 4. Per-component `serialize`/`deserialize` boilerplate — **third consumer**

Six components × ~5 lines of dead pass-through code. Three consumers
now written it. The `simpleComponent<T>(name, keys)` helper is past the
Rule-of-Three bar, but still without a real save/load use case to prove
the ergonomics. Borderline promote.

## What was surprising

- **Axis-by-axis AABB resolution is genuinely ~30 LOC per axis.** The
  canonical "move on X, resolve against all overlapping statics (take
  nearest push-out), then move on Y, resolve the same way" pattern
  fits the ECS system contract (one read-modify-write per tick) with
  no substepping and no CCD. For a platformer's ~60 FPS / ≤900 px/s,
  the `dt * v < halfExtent` invariant holds trivially. This is *not*
  the "shortest-axis" separating-axis theorem — it's simpler, and
  good enough for the velocity/geometry regime. Engine-level physics
  would be overkill here.
- **Not indexing dynamics in the grid was the right call.** With a
  single player, there's no dynamic-vs-dynamic broadphase to amortise;
  the player simply computes its own AABB cells each tick and queries
  statics. Two-consumer data point (Asteroids also doesn't
  cross-index): engine should *not* force dynamics into the spatial
  index. Current `HashGrid2D` (opt-in add/remove) is exactly right.
- **Coin-as-non-indexed-entity clarifies static vs dynamic isn't binary.**
  Coins are neither solid bodies nor fast-moving dynamics — they're a
  small set iterated directly. Three categories emerged: *indexed
  statics* (platforms), *non-indexed dynamic* (player), *non-indexed
  set* (coins). The engine exposes all three for free because
  `HashGrid2D` and `TagStore` are independent.
- **`GameState.dtMs` pattern is now canonical across three prototypes.**
  Every prototype threads `dtMs` through the shared state rather than
  asking the `TickSource` for it. That *is* the pattern — the engine
  should *not* add a "dt delivery" mechanism; consumers hand-roll it
  and it stays out of the engine's way.

## Engine gaps identified (updated from Asteroids)

| # | Gap | Consumers | Status |
|---|---|---|---|
| 1 | `FixedIntervalTickSource` | Snake + Asteroids + **Platformer** | **3 consumers — promote.** M2. |
| 2 | `simpleComponent<T>(name, keys)` helper | Snake + Asteroids + **Platformer** | **3 consumers — borderline promote.** Wait for save/load consumer. |
| 3 | `world.reset()` / `clearAll()` | Snake + Asteroids + **Platformer** | **3 consumers — promote.** M2. |
| 4 | `world.endOfTick()` composite flush | All three | Promote with caution (hides flush order). |
| 5 | Projection utilities sub-module (`cellOfPoint`, `cellsForAabb`, `cellsForCircle`) | Asteroids (point) + **Platformer** (AABB) | **2 consumers, 2 distinct shapes — promote.** M-next. Revise from rung-2's "inline into `enableSpatial`" recommendation to "separate utilities sub-module." |
| 6 | `queryNearPixels` / projection-aware spatial | Subsumed by #5. | Drop. |
| 7 | `LifetimeDef` + lifetime system module | Asteroids only (bullets). Platformer has no lifetimes. | Still 1 consumer. Deferred. |
| 8 | `GroundedDef`-style "physics feedback" component | Platformer only. | 1 consumer, genre-specific. Do not promote. Leaving here as a data point: *per-entity physics flags belong in app code.* |

## What did *not* become a finding

- **No physics engine.** Zero want for a solver module. If a future
  rung adds multi-body physics (stacked crates, joints, contact
  manifolds), this data point becomes interesting. For now, AABB-in-
  app-code is a feature, not a gap.
- **No animation state machine.** Player is a blue rectangle. Genre-
  appropriate for a sandbox; a real platformer with sprite animations
  would expose different gaps.
- **No camera.** Level fits in the viewport. A scrolling prototype
  would test whether `GameState` + renderer is the right place for
  camera state (it probably is).

## Verdict

**Rule R1 still holds after rung 3.** Three genres — grid turn-based
(Snake), continuous shoot-'em-up (Asteroids), continuous physics
platformer — all composed from the same primitives with zero engine
edits. The engine's "assembly kit" thesis is holding.

**Rung-3 take-aways:**

1. The **projection utilities** gap has enough shape-variance (point +
   AABB now) to commit to a design: ship them as a separate sub-module,
   not as an `enableSpatial` option.
2. **`FixedIntervalTickSource`** and **`world.reset()`** have each now
   been hand-rolled three times. These two are the clearest promotion
   candidates for M2.
3. **Physics is correctly out of scope.** A 60-LOC AABB solver in app
   code beats an engine-level physics module for the sandbox-scale
   games the ladder keeps producing.

Next rung (tower-defense? puzzle? stealth grid?) should test whether
any of these promotions unlock non-obvious wins and whether a fourth
genre surfaces a spatial gap the utilities sub-module doesn't cover.


---

## M2 promotions status (2026-10-30)

The gaps flagged in this postmortem have been addressed by the engine M2
promotions (five gaps promoted together after the platformer postmortem):

- FixedIntervalTickSource — commit 139bb8c
- EcsWorld.clearAll — commit b3c369c
- Spatial projection utilities (cellOfPoint, cellsForAabb, cellsForCircle) — commit 93a3907
- simpleComponent<T> helper — commit ceebeec
- EcsWorld.endOfTick — this file's final M2 commit

See `docs/plans/done/engine-m2-promotions.md` for the full plan and migration details.

---

## M2 promotions status (2026-10-30)

The gaps flagged in this postmortem have been addressed by the engine M2
promotions (five gaps promoted together after the platformer postmortem):

- FixedIntervalTickSource — commit 139bb8c
- EcsWorld.clearAll — commit b3c369c
- Spatial projection utilities (cellOfPoint, cellsForAabb, cellsForCircle) — commit 93a3907
- simpleComponent<T> helper — commit ceebeec
- EcsWorld.endOfTick — this file's final M2 commit

See `docs/plans/done/engine-m2-promotions.md` for the full plan and migration details.
