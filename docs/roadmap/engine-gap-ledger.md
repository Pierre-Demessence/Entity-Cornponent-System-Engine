# Engine Gap Ledger

Single source of truth for **engine gaps** surfaced while building the
[`examples/`](../../examples/). A gap is something `@pierre/ecs` *lacked*
that an example had to hand-roll locally, or an existing engine surface
that had to be extended before an example could be built. Recording every
gap here, in one place, gives the "how many consumers hit this?" question
a real answer.

This is the **raw** ledger. Deciding which gaps become engine
modules — and where — happens separately, in
[`ecs-module-backlog.md`](ecs-module-backlog.md), during a triage pass.

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
  touching the engine** — so the choice is governed by canon, not by
  whether a module already exists:
  - **Kept local (default).** You hand-rolled the missing piece in the
    example and touched nothing in the engine. Add it to the
    [open gaps](#open-gaps-awaiting-triage) table. This is the right call
    unless the capability is established canon.
  - **Promoted.** The capability was clearly canon (standard — the engine
    *ought* to have it), so you added a primitive or extended an existing
    module under the sliding-scale rule. Record it under
    [resolved during the build](#resolved--canon-promoted-during-the-build).
    Extending an existing module counts here too: it carries the **same
    bar** as adding a new one — "a module already exists" is not a licence
    to put a non-standard one-off into it.

### Gap triager — separate pass

Read the open gaps, group related ones, and apply the sliding-scale
promotion rule in [extending-the-engine.md](../extending-the-engine.md).
For each gap (or group): promote it into a
[`ecs-module-backlog.md`](ecs-module-backlog.md) entry, or reject it with
a recorded rationale. Update the gap's **Status** here when you do.

## Status vocabulary

- **Open** — recorded, kept local, not yet triaged.
- **Promoted** — triager moved it into `ecs-module-backlog.md` (or it
  shipped). Link the backlog entry / module.
- **Resolved** — the gap is closed: either a canon capability was
  promoted/extended during the build that surfaced it, *or* the
  capability already shipped and every listed consumer has since been
  migrated to it (migration tracked in
  [example-engine-gap-audit.md](../archived/example-engine-gap-audit.md)).
- **Rejected** — triager declined; rationale recorded.

## Verification provenance (read before trusting any row)

Every row carries a **Verified @ src** stamp: the exact `file@line` that
was opened to confirm the claim, plus whether the capability is `PRESENT`
or `ABSENT`. This exists because three earlier triage/report passes each
carried forward ~half-false claims — the failure mode was *inferring* a
gap from "an example hand-rolls X" without opening the engine source, then
laundering that inference into more confident downstream docs. The fix is
structural, not "verify harder":

- A row may only assert a gap with a source citation. **No citation → the
  claim is not trustworthy and must be re-verified before acting.**
- The stamp records the API **shape**, not just the capability name — e.g.
  "boundary clamps to `[0,width)` only, no inset", because the
  fit-determining detail lives in the signature, not in prose.
- **Adoption claims need TWO citations, not one.** An "X can adopt Y /
  X is a clean migration / N consumers fit" claim is a **join of two
  facts**: (1) the engine capability's shape, and (2) each consumer's
  *actual* usage. A stamp that points only at `src/modules/...` proves
  the capability exists, **not** that any consumer fits it. So every
  adopt/fit/clean-swap row must carry an engine `file@line` **and**, per
  named consumer, that example's `file@line`. This rule cost the 4th pass
  a re-do: it stamped only the engine side and still listed "flappy,
  jetpack **wrap**" as boundary adopters — opening their `systems.ts`
  showed size-aware clamps, not wrap (see B4). Capability-exists ≠
  consumer-fits.
- "ships-but-unadopted" (capability `PRESENT`, consumers hand-roll) is
  recorded distinctly from "genuinely missing" (`ABSENT`). The first is an
  **adoption** follow-up; only the second can justify a new module. And
  "ships-but-**module-private** / wrong-shape-to-adopt" (e.g. the pointer
  projector, B9) is a **Build**, not an adoption — verify the export
  surface, not just that the logic exists somewhere.
- Last exhaustive source-cited pass: **2026-07-15** (every row opened);
  boundary + pointer rows re-verified **dual-sided** (engine + consumer)
  the same day after the single-sided miss above.

## Gap tally (grouped by status)

One table per status, so the actionable rows (**Open**, **Promoted**)
sit at the top and the closed ones (**Resolved**, **Rejected**) don't
drown them. The **Consumers** column is the live tally that feeds the
[promotion rule](../extending-the-engine.md); **Verified @ src** is the
provenance stamp (see above). Rows tagged `(audit Bn)` came from the
one-time cross-sectional [examples audit](../archived/example-engine-gap-audit.md);
the rest were grown incrementally. (The two were a single table merged
2026-07-15 — there was no structural reason to keep them apart.)

### Open — recorded, not yet triaged

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| Entity-lifecycle / tag-change events. No reactive hook, so consumers walk every entity every frame to detect tag (zone) changes. | card-battler | **ABSENT (tags only)**: `LifecycleEvent`@[`lifecycle.ts:13`](../../src/lifecycle.ts) = `EntityCreated/Destroyed/ComponentAdded/ComponentRemoved` — **no `TagAdded/TagRemoved`**. A zone modeled as a *component* WOULD get a reactive hook; card-battler models zones as *tags*, which don't emit. | **Hold** — 1 consumer, speculative; no backlog entry yet. Cheaper workaround on record: model zones as components. |
| Composite / multi-drawable renderable. `Renderable` is one drawable per entity, so multi-part sprites (pipe pairs) are hand-drawn instead of using the renderer. | flappy | **ABSENT** (composite): `Renderable`@[`renderable.ts`](../../src/modules/render-canvas2d/renderable.ts) is a single discriminated union (one `kind` per entity); no multi-drawable form. | **Hold** — 1 consumer; `RenderableDef` V3 composite, no entry yet. |
| Pointer → canvas DPI coordinate transform — DPI-aware client→world mapping. | breakout, solitaire, tilemap | **PRESENT but not adoptable as-is — dual-cited 2026-07-15.** Engine: the projection ships only as the **module-private** `defaultProject`@[`input/pointer-provider.ts:140`](../../src/modules/input/pointer-provider.ts); `PointerProvider` is a stateful, tick-read `InputProvider`, not a pure fn. Consumers project at **event-time**: breakout@[`main.ts:103`](../../examples/breakout/src/main.ts) + solitaire@[`main.ts:146`](../../examples/solitaire/src/main.ts) replicate `defaultProject` exactly; tilemap@[`main.ts:119`](../../examples/tilemap/src/main.ts) is viewport-drag (custom project); space-invaders@[`main.ts:115`](../../examples/space-invaders/src/main.ts) is no-DPI half-screen. | **RESOLVED.** Promoted `defaultProject` to an exported pure `projectPointer(ev, target)`; breakout + solitaire dropped their event-time copies. tilemap/space-invaders don't fit (custom / no-DPI), as noted. (audit B9) |
| Zone/pile tag-move management — hand↔deck↔discard / stock↔waste tag swaps. | card-battler, solitaire | **ABSENT**: no helper; tag swaps hand-rolled. | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B10) |
| Drag-and-drop hit-testing (DOM + canvas) — reverse hit-test + legal-drop predicate. | card-battler, solitaire | **ABSENT**: no helper. | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B11) |
| Two-player local input mapping — per-player `InputState` + key routing. | local-pong, spacewar | **PRESENT** (building block) — **dual-cited 2026-06-09.** Engine: `createInput`@[`input/input-state.ts:40`](../../src/modules/input/input-state.ts) — N instances route N players; only a player-slot *abstraction* is missing. Consumers: local-pong (two `createInput`s); spacewar builds `player1Input`/`player2Input`/`metaInput` via three `createInput`s @[`main.ts`](../../examples/spacewar/src/main.ts) and hand-rolls the slot abstraction — `PlayerSlot = 1\|2` + parallel `Record<PlayerSlot,…>` for inputs/scores/shipIds + `Ship1Tag`/`Ship2Tag` @[`game.ts`](../../examples/spacewar/src/game.ts). | **2 consumers now.** Two `createInput`s already work (adoption); slot abstraction → backlog local-multiplayer player-slot (speculative). (audit B19) |
| Point-attractor / radial gravity force — accelerate every body toward a point with inverse-square falloff. | spacewar | **ABSENT** (as a primitive, 2026-06-09): grep of `src/modules/**` finds no force/attractor/gravity module; `makeKinematicsSystem` (platformer body solver) and `makeParticleSystem` bake in constant *downward* gravity only — neither is a reusable "attract toward point P". spacewar hand-rolls inverse-square accel toward the star @[`gravity.ts`](../../examples/spacewar/src/systems/gravity.ts). | **Hold** — 1 *radial* consumer. Constant-directional gravity is a trivial one-liner hand-rolled by flappy/jetpack/platformer-3d (`vel.vy += G*dt`) — related but **not** the same shape. Lunar Lander (#11) likely adds a constant-gravity consumer. Speculative; no backlog entry yet. |
| 3D AABB body solver — gravity + per-axis **X→Z→Y** sweep with penetration push-out + a `Grounded` flag. The 2D `makeKinematicsSystem` resolves X→Y only, so 3D consumers re-implement the whole solver with the extra Z axis. | platformer-3d, portal, doom | **ABSENT (3D)** — dual-cited 2026-07-18: engine `makeKinematicsSystem`@`modules/kinematics` is 2D (catalog: "gravity → X-axis resolve → Y-axis resolve"). platformer-3d@[`kinematics3d.ts:23`](../../examples/platformer-3d/src/systems/kinematics3d.ts) (resolveAxis :61); portal@[`kinematics3d.ts:31`](../../examples/portal/src/systems/kinematics3d.ts) (resolveAxis :88, + cube one-way collider + portal-opening carve); doom@[`kinematics3d.ts`](../../examples/doom/src/systems/kinematics3d.ts) (same solver + a `STEP_HEIGHT` stair auto-climb + an `elevatorSystem` moving-platform rider-carry). | **Open — 3 consumers.** 3D sibling of `modules/kinematics`; un-defers the "3D siblings" backlog item with the transform-3d row. Relatedly `makeTriggerSystem`/`aabbVsAabb` are 2D too — portal's pressure-plate overlap ([`plate-door.ts`](../../examples/portal/src/systems/plate-door.ts)) also wants a 3D `ShapeAabb`. |
| 3D scene renderer + entity→mesh sync. No engine 3D renderer (only `render-canvas2d`/`render-dom`), so 3D consumers hand-roll a three.js scene **and** the per-frame `Map<EntityId, Mesh>` create/update/reap scaffold — the 3D analogue of what `Canvas2DRenderer` does for drawables. | platformer-3d, portal, doom | **ABSENT (3D)** — dual-cited 2026-07-18: module tree ships `render-canvas2d`+`render-dom`, no 3D. platformer-3d@[`render.ts:59`](../../examples/platformer-3d/src/render.ts) (meshes Map + ensure/sync/reap :62-114); portal@[`render.ts:520`](../../examples/portal/src/render.ts) (same Map + syncTag/reapUntouched, plus portal see-through RTT); doom@[`render.ts`](../../examples/doom/src/render.ts) (same Map sync + billboard `THREE.Sprite` enemies, projectile spheres, a viewmodel). | **Open — 3 consumers.** Reusable core = the entity↔mesh sync (create/update/reap by tag), not the whole three.js layer. |
| Pointer-lock relative mouse-look — capture the cursor and map `movementX/Y` to yaw (+ pitch) with sensitivity + pitch clamp. `modules/input` has Keyboard/Pointer/Gamepad providers + absolute `PointerState`, but no pointer-lock relative-look. | platformer-3d, portal, doom | **ABSENT** — dual-cited 2026-07-18: grep of `modules/input` finds no `movementX`/`pointerlock`/`yaw`. platformer-3d@[`main.ts:79`](../../examples/platformer-3d/src/main.ts) (requestPointerLock + `cameraYaw -= movementX*sens`, yaw only); portal@[`main.ts:111`](../../examples/portal/src/main.ts) (yaw **and** pitch + clamp); doom@[`main.ts`](../../examples/doom/src/main.ts) (yaw + pitch + clamp). | **Open — 3 consumers.** First-person/orbit look input; a new provider in `modules/input`. |
| Ray-vs-AABB raycast — slab-method ray/box test returning entry `t` + face axis (picking, hitscan, carry-clamp, line-of-sight). | portal, doom | **ABSENT** — 2026-07-18: `modules/collision` ships `aabbVsAabb`/`aabbVsAabbSwept`/`aabbVsCircle`/`circleVsCircle` only, no ray. portal hand-rolls `rayAabb`@[`portal-math.ts:63`](../../examples/portal/src/systems/portal-math.ts) (portal-gun aim + carry wall-clamp); doom copies it to [`math.ts`](../../examples/doom/src/systems/math.ts) for hitscan ([`weapon.ts`](../../examples/doom/src/systems/weapon.ts)) + enemy line-of-sight ([`ai.ts`](../../examples/doom/src/systems/ai.ts)). | **Open — 2 consumers.** Canon (picking/hitscan/LoS). A ray is a degenerate `aabbVsAabbSwept` (zero-size mover) → could extend that fn rather than add a new one. |
| 3D vector math — `cross`/`dot`/3D `normalize` for `{x,y,z}`. `modules/math` is scalar-only; `modules/motion` `normalize`/`scaleToSpeed` are `Vec2`. | portal (platformer-3d partial) | **ABSENT (3D)** — 2026-07-18: math is scalar (clamp/lerp/…), motion is `Vec2`. portal hand-rolls `cross`+`normalize`@[`portal-gun.ts:147`](../../examples/portal/src/systems/portal-gun.ts) for the portal tangent basis (+ inline dots in [`portal-math.ts`](../../examples/portal/src/systems/portal-math.ts)); platformer-3d only needs `hypot` XZ-normalize@[`input.ts:42`](../../examples/platformer-3d/src/systems/input.ts). | **Open — 1 strong consumer.** `Vec3` siblings of the `Vec2` motion helpers; `cross` is the 3D-only addition. |
| Kill-plane / out-of-bounds respawn — relocate an entity to its spawn when it falls past a Y threshold. | portal, doom | **ABSENT** (trivial) — 2026-07-18: both check `y < RESPAWN_Y` → respawn in the tick runner's `onBeforeFlush` (portal@[`main.ts`](../../examples/portal/src/main.ts), doom@[`main.ts`](../../examples/doom/src/main.ts)). | **Open — 2 consumers, trivial.** Like constant-gravity, a one-liner; recorded for the tally — likely content, not engine. |
| Billboard sprite — a camera-facing textured quad for a 2D sprite in a 3D world (the Doom "2.5D" enemy look). | doom | **ABSENT** — 2026-07-18: no billboard helper; the 3D renderers are mesh-only. doom uses `THREE.Sprite` (auto-faces camera) per enemy in [`render.ts`](../../examples/doom/src/render.ts) (`alphaTest` for the transparent sprite bg). | **Open — 1 consumer.** three.js gives `Sprite` for free; the gap is an engine-level "billboard" render concept (the 2D renderers have no analogue). |
| Pickup / collectible-on-overlap — touch an entity to apply an effect (heal / ammo) then despawn. | doom | **ABSENT** — 2026-07-18: no `modules/pickup`; doom hand-rolls overlap→apply→`queueDestroy` in [`pickup.ts`](../../examples/doom/src/systems/pickup.ts). Composes `collision` overlap + a despawn, but the "apply effect on touch" shape is unhoused. | **Open — 1 consumer.** platformer also has pickups (unverified here); recurs broadly. Candidate `modules/pickup`. |

### Promoted — moved into the backlog (or shipping)

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| Continuous coordinates → grid-cell projection. `HashGrid2D` keys on integer cells, so consumers hand-roll `cellOf(x,y)` + grid-sync (`onMove`/`indexStatic`) boilerplate. | asteroids, platformer, top-down-shooter | **RESOLVED.** Shipped `ContinuousHashGrid2D`@[`continuous-hash-grid-2d.ts`](../../src/modules/spatial/continuous-hash-grid-2d.ts) — accepts continuous world-space positions and projects to integer cells internally via `cellOfPoint`. All 3 consumers migrated off their local `cellOf` wrappers and manual `grid.add(cellOf(x,y).x, ...)` calls. Platformer keeps `cellsForAabb` for multi-cell AABB indexing via the underlying `.grid`. |
| Sprite renderer ignores GID flip/rotation bits. Consumers unpack flip bits from the GID but the renderer doesn't apply them, so flipped tiles render unflipped. | tilemap, rpg | **RESOLVED 2026-06-07.** Added `flipH`/`flipV` to `Renderable` sprite variant + flip transform in `Canvas2DRenderer` sprite draw path (`ctx2d.save/translate/scale/restore`). Tilemap example wired `TmxLayer.flags` → `Renderable.flipH`/`flipV`. RPG already handles all 8 orientations via its `tileTransform` rotation+scale approach (including diagonal). | **Done.** `flipH`/`flipV` covers H/V (the common case); D (diagonal transpose) remains via rotation+scale. |
| Carried / attached moving-platform rider kinematics. No engine parenting/attachment, so a rider that should inherit a moving platform's velocity per tick (frog on a log/turtle) hand-adds the platform's `vx * dt` to its own position each frame. | frogger, doom | **ABSENT**: no `modules/attach` in the module tree (doom's `elevatorSystem` hand-carries the player riding a vertical platform — [`elevator.ts`](../../examples/doom/src/systems/elevator.ts)). | → backlog NEW `modules/attach` (follow/carrier). With the B12 follower row = 3 consumers → un-declines the hierarchy item in lighter form. Would also serve one-way platforms / conveyor belts. |
| 3D transform components. `PositionDef` / `VelocityDef` / `GroundedDef` are 2D-only; 3D consumers redefine them locally. | platformer-3d, portal, doom | **ABSENT** — dual-cited 2026-07-18: `transform` ships 2D only; a future `transform-3d` with `Position3D` is only a README aspiration@[`transform/README.md:43`](../../src/modules/transform/README.md). platformer-3d@[`components.ts:5`](../../examples/platformer-3d/src/components.ts); portal@[`components.ts:11`](../../examples/portal/src/components.ts) (Position3D/Velocity3D/ShapeAabb3D/Grounded); doom@[`components.ts`](../../examples/doom/src/components.ts). | **Defer → backlog "3D siblings (speculative)" — now 3 consumers** (was 1), strengthening the un-defer case. |
| 3D spatial structure (`HashGrid3D`). No 3D broadphase, so consumers brute-force collision checks. | platformer-3d | **ABSENT**: `spatial/` ships `HashGrid2D` only. | **Defer** → backlog "3D siblings (speculative)". (portal is a 2nd 3D consumer but did **not** hit this wall — one small room, a handful of statics, brute-force is fine — so it is deliberately **not** added here.) |
| Off-screen / boundary recycling & culling — despawn-or-wrap entities that leave a region; cull off-screen entities from update/render. | flappy, jetpack, asteroids, frogger (custom span-wrap), top-down-shooter, tilemap (cull) | **wrap/clamp capability PRESENT** (`applyBoundary`@[`motion/motion.ts`](../../src/modules/motion/motion.ts), `boundary:{mode}`) — note only asteroids/top-down-shooter actually *adopt* it; frogger hand-rolls a span-recycle (see boundary row); **despawn** trivial (`lifetime` + `queueDestroy`); **render cull ABSENT** (viewport reserved for `camera`, README:178). | **Split.** Genuine gap = **cull off-screen from render**. **RESOLVED 2026-07-18** — `modules/camera` V2 shipped the renderer `view` transform + view-rect cull (`Canvas2DRenderContext.view`); rpg + tilemap migrated. (audit B1) |
| Spawn timer / cadence with difficulty ramp — "emit an entity every T ms, where T lerps with difficulty." | flappy, jetpack, space-invaders, top-down-shooter | **RESOLVED 2026-07-17**: shipped `modules/spawner`@[`spawner/spawner.ts`](../../src/modules/spawner/spawner.ts) (`makeSpawner`/`tickSpawner`/`resetSpawner`) as the repeating sibling of `Timer`. | **Done.** Value-object `Spawner` with a per-interval provider callback (ramp+jitter live off game state) + optional `active` gate. All 4 consumers migrated; jetpack's `bulletTimerMs`/`spawnTimerMs` (re-homed from B3) landed here. (audit B2) |
| Cooldown / debounce / grace timer — a `CooldownDef` + auto-decrement system covering fire-rate AND invulnerability i-frames. | asteroids (fire), top-down-shooter (fire), jetpack (bullet), space-invaders (invuln) | **RESOLVED 2026-07-16** — shipped `modules/timer` (Bevy-style `Timer` value primitive: once/repeating, `tickTimer`/`finished`/`fraction`/`restart`@[`timer/timer.ts`](../../src/modules/timer/timer.ts)) + `modules/cooldown` (`CooldownDef` + `makeCooldownSystem` + `ready`/`trigger`@[`cooldown/cooldown.ts`](../../src/modules/cooldown/cooldown.ts)). `modules/lifetime` refactored onto `Timer` (`Lifetime = Timer`). | **Shape correction vs. original audit.** Cooldown shipped as a **per-entity `CooldownDef` component**, NOT a GameState scalar (cites lifetime's component precedent — same-author bias acknowledged). 3 adopters, all **poll-`ready()`/`trigger()` once-mode**: asteroids fire@[`input.ts`](../../examples/asteroids/src/systems/input.ts), top-down-shooter fire@[`input.ts`](../../examples/top-down-shooter/src/systems/input.ts), space-invaders i-frames@[`systems.ts`](../../examples/space-invaders/src/systems.ts). jetpack's `bulletTimerMs` is a **repeating auto-emitter** (interval fire while thrusting), not a poll/trigger gate → it's spawner shape, **moved to the B2 spawner row**. (audit B3) |
| Boundary clamp / wrap — constrain an entity to a region (clamp/wrap position + zero velocity on breach). | flappy, jetpack, frogger, local-pong, space-invaders (+ asteroids, top-down-shooter adopted) | **PARTIAL — dual-cited 2026-07-15.** Engine: `boundary:{mode}` pins the origin to `[0,width)` only (`makeVelocityIntegrationSystem`@[`motion.ts:56`](../../src/modules/motion/motion.ts), clamp branch @:51; `Bounds={width,height}`@:7 — no inset/size). Consumers (opened): **adopt** = asteroids@[`main.ts:43`](../../examples/asteroids/src/main.ts) (wrap), top-down-shooter@[`main.ts:164`](../../examples/top-down-shooter/src/main.ts) (clamp). **Size/span-aware, can't adopt** = flappy@[`systems.ts:113`](../../examples/flappy/src/systems.ts) (±BIRD_R), jetpack@[`systems.ts:122`](../../examples/jetpack/src/systems.ts) (CEIL/FLOOR−PLAYER_H), frogger@[`systems.ts:118`](../../examples/frogger/src/systems.ts) (±span recycle, **not** an origin wrap), local-pong@[`systems.ts:89`](../../examples/local-pong/src/systems.ts) (margin+size), space-invaders@[`systems.ts:65`](../../examples/space-invaders/src/systems.ts) (SIDE_MARGIN+PLAYER_W). | **Resolved-adopt + Build.** The 2 full-playfield games already adopt; the other 5 are the **inset Build** (backlog `modules/motion` boundary inset). **No clean adoption left.** The earlier "adopt flappy/jetpack **wrap**" was a *single-sided* (engine-only) claim — opening the consumers shows size-aware clamps, not wrap. **RESOLVED 2026-07-18** — reshaped into `modules/math` (a bare `clamp`, not a boundary-inset extension): no size-aware clamper routed its clamp through the integrator, so all migrated to the new `clamp` helper. (audit B4) |
| Discrete grid/tile movement & snapping — step-on-tick, snap-to-cell, occupancy query, 180°-reversal guard. | snake, frogger, rpg | **Deferred — too game-specific.** Snake has body-shift + reversal guard + spatial occupancy; frogger has row-based hopping + water/road semantics; RPG uses free pixel movement with walkability checks (not grid-based). No clean shared primitive across the three. (audit B7) |
| Particle system / radial burst — each consumer hand-rolls `spawnParticle` + radial `burst()`. | frogger, jetpack, space-invaders | **RESOLVED 2026-07-18**: shipped `modules/particles` (`burst` + `makeParticleSystem` + `ParticleEmitterDef`). | **Done.** 3 hand-rollers migrated to `burst`; asteroids adopted a rock-kill burst. (Earlier note said 4 consumers incl. asteroids — asteroids had no particles; corrected to 3 + 1 adopter.) (audit B8) |
| Child/parent follower transform sync — "entity B tracks entity A's pos/rot each frame." | asteroids (thrust flame), space-invaders | **RESOLVED.** Shipped `modules/attach` — `AttachDef` with `snapPosition` + `snapRotation` flags. Asteroids thrust-flame migrated: position/rotation sync delegated to `makeAttachSystem`, flame system simplified to opacity toggle only. Space-invaders had no active attach pattern (aspirational gap). (audit B12) |
| Tilemap → entity auto-spawn + collision-layer derivation. `tmx` parses but examples instantiate entities and derive walkability by hand. | rpg, tilemap | **Split**: parse **PRESENT** (`modules/tmx`); auto-spawn/collision-layer **ABSENT** (no `modules/tilemap`). | **Trigger met (2 authored-tile-grid consumers).** → backlog `modules/tilemap` (auto-spawn + collision-layer). (audit B15) |
| Steering / seek AI — constant-speed seek; no separation/pathfinding. | top-down-shooter, card-battler (intent), doom | **ABSENT** (seek): no `modules/ai`. NB `modules/pathfinding` exists but is route-finding (A*), not constant-speed steering. doom gates seek on a continuous-`rayAabb` line-of-sight check ([`ai.ts`](../../examples/doom/src/systems/ai.ts)). | **Defer** → backlog `modules/ai` (speculative; record 3 now — rule-of-three met, though shapes vary: swarm-seek vs LoS-gated wake). (audit B17) |
| Sprite animation state machine — idle→walk→attack frame cycling. | rpg | **RESOLVED 2026-06-07.** Shipped `modules/animation` (`SpriteAnimation` value primitive + `SpriteAnimationDef` ECS component + `makeSpriteAnimationSystem`@[`animation/sprite-animation.ts`](../../src/modules/animation/sprite-animation.ts)). RPG migrated to 4-directional walk animation using the tiny-16-basic character sheet. | **Done.** A clip registry (named animations shared across entities) is deferred V2. (audit B18) |
| Rhythm timing stack — audio-clock `TickSource`, hit-window judgement, lookahead/absolute-time spawn, timestamped input queue, latency comp. | rhythm | **ABSENT**: no `modules/rhythm`. | **Defer** → backlog NEW speculative `modules/rhythm`. Genre-specific but real & cleanly built. (audit B21) |
| App-host mount/unmount contract — `start(container) => Teardown`, lazy-load race guard, mount→cleanup→async-load→teardown orchestration. | hub (every example re-implements `start`/teardown) | **ABSENT**: no app-host helper module. | **Defer** → backlog NEW speculative app-host helper. Low priority. (audit hub note) |

### Resolved — capability ships and consumers adopted it

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| World-level `reset()` / `clear()`. Consumers hand-drain every store (and the spatial grid) via `[...store.keys()].forEach(queueDestroy)`. | asteroids, platformer, snake | **PRESENT + adopted**: `clearAll()`@[`world.ts:103`](../../src/world.ts) (the API is `clearAll()`, **not** `reset()`); every example already calls it. The `queueDestroy` loops that remain are legitimate per-entity culling, which `clearAll`'s own docs direct callers to do separately. | **Phantom corrected 2026-07-15** — prior rows claimed "ships as `world.reset()`, adoption pending". Wrong name + already adopted → nothing to migrate. |
| Component serialize/deserialize boilerplate for components that are never persisted — dead pass-through code required by the store API. | asteroids, snake | **PRESENT**: `simpleComponent`@[`component-store.ts:335`](../../src/component-store.ts) (`registryComponent`@:380). Both consumers already use it ([rock-tier.ts](../../examples/asteroids/src/components/rock-tier.ts), [direction.ts](../../examples/snake/src/components/direction.ts)). | Stale gap — capability shipped + adopted. |
| Circle-vs-AABB collision helper. Consumers hand-write `circleVsRect`. | flappy, breakout | **PRESENT**: `aabbVsCircle`@[`collision/narrowphase.ts:41`](../../src/modules/collision/narrowphase.ts). | **Test resolved** (the push-out *response* lives in the bounce row above). flappy migrated to `aabbVsCircle` (`b5a253e`); breakout still hand-rolls because it fuses the *test* with a push-out *response* — that response is the separate Promoted bounce row. See [audit](../archived/example-engine-gap-audit.md) A1. |
| AABB-vs-AABB overlap test. Consumers hand-write the rect-vs-rect overlap predicate. | jetpack, space-invaders, frogger, local-pong | **PRESENT**: `aabbVsAabb`@[`collision/narrowphase.ts:25`](../../src/modules/collision/narrowphase.ts) (+ `aabbVsAabbSwept`@:88, `circleVsCircle`@:33). All 4 consumers migrated (`b5a253e`). | space-invaders runs it across rockets×aliens/bombs/bunkers/mothership; frogger for the frog vs same-row cars. See [audit](../archived/example-engine-gap-audit.md) A1. |
| Timed-lifetime (TTL) entities. Consumers hand-roll an `ageMs`/`lifeMs` component + reaper. | jetpack, space-invaders, frogger, top-down-shooter | **PRESENT**: `LifetimeDef`@[`lifetime/lifetime.ts:7`](../../src/modules/lifetime/lifetime.ts) + `makeLifetimeSystem`@:27. jetpack/space-invaders/frogger migrated (`b5a253e`); top-down-shooter already used it. | Recurs anywhere there are particles/projectiles. See [audit](../archived/example-engine-gap-audit.md) A2. |
| DOM renderer. No engine DOM-renderer, so consumers write entity↔DOM mapping + orphan cleanup + zone tag management by hand. | card-battler | **PRESENT**: `modules/render-dom/` exists in the module tree (V1, 2026-04-23). | Covers entity↔DOM mapping + orphan cleanup + zone tags. |
| Fisher–Yates shuffle + random-pick. Pure, domain-neutral utility. | card-battler, solitaire, snake | **PRESENT + adopted**: `modules/rng` ships `shuffle`/`pick`/`randomInt`/`makeSeededRng`@[`rng/rng.ts`](../../src/modules/rng/rng.ts). All 3 migrated: card-battler@[`game.ts`](../../examples/card-battler/src/game.ts) (`shuffle`+`pick`), solitaire@[`game.ts`](../../examples/solitaire/src/game.ts) (`shuffle`) + [`main.ts`](../../examples/solitaire/src/main.ts) (`pick`), snake@[`game.ts`](../../examples/snake/src/game.ts) (`pick`). | **Shipped 2026-07-15** (Local→Engine migration #2). The seedable `makeSeededRng` (mulberry32) enables deterministic tests/replays. (audit B6) |
| Velocity normalize / set-speed-in-direction — `hypot` rescale to a target magnitude. | breakout, top-down-shooter | **PRESENT + adopted**: `modules/motion` ships `normalize` + `scaleToSpeed`@[`motion/vec.ts`](../../src/modules/motion/vec.ts). Migrated: breakout `setBallSpeed`@[`systems.ts:27`](../../examples/breakout/src/systems.ts), top-down-shooter player-move@[`input.ts:44`](../../examples/top-down-shooter/src/systems/input.ts) + enemy-steer@[`enemy-steer.ts:33`](../../examples/top-down-shooter/src/systems/enemy-steer.ts) (keeps its `<1e-3` close-guard, then `scaleToSpeed`). | **Shipped 2026-07-15** (Local→Engine migration #5). Zero-length input → `{0,0}` (no `NaN`). (audit B13) |
| `modules/tmx` | rpg | Parser only handled base64+zlib layers, inline tilesets, no flip flags → added CSV layer encoding, external `.tsx` tileset sources, and per-tile flip-flag unpacking. All standard TMX. | Resolved (`bb4072b`). |
| `modules/input` | top-down-shooter | Digital action-only, no pointer → shipped `PointerProvider` for continuous mouse position + button-hold state. | Resolved. |
| `PointerProvider` | card-battler | Lacked viewport-relative coordinates → added `clientX` / `clientY` fields for target-local hit-testing. | Resolved. |
| Collision bounce/reflection response. Engine has no helper to resolve a circle-vs-AABB overlap into a corrected position + reflected velocity, so consumers hand-roll axis-of-least-penetration reflection. | breakout, local-pong, frogger (partial) | **RESOLVED 2026-06-06.** Shipped `reflect(v, normal)` + `bounceOffAabb(mover, vel, obstacle)`@[`narrowphase.ts`](../../src/modules/collision/narrowphase.ts) — pure vector reflection + AABB overlap resolver with MTV push-out. Migrated breakout brick collision off its hand-rolled centre-distance overlap. local-pong wall bounce uses `Math.abs` (simplest for axis-aligned walls); frogger doesn't bounce. (audit B5) |
| Renderer doesn't consume a camera/view transform. `Canvas2DRenderer` draws entities in raw world coords, so a scrolling/zooming world hand-writes `ctx2d.translate(...)` even when a `CameraDef` already exists. | rpg, tilemap | **RESOLVED.** Shipped `Canvas2DRenderContext.view` transform + view-rect cull@[`canvas2d-renderer.ts`](../../src/modules/render-canvas2d/canvas2d-renderer.ts), decoupled from `modules/camera` (consumes plain `{x,y,zoom?}`; bridge via `cameraToView`). Migrated rpg (smooth follow + map limits) and tilemap (pan/zoom). See [audit](../archived/example-engine-gap-audit.md) A5. |
| Renderer can't express non-entity decorations, text, or screen-space overlays. Static chrome (court net, borders), score/HUD text, and full-screen overlays (game-over panels) are hand-drawn with raw `ctx2d`. | local-pong, snake | **RESOLVED 2026-06-06.** Shipped `ScreenSpaceDef`@[`screen-space.ts`](../../src/modules/render-canvas2d/screen-space.ts) — boolean tag that marks entities for screen-pixel rendering. `Canvas2DRenderer` gained a two-pass loop: world pass (through camera) then overlay pass (pixel coords, sorted by `RenderOrderDef`). Migrated local-pong to `RenderableDef` for game entities; snake can't cleanly adopt (grid-coord `PositionDef` conflicts with pixel-space renderer). See [audit](../archived/example-engine-gap-audit.md) A7. |

### Rejected — declined (not engine surface)

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| Scoring / lives / game-over scaffold. | nearly all | **n/a** — declined as content, not engine (per-game). | → backlog Non-goals (declined). (audit B14) |

## Related

- [extending-the-engine.md](../extending-the-engine.md) — the promotion
  rule-book (sliding-scale evidence rule; promote-vs-keep-local).
- [ecs-module-backlog.md](ecs-module-backlog.md) — where triaged gaps
  become module entries.
