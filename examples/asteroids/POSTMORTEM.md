# Asteroids Postmortem — Rung 2

**Prototype:** Asteroids (continuous 2D, momentum physics, rotating ship, bullets, 3-tier rock splitting, screen wrap).
**Engine version:** `@pierre/ecs` as of commit `6fc8e7d` (post-Snake).
**LOC:** ~465 across `src/` (components 7×~6, game 165, render 85, main 115, systems 4×~30 + barrel). Budget: 400–500 ✅.
**Engine edits required:** **zero.** Rule R1 held across a second consumer.

## What worked (engine carried a different genre)

- **Scheduler + `runAfter` ordered five systems first try.**
  `input → movement → lifetime → collision` composed via declarative
  `runAfter` strings. No implicit coupling, no wiring in `main.ts`.
- **`EcsWorld` + `ComponentStore.keys()` for velocity integration.**
  Movement system iterates `velStore.keys()` and reads/writes in place.
  This is the exact same pattern the roguelike uses for FOV and AI —
  confirms `ComponentStore` is not grid-specific.
- **`TagStore` as a typed entity set.** `world.getTag(RockTag)` gave me
  a live iterable of rocks for both collision anchor and render. Three
  tags (Ship/Rock/Bullet) kept category checks free of per-entity data.
- **`ManualTickSource` + `setInterval(..., 1000/60)`.** Same pattern
  Snake used; for Asteroids the fixed-step was essential (physics
  determinism). `dtMs` is passed through `GameState` rather than the
  TickSource itself, which kept the engine unaware of "seconds".
- **`EventBus<AsteroidsEvent>` for GameOver.** Zero-cost, same as Snake.
- **Public import path `@pierre/ecs/modules/spatial`** exposed
  `HashGrid2D` as a constructible type, which was the whole point of
  M1. A consumer instantiates it directly.

## What was awkward — the rung-2 finding

**BYO spatial is verbose for a continuous-coordinate game.**

Snake used `world.enableSpatial(PositionDef)` and never thought about
cell keys again — grid positions are already integer cell coordinates,
so the default integration "just works." Asteroids cannot do this:
`PositionDef` stores floats (pixels), but `HashGrid2D` wants integer
cell keys. The consumer has to:

1. Construct `new HashGrid2D()` directly (bypassing `enableSpatial`,
   because `enableSpatial` would try to index continuous floats as cell
   keys and blow the bucket count).
2. Maintain a `cellOf(x, y)` projection manually.
3. Call `grid.add(id, cellOf(...).x, cellOf(...).y)` on spawn.
4. Call `grid.remove(id, ...)` on despawn.
5. In the movement system, diff old vs new cell every tick and call
   `grid.move(id, prev, next)` only when they differ.

That boilerplate (roughly 15 lines spread across spawn/despawn/movement)
is the same for every continuous-space consumer. Snake did none of it.

