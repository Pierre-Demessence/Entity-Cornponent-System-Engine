# Incremental triage — closed rows (2026-09-22)

Rows closed outside a full cross-sectional pass: the `examples/rpg` dialogue
gap (promoted), and two trivial 2026-07-18 rows (rejected). None became a live
row in the [engine gap ledger](../../roadmap/engine-gap-ledger.md) — recorded
here instead, per that file's "record it in the dated audit file for the
current pass" rule.

Roles, status vocabulary, and the verification-provenance rule live in the
live inbox. The larger closed set from the cross-sectional pass is frozen in
[2026-09-21-example-gap-audit.md](2026-09-21-example-gap-audit.md).

## Promoted — moved into the backlog

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Dialogue presentation + runner seam — show a box one line at a time, advance/close, and lock gameplay input while open. No engine surface exists, so the consumer hand-rolls a DOM presenter and drives it from the tick loop; there is no interface for a script format or a runner to plug into. | rpg | **ABSENT** — 2026-09-22: the module tree ships no dialogue/presenter surface (nearest neighbours `render-dom`, `scene-transition`, `turn-based`). rpg hand-rolls `DialogueBox`@[`dialogue.ts:6`](../../../examples/rpg/src/dialogue.ts) (`start(name, lines)` / `advance()` / `open`) driven by a flat per-NPC line array `NpcDialogue { name; dialog: string[]; gid }`@[`characters.ts:63`](../../../examples/rpg/src/characters.ts). | **Promoted → backlog `modules/dialogue` (speculative).** Scoped to the presenter + runner *seam* only; the narrative language, script format and VM stay app-side. Not yet buildable: no consumer exercises `choices` or world-gated lines, so the step model is unvalidated, and the cited canon is one verified runtime (inkjs) plus one authoring-pipeline precedent (Yarn) — short of the ≥3-engine unanimity that promotes on canon alone. |

## Rejected — declined, not engine surface

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Kill-plane / out-of-bounds respawn — relocate an entity to its spawn when it falls past a Y threshold. | portal, doom | **ABSENT** (trivial) — 2026-07-18: both check `y < RESPAWN_Y` → respawn in the tick runner's `onBeforeFlush` (portal@[`main.ts`](../../../examples/portal/src/main.ts), doom@[`main.ts`](../../../examples/doom/src/main.ts)). | **Rejected → [non-goals.md](../../roadmap/non-goals.md) (declined).** Content, not engine — a one-liner over `transform` + `queueDestroy`, with no reusable shape to extract. |
| Pickup / collectible-on-overlap — touch an entity to apply an effect (heal / ammo) then despawn. | doom, platformer | **PRESENT (composed) — verified 2026-09-22:** platformer already builds it from the shipped trigger system — `makeTriggerSystem` with an `onOverlap` that emits `CoinCollected`@[`pickup.ts:20`](../../../examples/platformer/src/systems/pickup.ts). doom hand-rolls the same overlap → apply → `queueDestroy` flow@[`pickup.ts`](../../../examples/doom/src/systems/pickup.ts). | **Rejected → [non-goals.md](../../roadmap/non-goals.md) (declined).** The 2026-07-18 note guessed "platformer also has pickups (unverified here)" — verified here, and it is the **adoption** case, not a missing module. Follow-up: migrate doom onto `makeTriggerSystem`. |

## Promoted — ledger sweep (2026-09-22)

The same triage pass gave backlog homes to gaps the ledger had been holding
undecided, so these twelve rows left the live inbox. The stamps are the ones
the rows carried (verified 2026-07-18 and 2026-09-18); no re-verification was
performed in this sweep.

| Gap (symptom) | Consumers | Verified @ src | Home |
|---|---|---|---|
| Composite / multi-drawable renderable — `Renderable` is one drawable per entity, so multi-part sprites (pipe pairs) are hand-drawn. | flappy | **ABSENT** (composite): `Renderable`@`src/modules/render-canvas2d/renderable.ts` is a single discriminated union, one `kind` per entity. | `RenderableDef` extensions V3 |
| Zone/pile tag-move management — hand↔deck↔discard / stock↔waste tag swaps. | card-battler, solitaire | **ABSENT**: no helper; tag swaps hand-rolled. (audit B10) | `modules/card-interaction` |
| Drag-and-drop hit-testing (DOM + canvas) — reverse hit-test + legal-drop predicate. | card-battler, solitaire | **ABSENT**: no helper. (audit B11) | `modules/card-interaction` |
| Point-attractor / radial gravity — accelerate every body toward a point with inverse-square falloff. | spacewar | **ABSENT**: no force/attractor primitive; `makeKinematicsSystem` and `makeParticleSystem` bake in constant *downward* gravity only. spacewar hand-rolls it@`examples/spacewar/src/systems/gravity.ts`. | `modules/motion` V2 |
| 3D AABB body solver — gravity + per-axis X→Z→Y sweep + `Grounded`. | platformer-3d, portal, doom | **ABSENT (3D)**: `makeKinematicsSystem` is 2D. `kinematics3d.ts` in each consumer. | 3D group `modules/kinematics-3d` |
| 3D scene renderer + entity→mesh sync — no engine 3D renderer, so consumers hand-roll a three.js scene plus the per-frame create/update/reap scaffold. | platformer-3d, portal, doom, starfighter | **ABSENT (3D)**: module tree ships `render-canvas2d` + `render-dom` only. `ensureMesh`/sync/reap in each consumer's `render.ts`. | 3D group `modules/render-scene3d` |
| Pointer-lock relative mouse-look — cursor capture, `movementX/Y` → yaw (+ pitch), sensitivity + clamp. | platformer-3d, portal, doom | **ABSENT**: no `movementX`/pointer lock in `modules/input`; absolute `PointerState` only. | `modules/input` V2 |
| Ray-vs-AABB raycast — slab-method ray/box returning entry `t` + face axis. | portal, doom | **ABSENT**: `modules/collision` ships `aabbVsAabb`/`aabbVsAabbSwept`/`aabbVsCircle`/`circleVsCircle`, no ray. portal `rayAabb`@`examples/portal/src/systems/portal-math.ts:63`; doom copies it@`examples/doom/src/systems/math.ts:18`. | `modules/collision` V2 |
| 3D vector math — `cross`/`dot`/3D normalize, plus quaternion attitude. | portal, starfighter (platformer-3d partial) | **ABSENT (3D)**: `modules/math` is scalar, `modules/motion` is `Vec2`, no quat type. starfighter ships a whole quat lib@`examples/starfighter/src/quat.ts`. | 3D group `modules/math-3d` |
| Billboard sprite — a camera-facing textured quad for a 2D sprite in a 3D world. | doom | **ABSENT**: no billboard helper; doom uses `THREE.Sprite`@`examples/doom/src/render.ts:123`. | `RenderableDef` extensions V3 |
| Third-person chase-camera rig — trailing offset + slerped orientation. | starfighter | **ABSENT**: no 3D camera rig (the camera module is 2D view-transform only). | 3D group `modules/camera-3d` (rig family) |
| Attitude-control flight model — rate-based angular velocity, throttle-only thrust, spherical boundary. | starfighter | **ABSENT**: no quaternion/angular-velocity helper; `kinematics` is a gravity+ground AABB mover. | 3D group `modules/motion-3d` |

Two rows were **not** swept, because neither has a backlog home yet:
tag-change lifecycle events (card-battler; the workaround — model zones as
components — is on record) and the `modules/attach` carried-rider
**adoption** follow-up (frogger), which is a migration rather than a module.
