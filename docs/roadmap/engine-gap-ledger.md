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
the rest were grown incrementally.

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Entity-lifecycle / tag-change events. No reactive hook, so consumers walk every entity every frame to detect tag (zone) changes. | card-battler | **ABSENT (tags only)**: `LifecycleEvent`@[`lifecycle.ts:13`](../../src/lifecycle.ts) = `EntityCreated/Destroyed/ComponentAdded/ComponentRemoved` — **no `TagAdded/TagRemoved`**. A zone modeled as a *component* WOULD get a reactive hook; card-battler models zones as *tags*, which don't emit. | **Hold** — 1 consumer, speculative; no backlog entry yet. Cheaper workaround on record: model zones as components. |
| Composite / multi-drawable renderable. `Renderable` is one drawable per entity, so multi-part sprites (pipe pairs) are hand-drawn instead of using the renderer. | flappy | **ABSENT** (composite): `Renderable`@[`renderable.ts`](../../src/modules/render-canvas2d/renderable.ts) is a single discriminated union (one `kind` per entity); no multi-drawable form. | **Hold** — 1 consumer; `RenderableDef` V3 composite, no entry yet. |
| Zone/pile tag-move management — hand↔deck↔discard / stock↔waste tag swaps. | card-battler, solitaire | **ABSENT**: no helper; tag swaps hand-rolled. | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B10) |
| Drag-and-drop hit-testing (DOM + canvas) — reverse hit-test + legal-drop predicate. | card-battler, solitaire | **ABSENT**: no helper. | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B11) |
| Point-attractor / radial gravity force — accelerate every body toward a point with inverse-square falloff. | spacewar | **ABSENT** (as a primitive, 2026-06-09): grep of `src/modules/**` finds no force/attractor/gravity module; `makeKinematicsSystem` (platformer body solver) and `makeParticleSystem` bake in constant *downward* gravity only — neither is a reusable "attract toward point P". spacewar hand-rolls inverse-square accel toward the star @[`gravity.ts`](../../examples/spacewar/src/systems/gravity.ts). | **Hold** — 1 *radial* consumer. Constant-directional gravity is a trivial one-liner hand-rolled by flappy/jetpack/platformer-3d (`vel.vy += G*dt`) — related but **not** the same shape. Lunar Lander (#11 on the prototype ladder) likely adds a constant-gravity consumer. Speculative; no backlog entry yet. |
| Carried-rider adoption — `modules/attach`'s `inheritVelocity` / carrier path has **no confirmed adopter**, so the rider case the module was built for is unexercised. | frogger (original motivation) | **PRESENT (module)**: `AttachDef` + `inheritVelocity` + `makeAttachSystem`@[`attach/attach.ts`](../../src/modules/attach/attach.ts). **ABSENT (adoption)**: a grep of `examples/**` for `AttachDef` finds only asteroids@[`game.ts:131`](../../examples/asteroids/src/game.ts) and spacewar@[`game.ts:173`](../../examples/spacewar/src/game.ts) — both use `snapPosition`/`snapRotation`, i.e. the *follow* case. frogger imports nothing from `modules/attach`. | **Open — adoption.** Two consumers ship-but-don't-exercise the carrier half. Either migrate frogger's log/turtle rider, or record the carrier path as canon-only (no internal consumer) so the claim stops being implied. |
| 3D AABB body solver — gravity + per-axis **X→Z→Y** sweep with penetration push-out + a `Grounded` flag. The 2D `makeKinematicsSystem` resolves X→Y only, so 3D consumers re-implement the whole solver with the extra Z axis. | platformer-3d, portal, doom | **ABSENT (3D)** — dual-cited 2026-07-18: engine `makeKinematicsSystem`@`modules/kinematics` is 2D (catalog: "gravity → X-axis resolve → Y-axis resolve"). platformer-3d@[`kinematics3d.ts:23`](../../examples/platformer-3d/src/systems/kinematics3d.ts) (resolveAxis :61); portal@[`kinematics3d.ts:31`](../../examples/portal/src/systems/kinematics3d.ts) (resolveAxis :88, + cube one-way collider + portal-opening carve); doom@[`kinematics3d.ts`](../../examples/doom/src/systems/kinematics3d.ts) (same solver + a `STEP_HEIGHT` stair auto-climb + an `elevatorSystem` moving-platform rider-carry). | **Open — 3 consumers.** 3D sibling of `modules/kinematics`; un-defers the "3D siblings" backlog item with the transform-3d row. Relatedly `makeTriggerSystem`/`aabbVsAabb` are 2D too — portal's pressure-plate overlap ([`plate-door.ts`](../../examples/portal/src/systems/plate-door.ts)) also wants a 3D `ShapeAabb`. |
| 3D scene renderer + entity→mesh sync. No engine 3D renderer (only `render-canvas2d`/`render-dom`), so 3D consumers hand-roll a three.js scene **and** the per-frame `Map<EntityId, Mesh>` create/update/reap scaffold — the 3D analogue of what `Canvas2DRenderer` does for drawables. | platformer-3d, portal, doom, starfighter | **ABSENT (3D)** — dual-cited 2026-07-18: module tree ships `render-canvas2d`+`render-dom`, no 3D. platformer-3d@[`render.ts:59`](../../examples/platformer-3d/src/render.ts) (meshes Map + ensure/sync/reap :62-114); portal@[`render.ts:520`](../../examples/portal/src/render.ts) (same Map + syncTag/reapUntouched, plus portal see-through RTT); doom@[`render.ts`](../../examples/doom/src/render.ts) (same Map sync + billboard `THREE.Sprite` enemies, projectile spheres, a viewmodel); starfighter@[`render.ts:133`](../../examples/starfighter/src/render.ts) (same `ensureMesh`/`syncBodies`/`reapUntouched` Map for bullets + targets). | **Open — 4 consumers.** Reusable core = the entity↔mesh sync (create/update/reap by tag), not the whole three.js layer. |
| Pointer-lock relative mouse-look — capture the cursor and map `movementX/Y` to yaw (+ pitch) with sensitivity + pitch clamp. `modules/input` has Keyboard/Pointer/Gamepad providers + absolute `PointerState`, but no pointer-lock relative-look. | platformer-3d, portal, doom | **ABSENT** — dual-cited 2026-07-18: grep of `modules/input` finds no `movementX`/`pointerlock`/`yaw`. platformer-3d@[`main.ts:79`](../../examples/platformer-3d/src/main.ts) (requestPointerLock + `cameraYaw -= movementX*sens`, yaw only); portal@[`main.ts:111`](../../examples/portal/src/main.ts) (yaw **and** pitch + clamp); doom@[`main.ts`](../../examples/doom/src/main.ts) (yaw + pitch + clamp). | **Open — 3 consumers.** First-person/orbit look input; a new provider in `modules/input`. |
| Ray-vs-AABB raycast — slab-method ray/box test returning entry `t` + face axis (picking, hitscan, carry-clamp, line-of-sight). | portal, doom | **ABSENT** — 2026-07-18: `modules/collision` ships `aabbVsAabb`/`aabbVsAabbSwept`/`aabbVsCircle`/`circleVsCircle` only, no ray. portal hand-rolls `rayAabb`@[`portal-math.ts:63`](../../examples/portal/src/systems/portal-math.ts) (portal-gun aim + carry wall-clamp); doom copies it to [`math.ts`](../../examples/doom/src/systems/math.ts) for hitscan ([`weapon.ts`](../../examples/doom/src/systems/weapon.ts)) + enemy line-of-sight ([`ai.ts`](../../examples/doom/src/systems/ai.ts)). | **Open — 2 consumers.** Canon (picking/hitscan/LoS). A ray is a degenerate `aabbVsAabbSwept` (zero-size mover) → could extend that fn rather than add a new one. |
| 3D vector math — `cross`/`dot`/3D `normalize` for `{x,y,z}`, plus quaternion attitude (mul / axis-angle / rotate-vector). `modules/math` is scalar-only; `modules/motion` `normalize`/`scaleToSpeed` are `Vec2`; no quaternion type anywhere. | portal, starfighter (platformer-3d partial) | **ABSENT (3D)** — 2026-07-18/09-18: math is scalar (clamp/lerp/…), motion is `Vec2`, no quat. portal hand-rolls `cross`+`normalize`@[`portal-gun.ts:147`](../../examples/portal/src/systems/portal-gun.ts) for the portal tangent basis (+ inline dots in [`portal-math.ts`](../../examples/portal/src/systems/portal-math.ts)); starfighter hand-rolls a whole quaternion lib@[`quat.ts`](../../examples/starfighter/src/quat.ts) (`quatMul`/`quatFromAxisAngle`/`quatRotate`/`quatForward`) for its 3-axis attitude + inline dot for the boundary outward-velocity check; platformer-3d only needs `hypot` XZ-normalize@[`input.ts:42`](../../examples/platformer-3d/src/systems/input.ts). | **Open — 2 strong consumers.** `Vec3` siblings of the `Vec2` motion helpers + a `Quat`; `cross`/quaternion are the 3D-only additions. |
| Billboard sprite — a camera-facing textured quad for a 2D sprite in a 3D world (the Doom "2.5D" enemy look). | doom | **ABSENT** — 2026-07-18: no billboard helper; the 3D renderers are mesh-only. doom uses `THREE.Sprite` (auto-faces camera) per enemy in [`render.ts`](../../examples/doom/src/render.ts) (`alphaTest` for the transparent sprite bg). | **Open — 1 consumer.** three.js gives `Sprite` for free; the gap is an engine-level "billboard" render concept (the 2D renderers have no analogue). |
| Third-person chase-camera rig — a smoothed camera that **trails** a freely-oriented moving body at a body-relative offset (behind + above along the body's own forward/up) and **slerps its orientation** toward the body's so the view banks with roll. Distinct from platformer-3d's yaw-only *orbit* (no pitch, world-up) and doom/portal's first-person (camera *is* the body). | starfighter | **ABSENT** — 2026-09-18: no `modules/camera` 3D rig (camera module is 2D view-transform only); starfighter hand-rolls it in `updateShipAndCamera`@[`render.ts`](../../examples/starfighter/src/render.ts) (position `lerp` toward pos − forward·dist + up·height; `camera.quaternion.slerp` toward the ship quaternion). | **Open — 1 consumer.** 3D camera-rig family (chase/orbit/first-person share a follow core); speculative, no backlog entry yet. |
| Attitude-control flight model — a `Quat` orientation steered by *rate-based* angular velocity (aim-to-steer with a deadzone) + roll, throttle-only forward motion, and a spherical play-boundary. The `kinematics` solvers are gravity+ground AABB movers, not free-flight; there is no quaternion attitude anywhere in the engine. | starfighter | **ABSENT** — 2026-09-18: `modules/kinematics` bakes in downward gravity + a `Grounded` sweep; no quaternion/angular-velocity/attitude helper. starfighter hand-rolls it in `shipSystem`@[`ship.ts`](../../examples/starfighter/src/systems/ship.ts) (reticle deadzone → target angular velocity → eased integrate via `quatMul` → throttle → spherical bounds). | **Open — 1 consumer.** Space/flight-sim movement; speculative, no backlog entry yet. Pairs with the quaternion half of the 3D-vector-math row. |

## Related

- [extending-the-engine.md](../extending-the-engine.md) — the promotion
  rule-book (sliding-scale evidence rule; promote-vs-keep-local).
- [ecs-module-backlog.md](ecs-module-backlog.md) — where triaged gaps become
  module entries.
- [non-goals.md](non-goals.md) — where declined gaps land.
- [archived/audits/](../archived/audits/) — frozen closed rows, one file per
  triage pass.