**This is the rung-2 finding the prototype ladder was designed to
surface.** The engine's current `SpatialStructure<TPos>` abstracts the
*position type*, but assumes the consumer already has a `TPos` that
matches the structure's native key space. For grid games, `Position ≡
TPos`. For continuous games, there is an implicit projection and the
consumer owns it.

### Proposed engine change (after one more consumer or on demand)

Extend `HashGrid2D` (and `enableSpatial`) to accept:

```ts
{
  cellSize?: number;                              // default 1
  project?: (pos: TPos) => { x: number; y: number }; // default identity
}
```

With `enableSpatial(PositionDef, { cellSize: 64 })`, Asteroids could
use `world.spatial.getAt(rockX, rockY)` (continuous coords in, cell
lookup out) and the engine would handle the projection + cell-diffing
invisibly in the `ComponentStore` onSet hook. Spawn/despawn boilerplate
disappears; movement system just writes `pos.x`/`pos.y` via the store
and the spatial index stays live.

**Promotion bar:** Rule of Three says one more continuous-space
consumer. I'd still promote this now if the next consumer is "any
roguelike with sub-tile animated positions," because that's almost
certain to follow. Noting it as an M2 candidate.

## Other friction

- **Same `ComponentDef` `serialize`/`deserialize` boilerplate as Snake.**
  Seven components × ~6 lines each. Second consumer confirms the gap.
  Still below my promotion threshold (no save/load, no real need), but
  now both prototypes have written the same dead code.
- **Ship direction vs movement direction is app-level.** I store
  `angle` in a `Rotation` component and derive thrust from `cos/sin`.
  No engine help needed, but it reminded me that `DirectionDef` in
  Snake was really a discrete 4-way enum — completely different type.
  Both are rightfully consumer code; not an engine gap.
- **Collision broadphase with `queryNear(cellPos, radiusCells)` works**
  but requires the consumer to convert pixel radius → cell radius via
  `Math.ceil(maxRadius / CELL_SIZE)`. Same story as cell projection: a
  projection-aware spatial would let me call `queryNearPixels(pos, 50)`.
- **No `world.reset()` helper.** Asteroids's `resetGame` drains every
  store by iterating `posStore.keys()` and queuing destroys. Snake had
  the same issue. Two consumers now — **promotion bar met** on this
  one. Flagged for the engine backlog.

## What was surprising

- **`queueDestroy` + `flushDestroys` correctly cascaded** through
  `ComponentStore.onDelete` into the spatial index. I expected to have
  to manually `grid.remove` on destroy, but the hook in `game.ts`'s
  `despawn()` plus `world.queueDestroy()` handled it — and after a
  split, the three spawns (parent destroy + 2 children add) all showed
  up in the next tick's collision query. No one-frame lag.
- **Four systems × `runAfter` was enough.** No phase groups, no
  pre/post hooks needed. The dependency DAG stayed linear. For a
  physics game I expected to want `fixedUpdate` vs `update` phases;
  instead, the scheduler's one-pass-per-tick model plus the
  ManualTickSource's tick cadence gave me deterministic behavior for
  free.
- **`LifetimeDef` as a generic bullet-expiry pattern** is trivial with
  ComponentStore. 15-line system. Both Snake (no lifetimes) and
  Asteroids (bullets) combined suggest it belongs in a future engine
  module if a third consumer wants status-effect timers.

## Engine gaps identified (updated from Snake)

| # | Gap | Consumers | Status |
|---|---|---|---|
| 1 | `FixedIntervalTickSource` | Snake + Asteroids both run `setInterval(tickSource.tick, ms)` manually | **2 consumers — promotion bar met.** M2 candidate. |
| 2 | `simpleComponent<T>(name, keys)` helper | Snake + Asteroids both wrote dead serialize/deserialize | **2 consumers — borderline.** Wait for consumer #3 or a real designer complaint. |
| 3 | `world.clearAll()` / `world.reset()` | Snake reset + Asteroids reset both hand-drain stores | **2 consumers — promotion bar met.** M2 candidate. |
| 4 | `world.endOfTick()` (flush composite) | Both prototypes run 3 flushes per tick | Promotion bar met but risk of hiding order-sensitive flushes. Deferred pending roguelike simplification study. |
| 5 | `enableSpatial` with `{ cellSize, project }` | **Asteroids** (continuous → grid projection); roguelike sub-tile animations would be #2 | **1 consumer — under bar**, but high-confidence prediction. **Flag as M-next top candidate.** |
| 6 | `queryNearPixels(pos, pixelRadius)` convenience | Same as #5 | Subsumed by #5. |
| 7 | `LifetimeDef` + lifetime system as an optional module | Asteroids only; status-effect timers in roguelike would be #2 | Deferred. |

## Verdict

**Rule R1 still holds after rung 2.** A genre the roguelike had no
influence over (continuous, real-time, momentum) slotted into the same
primitives with zero engine edits. One substantive gap surfaced
(continuous-to-cell projection), exactly at the scaffolding layer the
prototype ladder is designed to expose.

**Rung-2 take-away:** the engine is general across discrete *vs*
continuous coordinate spaces, but the *spatial index's position
projection* is currently a consumer responsibility. That's the single
most important candidate for M2, ahead of tick/reset/serialize helpers.

Next rung (whatever it is — a physics sim, a tower-defense, a
platformer) should test whether gap #5 holds under a third consumer and
whether gap #1 or #3 finally justifies engine-side helpers.


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


---

## M-Next promotion status (2026-10-31)

Gap #7 (`LifetimeDef` + lifetime system) shipped under the new `Path-B` canon promotion rule as `@pierre/ecs/modules/lifetime`. Single internal consumer (asteroids, still), but canon references (Unreal `AActor::SetLifeSpan`, Unity `Destroy(obj, t)`, Gregory *Game Engine Architecture* 3rd ed. §12.5) substituted for the second data point. Asteroids migrated to the engine module. See `docs/plans/done/engine-lifetime-module.md`.

