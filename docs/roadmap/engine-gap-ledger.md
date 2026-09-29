# Engine Gap Ledger

Raw engine gaps surfaced while building the
[`examples/`](../../examples/), **awaiting triage**. A gap is something
`@pierre/ecs` *lacked* that an example had to hand-roll locally, or an
existing engine surface that had to be extended before an example could be
built. Recording every gap in one place gives the "how many consumers hit
this?" question a real answer.

**This file is an inbox, not a record.** A row lives here only while it is
undecided. Triaging it *removes* it: a promotion becomes an entry in
[ecs-module-backlog.md](ecs-module-backlog.md), a rejection becomes a line in
[non-goals.md](non-goals.md), and the closed rows of the last exhaustive pass
are frozen in
[archived/audits/2026-09-21-example-gap-audit.md](../archived/audits/2026-09-21-example-gap-audit.md).
Closures outside a pass are frozen in the dated audits beside it — most
recently
[2026-09-29-tick-runner-events.md](../archived/audits/2026-09-29-tick-runner-events.md).
A row that outlives its decision is stale by construction.

## How this works

Two roles, deliberately separated (see
[extending-the-engine.md](../extending-the-engine.md)):

### Gap writer — just built an example

List the gaps you hit. **Symptom only — do not decide what module a gap
becomes.** That decision biases toward your one game's shape, which is
exactly what we keep out of the writer's hands.

