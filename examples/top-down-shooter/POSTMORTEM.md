# Top-Down Shooter Postmortem — Rung 4

**Prototype:** Twin-stick arena shooter. WASD move, mouse aim, hold-fire
bullets, enemy swarm steering toward player, bullet↔enemy and
enemy↔player collisions, auto-ramping spawn rate, game-over + reset.
**Engine version:** `@pierre/ecs` as of the commit that landed this
prototype. **No engine edits.** Rule R1 held for a fourth consumer.
**LOC:** ~470 across `src/` (components ~25, game 190, systems
~165 across four files + barrel, render 100, main 165). Budget: ~1000
✅ (came in well under — the collision/trigger + motion/lifetime
modules absorbed most of the work we expected to write by hand).

## What worked

### Engine carried the whole simulation, again

- **Six-system pipeline composed first try** via `runAfter`:
  `input → enemy-steer → movement → lifetime → collision → spawner`.
  Velocity written by the input system on the player and by the steer
  system on enemies is consumed by `makeVelocityIntegrationSystem` in
  the same tick. No phase labels needed, no manual topological sort.
- **`makeVelocityIntegrationSystem` with `clamp` boundary + `onMove`
  grid-sync** was exactly the right shape for a bounded arena. We
  wrote zero boundary-handling code in app land, unlike Asteroids
  which took `mode: 'wrap'`. Having both modes in one option surface
  paid off.
- **`makeTriggerSystem` + `HashGrid2D.queryNear(cell, 1)`** gives
  sub-linear bullet/enemy pair generation at the scale this prototype
  reaches (~200 bullets × ~60 enemies by the time the arena
  saturates). The broadphase only walks each enemy's 3×3 cell
  neighbourhood — bullets live in the same grid, so they surface as
  `otherId` candidates without a separate bullet tag walk.
- **`makeLifetimeSystem` despawned 560-bullet-per-second spam** with
  zero bookkeeping in app code. `onExpire` threads cleanly into the
  `despawn` helper that also cleans the spatial grid.
- **`RenderableDef` polygon + circle shapes** cover the entire
  prototype's visuals. Crosshair, HUD, and game-over overlay are
  drawn manually after `Canvas2DRenderer.render()` — the exact same
  "module draws entities, consumer overlays UI" seam the README
  prescribes. No friction.
- **`RotationDef` read by `Canvas2DRenderer`** means the player
  triangle visibly tracks the cursor with a single line of code
  (`rot.angle = Math.atan2(dy, dx)`). Continuous aim "just worked"
  from a rendering standpoint.

### Scheduler + tag iteration at scale

The arena reaches ~300 live entities (player + bullets + enemies) at
ramp-cap. The scheduler runs six systems at 60 Hz without visible
frame drops on a desktop Chromium. Tag iteration (`for (const id of
ctx.world.getTag(EnemyTag))`) is cheap enough that the steer system
rebuilds velocity for every enemy every tick with no memoisation and
it doesn't show. Confirms that the archetype-cache work (roadmap
item 3.1) is not yet forced by a real consumer at this scale — we
were bracing for it, but the current plain-tag iteration is fine.

## What was missing / awkward

### 1. `@pierre/ecs/modules/input` has no pointer/axis support — ~~**real gap, now proven**~~ **resolved after rung 4**

> **Update (landed alongside rung 4 cleanup):** Path A implemented.
> `@pierre/ecs/modules/input` now ships `PointerProvider` +
> `Pointer.LeftButton / MiddleButton / RightButton` codes that drop
> into `createInput` maps identically to keyboard keys. Position is
> exposed as `pointer.state.{x, y, over}` (analog, provider-hosted,
> keeps `InputState<T>` cleanly digital). Default projector is
> canvas-aware — scales `clientX/Y` to internal pixel coordinates
> when the target has numeric `width`/`height`. The shooter's
> bespoke DOM listeners + `fireHeld` flag + `aim` struct are gone;
> `main.ts` dropped ~35 LOC and `GameState` lost two fields.

The rung-4 card of the roadmap flagged this: "first test of input
abstraction for continuous aim." The prototype confirmed it the
moment the first line of code was written. The shooter needed three
things the original `input` module did not provide:

1. **Pointer position** (canvas-space `{x, y}`), continuously updated.
2. **Pointer button hold state** (LMB down/up, separate from key
   actions).
3. **Client-rect → canvas-coordinate projection** (when the canvas
   is CSS-scaled vs. its internal pixel resolution).

All three are covered by the shipped `PointerProvider`. The original
gap analysis follows (kept for historical reference).

Originally, `createInput` was purely a digital action map: down/up/edge
per named action. For mouse aim, we bypassed the module entirely:

```ts
// in main.ts, outside the input module
const onPointerMove = (ev: PointerEvent): void => {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  state.aim.x = (ev.clientX - rect.left) * sx;
  state.aim.y = (ev.clientY - rect.top) * sy;
};
canvas.addEventListener('pointermove', onPointerMove);
```

…and then `state.aim` lived on `GameState` and the input system read
it directly. Same story for LMB — a bare boolean on
`GameState.fireHeld` set by `pointerdown` / `pointerup` listeners.

