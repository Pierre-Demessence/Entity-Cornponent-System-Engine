# Doom — 20 Games Challenge #24 (3D arena FPS)

Status: **complete — M1–M6 all done.** All challenge _Goals_ are met (FP
controller w/ jump+strafe, arena verticality, waking+attacking enemies, hitscan
+ projectile weapons, health-bar + ammo HUD with death, health/ammo pickups),
registered in the hub, #24 ticked, engine-gap rows added (Doom = 3rd 3D
consumer), peer-reviewed (PASS). Built local-first (approach B) with
billboard-sprite enemies, per Pierre (2026-07-18).

## What the challenge asks (Goals — all required)

- **First-person controller** — look up/down/left/right, walk forward/back,
  **strafe**, and **jump**.
- **One or more arena levels** with **verticality** — slopes, stairs, or
  elevators (not a flat plane).
- **One or more enemy variants** — idle until the player is near, then **shoot
  or attack**. (Stretch: smarter AI / an "AI director".)
- **Two or more weapons** — (1) a **hitscan** weapon (instant damage) and
  (2) a **projectile** weapon (a physical bullet that travels to the target).
- **HUD** — a **health bar** + **ammo count**. The player takes damage and
  **dies at 0 health**.
- **Pickups** — a **health pickup** (restores health) and an **ammo pickup**
  (adds ammo).

Stretch (optional): billboard-sprite enemies (the authentic Doom-1993 "2.5D"
look) *or* fully 3D enemies; an AI director.

## Why this is the natural next 3D build

Doom is a 3D arena shooter, and [`portal`](portal.md) already built the entire
3D-FPS substrate. Doom reuses it almost wholesale:

| Doom needs | Portal already has | Source |
|---|---|---|
| First-person controller (WASD + mouse-look + jump + strafe) | ✅ exactly this | `examples/portal/src/systems/input.ts`, `main.ts` (pointer-lock yaw/pitch) |
| 3D AABB physics (gravity, per-axis sweep, grounded) | ✅ `kinematics3d` | `examples/portal/src/systems/kinematics3d.ts` |
| three.js renderer + entity→mesh sync | ✅ | `examples/portal/src/render.ts` |
| **Hitscan ray test** | ✅ `rayAabb` (slab method, entry `t` + face) | `examples/portal/src/systems/portal-math.ts` |
| GLB model loading (weapons, props) | ✅ `GLTFLoader` + texture redirect | `examples/portal/src/render.ts` |
| First-person weapon viewmodel | ✅ (the portal gun) | `examples/portal/src/render.ts` |
| 3D component set (`Position3D`/`Velocity3D`/`ShapeAabb3D`/`Grounded`) | ✅ | `examples/portal/src/components.ts` |

So the genuinely **new** work for Doom is: verticality (stairs/ramps/elevator),
enemies + AI, a projectile weapon, damage/health/death, pickups, and the HUD.

## Decision 1 — promote the 3D stack, or keep Doom local? (needs Pierre)

Doom would be the **3rd 3D consumer** (after `platformer-3d` and `portal`). The
3D primitives all three share are already logged as gaps in the
[engine-gap ledger](../roadmap/engine-gap-ledger.md): 3D transforms, the 3D AABB
body solver, the 3D renderer + entity→mesh sync, pointer-lock mouse-look,
ray-vs-AABB, and Vec3 math. With a 3rd consumer they clear the rule-of-three,
and [`AGENTS.md`](../../AGENTS.md) leans **canon-complete over incremental**.

Two ways to proceed:

- **(A) Promote the 3D stack to engine modules first**, then build Doom on the
  modules and migrate `portal` + `platformer-3d` onto them too. Long-term
  correct; kills the triplicated 3D code. But it's a sizeable cross-example
  refactor *before* any Doom gameplay exists.
- **(B) Build Doom local-first** (lift portal's 3D code into the doom example,
  adapt it), keep logging the gaps, and run the promotion as a **separate
  dedicated pass** afterwards. Matches the established "examples are local-first,
  the ledger drives promotion" workflow; gets to a playable Doom fastest.

**Recommendation: (B)** — keep the game build and the engine refactor
decoupled, exactly as every prior example did. I'll bump the ledger's 3D rows to
3 consumers as Doom lands, and we can do a focused "promote the 3D stack" pass
(its own plan) once Doom proves the shape a third time. *Open to (A) if you'd
rather pay the refactor up front.*

> Note: building local-first here means **copying** portal's 3D systems into
> `examples/doom/`, which is duplication. That's the deliberate cost of (B). If
> that bothers you, (A) is the answer — say so and I'll re-plan around promoting
> the modules first.