- If a matching row already exists, add your example to its **Consumers**
  list (you're saying "I hit the same wall", not making a module call).
- Otherwise add a new row.
- Record how you handled it. **You can always build the example without
  touching the engine** — so the choice is governed by canon, not by whether
  a module already exists:
  - **Kept local (default).** You hand-rolled the missing piece in the
    example and touched nothing in the engine. Add it to the
    [open gaps](#open-gaps-awaiting-triage) table. This is the right call
    unless the capability is established canon.
  - **Promoted.** The capability was clearly canon (standard — the engine
    *ought* to have it), so you added a primitive or extended an existing
    module under the sliding-scale rule. Extending an existing module counts
    too, and carries the **same bar** — "a module already exists" is not a
    licence to put a non-standard one-off into it. Record it in the dated
    audit file for the current pass rather than here.

### Gap triager — separate pass

Read the open gaps, group related ones, and apply the sliding-scale
promotion rule in [extending-the-engine.md](../extending-the-engine.md). For
each gap (or group): promote it into an
[ecs-module-backlog.md](ecs-module-backlog.md) entry, decline it into
[non-goals.md](non-goals.md), or ship the fix. Then **delete the row from
this file** and append it to that pass's dated audit under
`docs/archived/audits/`.

## Status vocabulary

There is only one status here: **Open — recorded, kept local, not yet
triaged.** The terminal states (**Promoted**, **Resolved**, **Rejected**)
are not statuses of a live row, they are the reasons a row left this file.
Their records live in the dated audit files.

## Verification provenance (read before trusting any row)

Every row carries a **Verified @ src** stamp: the exact `file@line` that was
opened to confirm the claim, plus whether the capability is `PRESENT` or
`ABSENT`. This exists because three earlier triage/report passes each carried
forward ~half-false claims — the failure mode was *inferring* a gap from "an
example hand-rolls X" without opening the engine source, then laundering that
inference into more confident downstream docs. The fix is structural, not
"verify harder":

- A row may only assert a gap with a source citation. **No citation → the
  claim is not trustworthy and must be re-verified before acting.**
- The stamp records the API **shape**, not just the capability name — e.g.
  "boundary clamps to `[0,width)` only, no inset", because the
  fit-determining detail lives in the signature, not in prose.
- **Adoption claims need TWO citations, not one.** An "X can adopt Y / X is a
  clean migration / N consumers fit" claim is a **join of two facts**: (1)
  the engine capability's shape, and (2) each consumer's *actual* usage. A
  stamp that points only at `src/modules/...` proves the capability exists,
  **not** that any consumer fits it. So every adopt/fit/clean-swap row must
  carry an engine `file@line` **and**, per named consumer, that example's
  `file@line`. This rule cost the 4th pass a re-do: it stamped only the
  engine side and still listed "flappy, jetpack **wrap**" as boundary
  adopters — opening their `systems.ts` showed size-aware clamps, not wrap.
  Capability-exists ≠ consumer-fits.
- "Ships-but-unadopted" (capability `PRESENT`, consumers hand-roll) is
  recorded distinctly from "genuinely missing" (`ABSENT`). The first is an
  **adoption** follow-up; only the second can justify a new module. And
  "ships-but-**module-private** / wrong-shape-to-adopt" is a **Build**, not
  an adoption — verify the export surface, not just that the logic exists
  somewhere.
- Last exhaustive source-cited pass: **2026-07-15** (every row opened);
  boundary + pointer rows re-verified **dual-sided** (engine + consumer) the
  same day after the single-sided miss above. Rows below stamped after that
  date were verified in the pass named in the row.

## Open gaps (awaiting triage)

The **Consumers** column is the live tally that feeds the
[promotion rule](../extending-the-engine.md); **Verified @ src** is the
provenance stamp (see above). Rows tagged `(audit Bn)` came from the one-time
cross-sectional [examples audit](../archived/example-engine-gap-audit.md);
the rest were grown incrementally. No tagged row is live at present — every
closed one, tagged or not, is frozen under
[archived/audits/](../archived/audits/).

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Carried-rider adoption — `modules/attach`'s `inheritVelocity` / carrier path has **no confirmed adopter**, so the rider case the module was built for is unexercised. | frogger (original motivation) | **PRESENT (module)**: `AttachDef` + `inheritVelocity` + `makeAttachSystem`@[`attach/attach.ts`](../../src/modules/attach/attach.ts). **ABSENT (adoption)**: a grep of `examples/**` for `AttachDef` finds only asteroids@[`game.ts:131`](../../examples/asteroids/src/game.ts) and spacewar@[`game.ts:173`](../../examples/spacewar/src/game.ts) — both use `snapPosition`/`snapRotation`, i.e. the *follow* case. frogger imports nothing from `modules/attach`. | **Open — adoption.** Two consumers ship-but-don't-exercise the carrier half. Either migrate frogger's log/turtle rider, or record the carrier path as canon-only (no internal consumer) so the claim stops being implied. |
| Steering force → velocity integration — every steering consumer re-writes "velocity += force·dt (·gain), truncate to max speed", plus an ad-hoc `vel *= k` brake. | boids, critters, stealth-guard, woodcutter (2026-09-29 example sweep) | **ABSENT**: `modules/steering` exports only force producers plus `truncate`/`combine`@[`steering/steering.ts:22,175`](../../src/modules/steering/steering.ts); nothing applies a force to a `VelocityDef`. Consumers: boids@[`flock.ts:91`](../../examples/boids/src/systems/flock.ts), critters@[`tree.ts:38`](../../examples/critters/src/tree.ts), stealth-guard@[`systems.ts:94`](../../examples/stealth-guard/src/systems.ts), woodcutter@[`actions.ts:110`](../../examples/woodcutter/src/actions.ts). | **Open.** Four consumers, same two lines each; bears on the deferred `SteeringAgentDef` backlog entry, whose gate reads "no consumer wants the component form". |
| Per-agent AI state lives outside the ECS — each AI example keeps its brains in a plain array on the game state and points leaf/state code at "the current one" through an `activeX` field set around every tick. | critters (BT), stealth-guard (FSM), woodcutter (GOAP) (2026-09-29 sweep) | **ABSENT**: `modules/fsm` ships `makeFsm`/`tickFsm` only@[`fsm/fsm.ts:30,48`](../../src/modules/fsm/fsm.ts), behaviour-tree and goap ship pure functions; no component/system form. Consumers: critters@[`game.ts:59`](../../examples/critters/src/game.ts), stealth-guard@[`game.ts:74`](../../examples/stealth-guard/src/game.ts), woodcutter@[`game.ts:50`](../../examples/woodcutter/src/game.ts). | **Open.** Bears on the deferred `FsmDef` wrapper (fsm V2) and the BT/GOAP V2 entries. |
| Movement vector from four directional actions — consumers compute `right − left`, `down − up` (or the 3D local-X/Z equivalent) and normalise it themselves. | rpg, stealth-guard, doom, portal, platformer-3d (2026-09-29 sweep) | **ABSENT**: `InputState` exposes `isDown`/`justPressed`/`justReleased` only@[`input/input-state.ts:17`](../../src/modules/input/input-state.ts); no axis/vector read. Consumers: rpg@[`main.ts:296`](../../examples/rpg/src/main.ts), stealth-guard@[`systems.ts:31`](../../examples/stealth-guard/src/systems.ts), doom@[`input.ts:41`](../../examples/doom/src/systems/input.ts), portal@[`input.ts:36`](../../examples/portal/src/systems/input.ts), platformer-3d@[`input.ts:36`](../../examples/platformer-3d/src/systems/input.ts). | **Open.** |
| Despawn when an entity leaves the play area — each scroller writes its own "off-screen → `queueDestroy`" sweep. | jetpack, flappy, river-raid, space-invaders (2026-09-29 sweep) | **ABSENT**: `modules/lifetime` is time-based only@[`lifetime/lifetime.ts:44`](../../src/modules/lifetime/lifetime.ts); `modules/motion` boundaries are `wrap`/`clamp` only@[`motion/motion.ts:19`](../../src/modules/motion/motion.ts). Consumers: jetpack@[`systems.ts:115`](../../examples/jetpack/src/systems.ts), flappy@[`systems.ts:87`](../../examples/flappy/src/systems.ts), river-raid@[`systems.ts:193`](../../examples/river-raid/src/systems.ts), space-invaders@[`systems.ts:346`](../../examples/space-invaders/src/systems.ts). | **Open.** river-raid's play area scrolls, so a fixed-bounds shape would not cover it alone. |
| `Vec2` helper surface lags `Vec3` — no `vec2Length`/`vec2Distance`/`vec2ClampLength`, so 2D consumers write `Math.hypot(a.x − b.x, …)` inline (dozens of sites) and clamp speed with `steering`'s `truncate`. | boids, critters, stealth-guard, woodcutter, asteroids, spacewar, local-pong (2026-09-29 sweep) | **ABSENT**: `math/vec2.ts` exports only `vec2Normalize`/`vec2ScaleToLength`/`vec2MoveToward`@[`math/vec2.ts:9,22,40`](../../src/modules/math/vec2.ts), while `vec3.ts` ships `vec3Length`/`vec3Distance`/`vec3ClampLength`. Sample consumers: stealth-guard@[`states.ts:19`](../../examples/stealth-guard/src/states.ts), woodcutter@[`actions.ts:49`](../../examples/woodcutter/src/actions.ts), spacewar@[`input.ts:35`](../../examples/spacewar/src/systems/input.ts). | **Open.** |
| Uniform float in a range — `min + Math.random() * (max − min)` is re-typed across examples; `modules/rng` has integers, pick and shuffle but no float range. | flappy, boids, critters, jetpack, space-invaders, river-raid (2026-09-29 sweep) | **ABSENT**: `rng.ts` exports `makeSeededRng`/`randomInt`/`pick`/`shuffle`@[`rng/rng.ts:14-46`](../../src/modules/rng/rng.ts). Consumers: flappy@[`game.ts:85`](../../examples/flappy/src/game.ts), boids@[`game.ts:86`](../../examples/boids/src/game.ts), space-invaders@[`main.ts:110`](../../examples/space-invaders/src/main.ts). | **Open.** |
| Circle-vs-AABB push-out, and avoidance of box-shaped obstacles — a circle mover resolving against wall rectangles hand-rolls the closest-point separation, and steers around them with a bespoke radial+tangential force. | stealth-guard (2026-09-29 sweep) | **ABSENT**: `aabbVsCircle` is a boolean test@[`collision/narrowphase.ts:63`](../../src/modules/collision/narrowphase.ts); `bounceOffAabb` resolves AABB-vs-AABB only; `obstacleAvoidance` takes circles@[`steering/steering.ts:233`](../../src/modules/steering/steering.ts). Consumer: stealth-guard@[`systems.ts:105,160`](../../examples/stealth-guard/src/systems.ts). | **Open.** One consumer. |
| Frame tick source on a non-wall clock — a rAF-paced source whose `deltaMs` comes from `AudioContext.currentTime` had to be written from scratch (~60 lines) because the shipped rAF source cannot take a clock. | rhythm (2026-09-29 sweep) | **ABSENT**: `AnimationFrameTickSourceOptions` injects only `raf`/`cancelRaf`@[`tick/animation-frame-tick-source.ts:8`](../../src/modules/tick/animation-frame-tick-source.ts); delta is the rAF timestamp. Consumer: rhythm@[`audio.ts:87`](../../examples/rhythm/src/audio.ts). | **Open.** One consumer. |
| Tiny synchronous persisted value (a high score) — five examples copy the same `try { localStorage… } catch {}` load/save pair. | breakout, space-invaders, frogger, river-raid, jetpack (2026-09-29 sweep) | **PRESENT but wrong shape**: `modules/save` is async, checksummed and envelope-based@[`save/save-storage.ts:57,83,135`](../../src/modules/save/save-storage.ts) — a whole-save store, not a settings/score KV. Consumers: breakout@[`main.ts:22`](../../examples/breakout/src/main.ts), space-invaders@[`main.ts:36`](../../examples/space-invaders/src/main.ts), frogger@[`main.ts:33`](../../examples/frogger/src/main.ts), river-raid@[`main.ts:30`](../../examples/river-raid/src/main.ts), jetpack@[`main.ts:27`](../../examples/jetpack/src/main.ts). | **Open.** |
| Grid-cell movement, 4th consumer — roguelike keeps a `gridPos { x, y }` cell per actor (rules read it), slides `PositionDef` to the cell centre with a tween after each step, and answers occupancy by scanning actors. Turn-driven, not tick-driven; no reversal guard. | roguelike (see `modules/grid-movement` in the backlog for snake / frogger / rpg) | **ABSENT**: no grid-movement module under [`src/modules/`](../../src/modules/). Consumer: roguelike@[`defs.ts`](../../examples/roguelike/src/defs.ts) (`GridPosDef`), [`rules.ts`](../../examples/roguelike/src/rules.ts) (`moveTo`, `actorAt`) — 2026-09-29. | **Kept local.** Evidence for the deferred `modules/grid-movement` entry's "fourth consumer" gate; its shape (cell + snap-to-centre + occupancy) matches the backlog's probable shape except step-on-tick and the reversal guard. |
| No way to keep entities out of a save — `world.toJSON()` serializes every registered store, so HUD text and the camera entity are written into the roguelike's save, and the example destroys and rebuilds its HUD after `loadJSON`. | roguelike, game-of-life (HUD rebuilt after load@[`main.ts:219`](../../examples/game-of-life/src/main.ts)) | **ABSENT**: [`world.ts:584`](../../src/world.ts) `toJSON()` iterates every component and tag registry with no entity filter. Consumer: roguelike@[`main.ts`](../../examples/roguelike/src/main.ts) (`adopt` destroys `hud`-tagged entities) — 2026-09-29. | **Kept local.** |
| 4-way A\* needs three overrides — `findPath` defaults to 8-way, and a 4-way grid has to pass `neighbors`, `cost` and `heuristic` together (the README's recipe) to stay admissible. | roguelike | **PRESENT (as recipe)**: [`pathfinding.ts:18`](../../src/modules/pathfinding/pathfinding.ts) `neighbors?` + `cost?` + `heuristic?`; no connectivity preset. Consumer: roguelike@[`ai.ts`](../../examples/roguelike/src/ai.ts) (`chase`) — 2026-09-29. | **Kept local.** Godot's `AStarGrid2D.diagonal_mode` is the familiar preset shape. |
| DEV `requires` warning depends on set order — setting `renderable` before `position` on a fresh entity (outside `spawn`) warns, and `transferEntities(…, componentNames)` copies in the listed order, so the roguelike lists `position` first. | roguelike | **PRESENT**: [`world.ts:494`](../../src/world.ts) validates on each `set` unless inside `spawn`; `RenderableDef.requires = ['position']`@[`renderable.ts:290`](../../src/modules/render-canvas2d/renderable.ts). Consumer: roguelike@[`main.ts`](../../examples/roguelike/src/main.ts) (`PLAYER_COMPONENTS`) — 2026-09-29. | **Kept local.** |
| Round-robin only — `TurnCycler` gives every actor exactly one turn per round; there is no speed / energy scheduling (a fast monster acting twice per player turn). | roguelike | **PRESENT (round-robin)**: [`turn-cycler.ts`](../../src/modules/turn-based/turn-cycler.ts) `advance()` moves the tag to the next controlled entity in insertion order. Consumer: roguelike@[`main.ts`](../../examples/roguelike/src/main.ts) (`runTurns`) — 2026-09-29. | **Kept local** (the example uses plain round-robin). Speed-based schedulers are standard in roguelike toolkits (rot.js `Scheduler.Speed`, libtcod's energy pattern). |
| Structural churn is expensive — a Life generation on a 160×100 board spawns and destroys ~1–2.5k cells, and the rules step costs ~55 ms (Chromium, trails on) early in a soup and ~10–20 ms once it thins; a CPU profile of the spawn/destroy path is dominated by per-component archetype moves and per-component `structuredClone`. | game-of-life | **PRESENT (cost)**: each component `set` / delete and each tag add / remove moves the entity one bucket@[`archetype-index.ts:73`](../../src/archetype-index.ts) (`moveEntity`, a `bigint`-keyed `Map` + `Set`), so a spawn walks one move per component; `_populateEntity` `structuredClone`s every template component with no override@[`world.ts:96`](../../src/world.ts). Consumer: game-of-life@[`systems.ts`](../../examples/game-of-life/src/systems.ts) (`rulesSystem`) — 2026-09-29. | **Kept local.** The example trims a cell to three components + a tag and turns dying cells into ghosts in place (`becomeGhost`) instead of destroy + spawn. Bevy and Flecs batch a spawn's components into one archetype move. |
| One spatial index for every positioned entity — `enableSpatial` indexes every `PositionDef` holder, so Life's HUD text and fading ghosts share the cells' index and every neighbour lookup filters by tag. | game-of-life | **PRESENT (all holders)**: `enableSpatial(def, structure)` subscribes to the whole store@[`world.ts:185`](../../src/world.ts); no tag/filter option. Consumer: game-of-life@[`defs.ts:101`](../../examples/game-of-life/src/defs.ts) (`cellAt` → `findFirstAt(x, y, isCell)`) — 2026-09-29. | **Kept local.** |
| Registering a list of component defs needs a cast — `for (const def of [PositionDef, AgeDef, …]) world.registerComponent(def)` does not typecheck (the union of `ComponentDef<T>` is not assignable to one `ComponentDef<T>`), so consumers cast or write one call per def. | roguelike, game-of-life | **PRESENT (generic, single def)**: `registerComponent<T>(def: ComponentDef<T>)`@[`world.ts:465`](../../src/world.ts). Consumers: roguelike@[`defs.ts:85`](../../examples/roguelike/src/defs.ts) (`as Parameters<…>[0]`), game-of-life@[`defs.ts:43`](../../examples/game-of-life/src/defs.ts) (one call per def) — 2026-09-29. | **Kept local.** |

## Related

- [extending-the-engine.md](../extending-the-engine.md) — the promotion
  rule-book (sliding-scale evidence rule; promote-vs-keep-local).
- [ecs-module-backlog.md](ecs-module-backlog.md) — where triaged gaps become
  module entries.
- [non-goals.md](non-goals.md) — where declined gaps land.
- [archived/audits/](../archived/audits/) — frozen closed rows, one file per
  triage pass.
