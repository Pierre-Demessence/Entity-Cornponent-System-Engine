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
- **Resolved** — canon capability promoted or extended during the build
  that surfaced it.
- **Rejected** — triager declined; rationale recorded.

## Open gaps (awaiting triage)

The **Consumers** column is the live tally that feeds the promotion rule.

| Gap (symptom) | Consumers | Status | Notes |
|---|---|---|---|
| Continuous coordinates → grid-cell projection. `HashGrid2D` keys on integer cells, so consumers hand-roll `cellOf(x,y)` + grid-sync (`onMove`/`indexStatic`) boilerplate. | asteroids, platformer, top-down-shooter | Open | Fourth consumer of the same pattern. Compare backlog `ContinuousHashGrid2D(cellSize)`. |
| World-level `reset()` / `clear()`. Consumers hand-drain every store (and the spatial grid) via `[...store.keys()].forEach(queueDestroy)`. | asteroids, platformer, snake | Open | |
| Component serialize/deserialize boilerplate for components that are never persisted — dead pass-through code required by the store API. | asteroids, snake | Open | |
| Sprite renderer ignores GID flip/rotation bits. Consumers unpack flip bits from the GID but `gidToFrame` doesn't apply them, so flipped tiles render unflipped. | tilemap, rpg | Open | rpg added flip-flag *unpacking* to `modules/tmx`; the renderer still doesn't honour them. |
| Entity-lifecycle / tag-change events. No reactive hook, so consumers walk every entity every frame to detect tag (zone) changes. | card-battler | Open | |
| Circle-vs-AABB collision helper. ~~Engine ships `circleVsCircle` only~~ — **stale: `aabbVsCircle` ships in `modules/collision`**; consumers hand-write `circleVsRect` anyway. | flappy, breakout | **Adoption** | Primitive exists ([`collision/narrowphase.ts`](../../src/modules/collision/narrowphase.ts)); gap is migration + discoverability, not a missing helper. breakout uses the expanded-AABB (Minkowski) overlap form. See [example-engine-gap-audit.md](example-engine-gap-audit.md) A1. |
| Collision bounce/reflection response. Engine has no helper to resolve a circle-vs-AABB overlap into a corrected position + reflected velocity, so consumers hand-roll axis-of-least-penetration reflection. | breakout | Open | Distinct from the *test* above: this is the *response* (push-out + velocity flip on the smaller-penetration axis). |
| AABB-vs-AABB overlap test. ~~Engine ships `circleVsCircle` only~~ — **stale: `aabbVsAabb` ships in `modules/collision`**; consumers hand-write the rect-vs-rect overlap predicate anyway. | jetpack, space-invaders, frogger, local-pong | **Adoption** | Primitive exists ([`collision/narrowphase.ts`](../../src/modules/collision/narrowphase.ts) — `aabbVsAabb`, `aabbVsCircle`, `aabbVsAabbSwept`); gap is migration + discoverability. space-invaders runs it across rockets×aliens/bombs/bunkers/mothership; frogger for the frog vs same-row cars. See [example-engine-gap-audit.md](example-engine-gap-audit.md) A1. |
| Timed-lifetime (TTL) entities. ~~No engine "live for N ms then despawn" component~~ — **stale: `LifetimeDef` + `makeLifetimeSystem` ship in `modules/lifetime`**; consumers hand-roll an `ageMs`/`lifeMs` component + reaper anyway. | jetpack, space-invaders, frogger, top-down-shooter | **Adoption** | Primitive exists ([`lifetime/lifetime.ts`](../../src/modules/lifetime/lifetime.ts)); gap is migration + discoverability. Recurs anywhere there are particles/projectiles. See [example-engine-gap-audit.md](example-engine-gap-audit.md) A2. |
| Carried / attached moving-platform rider kinematics. No engine parenting/attachment, so a rider that should inherit a moving platform's velocity per tick (frog on a log/turtle) hand-adds the platform's `vx * dt` to its own position each frame. | frogger | Open | A general "attach entity to carrier, inherit carrier delta each tick" primitive would also serve one-way platforms and conveyor belts. |
| Composite / multi-drawable renderable. `Renderable` is one drawable per entity, so multi-part sprites (pipe pairs) are hand-drawn instead of using the renderer. | flappy | Open | |
| 3D transform components. `PositionDef` / `VelocityDef` / `GroundedDef` are 2D-only; 3D consumers redefine them locally. | platformer-3d | Open | |
| 3D spatial structure (`HashGrid3D`). No 3D broadphase, so consumers brute-force collision checks. | platformer-3d | Open | Compare backlog "3D siblings — speculative". |
| DOM renderer. No engine DOM-renderer, so consumers write entity↔DOM mapping + orphan cleanup + zone tag management by hand. | card-battler | Open | `modules/render-dom` V1 shipped later (2026-04-23); triager: confirm whether it now covers this. |

## Resolved — canon promoted during the build

Standard capabilities that were clearly canon, so the engine was extended
(new primitive or existing module) under the sliding-scale rule when the
example hit them. Recorded for history; no triage needed.

| Surface | What was missing → fix | Example | Resolution |
|---|---|---|---|
| `modules/tmx` | Parser only handled base64+zlib layers, inline tilesets, no flip flags → added CSV layer encoding, external `.tsx` tileset sources, and per-tile flip-flag unpacking. All standard TMX. | rpg | Resolved (`bb4072b`). |
| `modules/input` | Digital action-only, no pointer → shipped `PointerProvider` for continuous mouse position + button-hold state. | top-down-shooter | Resolved. |
| `PointerProvider` | Lacked viewport-relative coordinates → added `clientX` / `clientY` fields for target-local hit-testing. | card-battler | Resolved. |

## Related

- [extending-the-engine.md](../extending-the-engine.md) — the promotion
  rule-book (sliding-scale evidence rule; promote-vs-keep-local).
- [ecs-module-backlog.md](ecs-module-backlog.md) — where triaged gaps
  become module entries.