## Decision 2 — enemy rendering: billboard sprites vs 3D models (needs Pierre)

- **Billboard sprites (authentic Doom 2.5D).** Camera-facing textured quads
  (e.g. a Kenney roguelike/tiny-dungeon monster sprite). Faithful to 1993; adds
  a small "billboard" render path (a quad that yaws to face the camera). New
  engine-gap candidate (billboarding).
- **3D model enemies (the stretch option).** Reuse the GLB character pipeline
  (`kenney_blocky-characters` / `animated-characters`). No new render path, but
  less Doom-authentic.

**Recommendation: billboard sprites** — it's the iconic Doom look and only a
modest render addition (and a cleaner engine-gap story). Easy to swap to 3D
models if you prefer.

## Assets on hand (all Kenney, already vendored)

- **Weapons / projectiles:** [`kenney_blaster-kit_2.1`](../../examples/assets/kenney_blaster-kit_2.1)
  (same pack as the portal gun) — blaster viewmodel + `bullet-*`/`grenade-*` for
  the projectile.
- **Arena geometry:** [`kenney_prototype-kit`](../../examples/assets/kenney_prototype-kit)
  — walls, floors, stairs, ramps, columns (shared `colormap.png`).
- **Enemies (billboard):** [`kenney_roguelike-characters`](../../examples/assets/kenney_roguelike-characters)
  / [`kenney_tiny-dungeon`](../../examples/assets/kenney_tiny-dungeon) sprite
  sheets. **Enemies (3D):** [`kenney_blocky-characters_20`](../../examples/assets/kenney_blocky-characters_20).