That worked, but it was **the exact kind of boilerplate the input
module exists to eliminate for the keyboard case.** The Snake,
Asteroids, and Platformer postmortems all praised the module for
exactly this reason. The first continuous-input consumer landed and
immediately had to hand-roll a parallel system.

**Proposal adopted — Path A ("pointer source")**

A `PointerProvider` paralleling `KeyboardProvider`:

```ts
const pointer = new PointerProvider({ target: canvas });
createInput<Action>(
  { fire: [Key.Space, Pointer.LeftButton], /* … */ },
  [keyboard, pointer],
);
// Read continuous aim:
state.pointer = pointer.state;   // { x, y, over }
```

Path B (axes as a first-class concept) was deferred: without a
gamepad consumer it would design in a vacuum. Revisit when rung 7
(3D) or a gamepad-driven prototype lands.

### 2. Continuous-to-cell projection boilerplate — **fourth consumer confirms**

Same finding as Asteroids and Platformer. Shooter rewrote:

```ts
export function cellOf(x: number, y: number): { x: number; y: number } {
  return cellOfPoint(x, y, CELL_SIZE);
}
```

plus `grid.add` / `grid.remove` / `grid.move` wrapper calls through
`despawn()` and the motion system's `onMove`. Nothing new — the
Platformer postmortem's conclusion holds: **ship a
`@pierre/ecs/modules/spatial/projections` sub-module with
`cellOfPoint`, `cellsForAabb`, `cellsForCircle`** and call it done.
This is the fourth prototype that would import from such a module.

(`cellOfPoint` is already exported — the point is that the wrapping
`cellOf` + grid-sync boilerplate is what repeats, not the
projection itself. A thin helper like `grid.followVelocity(ctx,
PositionDef, cellSize)` — a canned `onMove` body — would cover every
consumer seen so far.)

### 3. No narrowphase helper for "is entity A in tag B's tag set?"

Very minor. The collision onOverlap does
`ctx.world.getTag(BulletTag).has(otherId)` to distinguish bullet
hits from player hits inside the same broadphase pair stream. It
works, but reads awkwardly: the broadphase emits pairs keyed on
enemy-vs-anything, then the narrowphase switches on the "other"
entity's tag. It might be cleaner to run *two* `makeTriggerSystem`
instances — `enemy × bullet` and `enemy × player` — each with a
focused broadphase. The shooter picked the single-trigger shape
because the enemy loop over `queryNear` only wants to happen once;
splitting it into two loops would roughly double the broadphase cost
for little readability gain.

**No engine change required.** Filing this as an observation for
future M8-ish "spatial query DSL" work, not an action item.

### 4. FPS metering lives in render code

No module helps with this today; every prototype has hand-rolled a
`performance.now()` ringbuffer or delta-count. Five lines each, so
it's not a pain point — but it is a recurring copy-paste across four
prototypes now. Candidate for a `@pierre/ecs/modules/telemetry`
helper someday. Not urgent.

## Engine assumptions broken

Per the roadmap's rung-4 card:

| Assumption | Broken? | Notes |
|---|---|---|
| Continuous mouse-aim input | ✅ | Via DOM listeners outside the input module — see finding #1. |
| Held-fire with cooldown | ✅ | Via the input module's `isDown` + app-side cooldown timer. Clean. |
| Hundreds of entities simultaneously | ✅ | ~300 live at ramp-cap without frame drops. Engine throughput fine. |
| Per-frame input polling | ✅ | Mouse position is polled from `state.aim` every tick; LMB state is polled from `state.fireHeld`. Keyboard still uses the module's event-driven `isDown`. |
| Gamepad analog stick | ❌ (skipped) | Out of scope for this prototype. Would force a real axis API. |

## Engine gaps opened by rung 4

**New:**

- **Pointer input support** (finding #1). First real consumer, first
  real evidence. Path A proposal above is the immediate move.

**Reaffirmed (3rd or 4th consumer now):**

- **Projection / grid-sync helpers** (finding #2). Four prototypes
  have now written the same `cellOf` + onMove glue.

**Not hit (good news):**

- **Archetype cache / query optimisation** (roadmap 3.1). ~300 live
  entities at 60 Hz works with plain tag iteration. No pressure yet.
- **Object pooling** (roadmap 3.2). Allocations-per-tick are fine;
  bullet spawns create ~5 component writes and no visible GC hitch
  over a 3-minute run. Pool when a real consumer needs it.
- **Scheduler phases / parallel system execution.** Six serial
  systems at 60 Hz costs < 1 ms per tick. Scheduler is not the
  bottleneck anywhere near this scale.

## Recommendation — engine roadmap deltas

1. **Ship pointer support in `@pierre/ecs/modules/input`.** Path A
   from finding #1. Unblocks rung 5 (card battler, drag-to-play) and
   any future GUI-heavy consumer, and clears the single biggest
   friction point in this prototype.
2. **Ship the spatial projection/onMove helper** as proposed in the
   platformer postmortem. Four-prototype confirmation.
3. **Leave archetype cache, pooling, and scheduler parallelism
   alone** — rung 4 did not produce a real justification. Defer
   until a consumer genuinely struggles.

Rung 4 was *cheap* relative to its budget because the engine did
more of the work than expected. The gap it exposed is narrow,
well-scoped, and has a ~80 LOC fix. Net: positive result for the
engine.