- **HUD:** [`kenney_ui-pack`](../../examples/assets/kenney_ui-pack) +
  [`kenney_kenney-fonts`](../../examples/assets/kenney_kenney-fonts). (HUD can
  also just be a DOM overlay like portal's win panel.)

## Milestones (each independently testable)

- **M1 — controller + arena shell.** Scaffold the Vite app; lift portal's
  first-person controller + `kinematics3d` + three.js renderer. A boxed arena
  (prototype-kit floor/walls) you can walk/strafe/jump/look around. *(Reuse-heavy.)*
  ✅ **done (build+lint+tsc clean, awaiting Pierre's visual check)** — `examples/doom/`
  scaffolded (port 5194); 3D components + `kinematics3d` (plain, no portal carving) +
  FP controller (WASD/jump/air-control) + pointer-lock yaw/pitch + a stripped three.js
  renderer (entity→mesh sync, no see-through). Arena = 30×30 floor + 4 walls + 5 cover
  blocks (colored boxes; prototype-kit tiling deferred to polish). Kill-plane respawn.
- **M2 — verticality.** Stairs **+** a ramp **+** a moving elevator platform.
  Needs step-up handling in the 3D solver (climb small steps without jumping)
  and a vertically-moving platform that carries the rider (the frogger
  rider-kinematics / `modules/attach` shape — see ledger).
  ✅ **done (build+lint+tsc clean, awaiting Pierre's visual check)** — added `STEP_HEIGHT`
  auto-climb to `kinematics3d` (a grounded body whose path is blocked by a static within
  STEP_HEIGHT of its feet is lifted onto it). Built a 6-tread **staircase** → **balcony**,
  and an oscillating **elevator** (`ElevatorDef`/`ElevatorTag` + `elevatorSystem` that moves
  it and **carries** the rider) → step-off **ledge**. True angled **slopes** are deferred
  (don't fit an AABB solver cleanly; the challenge accepts "slopes, stairs, *or* elevators",
  and stairs + elevator deliver the verticality).
- **M3 — enemies + AI.** Spawn enemy entities (billboard sprites, per Decision
  2). Per-enemy state: **idle → alerted** (player within range *and* line of
  sight, via `rayAabb`) **→ attack** (shoot/melee on a cadence). Enemy health +
  death.
  ✅ **done (build+lint+tsc clean, awaiting Pierre's visual check)** — two billboard
  variants (`tile_0108` green, `tile_0110` red from tiny-dungeon) rendered as camera-facing
  `THREE.Sprite`s. `aiSystem` (idle→chase→attack-pose) wakes on `ENEMY_DETECT_RANGE` +
  `rayAabb` line-of-sight, chases on XZ (steers a `DynamicBodyTag` so `kinematics3d` does the
  walls), stops + ticks an attack cadence within `ENEMY_ATTACK_RANGE`. Added `math.ts`
  (`rayAabb` + `forwardVec`), `Health`/`Ai`/`Billboard` components + `EnemyTag`. **Enemy
  death + the attack dealing player damage are wired in M4/M5** (nothing damages them yet).
- **M4 — weapons.** (1) **Hitscan** — `rayAabb` from the eye along the look ray,
  nearest enemy takes instant damage (muzzle flash / tracer). (2) **Projectile**
  — a traveling bullet entity (3D velocity + lifetime) that damages on overlap.
  First-person viewmodel (blaster-kit) + weapon switch.
  ✅ **core done (build+lint+tsc clean, awaiting Pierre's visual check)** — `weaponSystem`
  (LMB-held, cooldown-gated): **hitscan** rays vs enemies/walls → nearest enemy before a
  wall takes damage + a brief tracer line; **projectile** spawns a bolt that `projectileSystem`
  flies straight, damaging the first enemy it overlaps (despawn on enemy/wall/ttl). Enemies
  **die** at hp≤0 (`queueDestroy`). `1`/`2` switch weapons. Renderer draws projectile spheres
  + the tracer **and a first-person gun viewmodel** (blaster-l for hitscan, blaster-r for the
  launcher, parented to the camera + toggled by weapon). Player still takes no damage (M5).
- **M5 — survival loop: health, ammo, pickups, HUD.** Player health + ammo;
  taking damage; death + restart. Health-pickup and ammo-pickup entities
  (overlap to collect). HUD: health bar + ammo count (DOM overlay).
  ✅ **done (build+lint+tsc clean, awaiting Pierre's visual check)** — player has `Health`
  (100); enemy attacks deal `ENEMY_DAMAGE`; at 0 hp `state.dead` gates movement + firing and
  shows a **death overlay** (R restarts). Per-weapon **ammo** (`state.ammo[weapon]`) is
  consumed per shot and blocks firing when empty. **Pickups** (`pickupSystem`): health +
  bullet + rocket, collected on overlap (`queueDestroy`), rendered as bobbing/spinning cubes.
  **HUD** (DOM): a health bar + the current weapon's ammo count.
- **M6 — polish + wrap-up.** Tune AI/damage/feel; register in the
  [hub](../../examples/hub/); tick #24 in
  [twenty-games-challenge.md](../roadmap/twenty-games-challenge.md); add the new
  engine-gap rows (3rd 3D consumer + any Doom-specific gaps: billboarding, AI
  seek/LoS, projectile, damage/health, pickups, step-up/elevator); peer review;
  move this plan to `docs/plans/done/`.
  ✅ **done** — registered in the hub (`ExampleId` + entry + dep; note: the hub's
  aggregate `tsc` build is currently red on a **pre-existing** `rpg` error
  (`Renderable.frame`), unrelated to Doom — doom builds clean on its own and its hub
  entry typechecks). #24 ticked. Ledger updated: Doom bumps the shared 3D rows to **3
  consumers** (transforms, body solver, renderer, pointer-lock look) + ray-vs-AABB (2nd)
  and adds billboard-sprite + pickup-on-overlap rows, joining the seek-AI +
  moving-platform-rider rows. Peer-reviewed twice (PASS; fixed deferred-destroy
  post-mortem hits + minor items).

## Likely new engine-gap rows (beyond the shared 3D stack)

Recorded as they surface, per the ledger workflow:

- **Billboard sprite render** — a camera-facing textured quad (if Decision 2 =
  sprites).
- **Seek / line-of-sight AI** — "alert when the player is near + visible, then
  attack on a cadence." (`modules/ai` is already a deferred backlog item; Doom
  is a 2nd/3rd consumer.)
- **Projectile** — spawn a moving body with a lifetime that damages on overlap
  (overlaps the existing `lifetime` + `collision` modules; the *pattern* may be
  worth a helper).
- **Health / damage / death** — a `Health` component + damage events + death.
  (Likely lands near the "scoring/lives" content line — may stay local.)
- **Pickup / collectible-on-overlap** — touch an entity to apply an effect then
  despawn (recurs across many games; candidate `modules/pickup`).
- **Step-up / ramp kinematics & moving-platform rider** — extends the 3D body
  solver; the rider half is the existing `modules/attach` shape.

## Out of scope (for the first pass)

- Multiple distinct arenas / level streaming (one good arena is enough for the
  Goal).
- Doom's BSP/sector renderer — we use three.js polygons, not a sector engine.
- Saving/loading, multiplayer, a full weapon roster (two weapons satisfy the
  Goal).
