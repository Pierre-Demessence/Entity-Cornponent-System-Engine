# Portal — 20 Games Challenge #27 (real 3D)

Status: **complete — M1–M7 + M6 wrap-up all done.** FPS controller, portal gun,
recursive see-through rendering, momentum teleport, floor/ceiling portals,
companion cube, plate + door, win, respawn; textured Kenney GLB models
(character, cube, plate, door, tiled floor + walls, gun viewmodel). Verified by
Pierre (2026-06-10). M6 wrap-up done: registered in the hub, #27 ticked,
engine-gap rows added (Doom later bumped the shared 3D rows to 3 consumers),
dev-only `__portal` hook removed, peer-reviewed (PASS). Only `wall-corner.glb`
corners + the ceiling box remain optional polish. Static checks (tsc + eslint +
vite build) green.

Out of order (we're at #9 `spacewar`); Pierre asked to skip straight to #27
([challenge page](https://20_games_challenge.gitlab.io/games/portal/)).

## Decision: faithful 3D (Option B), approved

An earlier draft of this plan recommended a 2D adaptation. That was the wrong
default — gated on "the modules are 2D" when the engine's *core* is
dimension-neutral and [`examples/platformer-3d`](../../examples/platformer-3d/)
already proves three.js 3D works here. A **real 3D Portal is the more valuable
build**: it's the **second 3D consumer** after `platformer-3d`, which is exactly
what un-defers the 3D rows the [gap ledger](../roadmap/engine-gap-ledger.md)
currently parks as *"3D siblings (speculative)"* (`Position3D`/`Velocity3D`,
`HashGrid3D`). Per [extending-the-engine.md](../extending-the-engine.md), examples
are built **local-first** and surface gaps; missing modules are the *output*, not
a prerequisite.

Scope: **one level**, faithful mechanics. This is a multi-session research build;
the hard part is the see-through portal renderer.

## Goals (from Pierre's spec)

- [x] **3D FPS character controller**: pointer-lock mouse-look (yaw + clamped
      pitch), WASD move, run, jump, limited air control, terminal velocity.
- [x] **Portal gun**, orange + blue: fire to place a portal where the crosshair
      hits a *portal-able* surface; placement snaps within the surface and away
      from edges / the other portal. Firing a colour replaces that colour's
      portal **only on a valid placement** — an invalid shot leaves the existing
      one open.
- [x] **See through** portals (recursive, depth-capped) **and move through**
      them — teleport conserves momentum, redirected by the portal-pair
      orientation ("speedy thing goes in, speedy thing comes out"); the
      see-through view and the teleport use the **same** transform.
- [x] **Companion cube**: grab + drop; full dynamic physics; teleports through
      portals like the player; can rest on the plate.
- [x] **Pressure plate + locked door**: the door is open while the player **or**
      the cube rests on the plate, and closes when the plate clears. (Cube-on-
      plate is the intended solution so the player can walk through.)
- [x] **Level**: a rectangular room whose floor is split by a **central hole**
      into two halves. Player + cube start on side A; plate + door (+ the exit
      beyond it) are on side B. Solve it by placing one portal on a wall on
      side A and one on a wall across the gap on side B, carrying the cube
      through, dropping it on the plate, and walking through the opened door.
- [x] **Fall in the hole → respawn**: player and cube each respawn at their own
      start position.
- [x] **Win**: reach beyond the opened door.
- [x] Register in the [hub](../../examples/hub/) + tick
      [twenty-games-challenge.md](../roadmap/twenty-games-challenge.md) #27.

**Stretch (optional):** portal-rim shader/particles; the "cake is a lie" nod.

## Technical approach (my calls — risky ones flagged)

> Pierre delegated technical decisions. These are my proposed techniques; the
> milestones below let each be validated before the next.

### Rendering — three.js, stencil-based recursive portals

- three.js `WebGLRenderer` + a full FPS `PerspectiveCamera` (yaw + pitch), reusing
  the `platformer-3d` `makeRenderer`/scene-sync bootstrap as a starting point.
- Each portal is an oriented quad with a local frame (normal, up, right). The
  **link transform** `T = M_dst · R_π(up) · M_src⁻¹` (destination frame · 180°
  flip · source frame inverse) maps a point/vector at the source portal to the
  destination. **The same `T` drives both the see-through camera and the body
  teleport**, which is what keeps "look" and "walk" consistent.
- See-through via the **stencil buffer**, recursively, with a **capped depth**
  (start at 1, try 2): mask the portal quad in the stencil, render the scene from
  the virtual camera `cam' = T · cam`, recurse for portals visible in that view,
  then write portal depth so nearer geometry occludes correctly. Standard
  stencil-portal technique (cite in the commit: classic Portal/“teleporter”
  renderer, three.js portal examples).
- **Risk (the hard part):** near-plane clipping at the destination portal — the
  virtual camera must not draw geometry *behind* the destination portal. Plan:
  **oblique near-plane clipping** (skew the projection so the near plane lies on
  the portal plane). If stencil recursion proves too heavy/fiddly, fall back to
  **render-target portals** (render dst view to a texture on the quad) — lower
  fidelity, note the tradeoff. This is the milestone most likely to need iteration.

### Character controller (FPS)

- Pointer lock (like `platformer-3d`): mouse X → yaw, mouse Y → pitch (clamp
  ≈ ±89°). WASD relative to yaw. Jump impulse + gravity + terminal velocity +
  limited air control.
- Collision: player **AABB** vs level AABBs, adapting `platformer-3d`'s
  `kinematics3d` (gravity → X sweep → Z sweep → Y sweep push-out). Local code.

### Portal placement (gun)

- Ray from the camera along the view dir; **ray-vs-AABB** against portal-able
  surfaces; take the hit point + face normal, orient the portal to that face,
  and clamp the portal rect within the surface bounds and off the other portal.
  Engine has no raycast → local.

### Teleport (player + cube)

- For each teleportable body, track its signed distance to each active portal
  plane; when it crosses the plane **within the portal's bounds**, apply `T` to
  its position + velocity (+ the player's look orientation). Identical handling
  for the cube.
- **Collision carving (flagged):** while a body straddles a portal, ignore
  collision with that portal's host wall *within the opening*, so you can pass
  through. First cut: simply disable host-wall collision while straddling.

### Companion cube

- Dynamic AABB body (gravity + collision + teleport). **Grab** (key, e.g. `E`/
  `F`): becomes kinematic, held at a fixed offset in front of the camera.
  **Drop**: re-enable dynamics with the camera-relative carry velocity. Rests on
  the plate when dropped there.

### Pressure plate + door

- Plate: a floor AABB trigger on side B; **active** if the player or the cube
  overlaps/rests on it. Door: a solid AABB when closed; slides/raises open
  (non-colliding) while the plate is active; re-closes when it clears.

### Level + respawn

- One rectangular room; floor = two slabs with a central gap (the hole); bounding
  walls, **some flagged portal-able** (visually distinct so placement is a real
  choice). Player + cube spawn on side A; plate + door + exit on side B.
- Respawn in `onBeforeFlush` (reusing the `platformer-3d` pattern): if
  `player.y < RESPAWN_Y` respawn the player; if `cube.y < RESPAWN_Y` respawn the
  cube — independently, each at its own start.

## Architecture (files — model on `platformer-3d`)

- `main.ts` — bootstrap: renderer, pointer lock, input, scheduler, tick runner,
  respawn check.
- `game.ts` — constants, world factory, **level builder**, spawn helpers, reset,
  `GameState`.
- `render.ts` — three.js scene + entity→mesh sync + **the stencil portal
  renderer** (the heavy file).
- `components.ts` — local: `Position3D`, `Velocity3D`, `AabbBody3D`, `Grounded`,
  `PortalDef`, `PortalGunDef`, `Grabbable`/`Held`, `PressurePlateDef`, `DoorDef`,
  `PortalableSurfaceTag`, …
- `systems/` — `input` (look + move + jump + fire + grab), `portal-placement`,
  `teleport`, `carry`, `plate-door`, `kinematics3d`.

## Engine modules consumed (no engine edits expected — local-first)

Core (`EcsWorld`, `Scheduler`, `EventBus`, `TickRunner`), `modules/input`
(keyboard; pointer-lock `movementX/Y` read directly as in `platformer-3d`),
`modules/tick`, and **three.js** (already an example dep). **Not**
`render-canvas2d`.

## Engine gaps this surfaces (the payoff)

This is the **2nd 3D consumer**, so it directly un-defers the ledger's deferred
3D rows. Symptom-level only — build local-first, then verify each against source
(`file@line` + PRESENT/ABSENT) before anything lands in the ledger:

- **`Position3D` / `Velocity3D` / 3D transform** — `platformer-3d` hand-rolls
  `Position3DDef`; Portal will too → 2nd consumer → un-defers "3D transform
  siblings".
- **3D AABB kinematics** — `platformer-3d` hand-rolls `kinematics3d`; Portal
  adapts it → 2nd consumer → candidate `modules/kinematics3d`.
- **Three.js renderer integration / a 3D `Renderer<TCtx>` shape** — both 3D
  examples hand-roll `makeRenderer` → 2nd consumer → candidate.
- **Pointer-lock look provider** — both read `movementX/Y` directly → candidate
  input helper.
- **3D ray-vs-AABB cast** (portal gun) — ABSENT → local.
- **Portal teleport / momentum redirect, grab/carry, pressure-plate trigger** —
  novel / genre-specific → local.
- **`HashGrid3D` / 3D broadphase** — *probably NOT* exercised (one small room →
  brute-force is fine). Won't claim it as a consumer unless the build proves it.

## Model format decision

Kenney ships each pack in **OBJ, FBX, and GLB**. We support **GLB (glTF 2.0
binary) first**, and likely only that:

- **GLB — chosen.** Self-contained single binary (geometry + PBR materials +
  textures + skeletal animation in one file), the modern Khronos standard with
  the **best-maintained three.js loader** (`GLTFLoader` in
  `three/examples/jsm`). Handles the animated blocky character *and* the static
  props with one code path. No sidecar `.mtl`/texture files to wire up.
- **OBJ — no.** Geometry only; needs `OBJLoader` + `MTLLoader` + external
  texture images, and has **no skeletal animation** (a problem for the
  character).
- **FBX — no.** `FBXLoader` supports animation but the format is proprietary
  and the loader is heavier/fussier; GLB covers the same ground more cleanly.

So: a single `loadGltf(url)` helper over `GLTFLoader`, loading `.glb`. If a
second 3D example later needs the same, it's a candidate `modules/asset-3d`
(local-first for now).

## Milestones (each independently testable)

- **M1 ✅ done** — three.js room (two floor slabs + central hole + walls) + FPS
  controller (look, move, jump, gravity, AABB collision) + fall → respawn.
- **M2 ✅ done** — portal gun raycast placement; two coloured portals as **flat
  quads** (no see-through yet); portal-able-surface restriction + snapping.
- **M3 ✅ done** — **teleport** through portals + momentum redirect + look
  reorientation + collision carving at the openings + momentum-preserving air
  control. (Verified working by Pierre.)
- **M4 ✅ done (verified by Pierre)** — **see-through** portals via
  render-to-texture: per portal, a virtual camera `T·cam` renders the scene to a
  target with a world-space clip plane at the destination, sampled onto the
  portal quad by screen-space UV. Polished into **single-frame depth-2
  recursion** (portal-in-portal is itself see-through) framed by unlit **rim
  rings**; targets stay linear with one final sRGB encode (nested levels don't
  wash to white). Stencil + oblique-near-plane was the planned route; RTT +
  clip-plane proved the more robust path.
- **M5 ✅ done (verified by Pierre)** — **companion cube** grab/drop
  (`E`), full dynamics, teleports with you when carried, solid to the player
  when resting; a **clone** renders it emerging from the destination portal
  while carried through; held cube is **wall-clamped** (but allowed through a
  portal opening); **pressure plate** (player or cube) drives a **sliding
  door**; reach the exit past the door to **win** (overlay + `R` restart); cube
  respawns on fall. Level reshaped: side-B dividing wall + doorway, plate, exit
  alcove; exit-side wall made non-portal-able so you can't skip the puzzle.
- **M7 — textured 3D models (new goal, IN PROGRESS).** Replace the flat
  primitive look with Kenney models. **Format: glTF binary (`.glb`) — see
  [Model format decision](#model-format-decision).** Build a small
  `GLTFLoader`-based model loader local to the example; swap the box/capsule
  meshes for loaded models, keeping the ECS AABBs as the colliders (visual
  mesh decoupled from the physics box). All chosen models from the
  [`kenney_prototype-kit`](../../examples/assets/kenney_prototype-kit) (shared
  `colormap.png` palette) except the character. **Implementation order is
  simplest → hardest** (single objects before tiled surfaces):
  - **M7.1 Character ✅** — `character-a.glb` for the player body (seen through
    portals).
  - **M7.2 Cube ✅** — `crate.glb` (single object + its portal clone).
  - **M7.3 Pressure plate ✅** — `button-floor-square.glb` (single object); tints
    green while powered (cube/player on the plate).
  - **M7.4 Door ✅ (panel)** — `door-sliding-double-round.glb` (the sliding panel;
    replaces the first-cut `door-sliding.glb`). The static `wall-doorway-round.glb`
    frame is folded into M7.6 (it tiles with the dividing wall).
  - **M7.5 Floor ✅** — `floor-thick.glb` **tiled** across the two floor slabs (one
    `InstancedMesh`, 192 tiles; floor slab boxes hidden via `FloorTag`).
  - **M7.6 Walls — perimeter + dividing wall ✅, corners/ceiling TODO.** `wall.glb`
    **tiled** over the four interior perimeter faces *and* both faces of the
    dividing wall around the doorway opening, via a `tileRegion()` helper that
    scales panels so a whole number fills each region exactly (one `InstancedMesh`,
    ~522 tiles; wall boxes hidden via `WallTag`). The `wall-doorway-round.glb` frame
    was **dropped**: it's a 2-wide × 1-tall tile with a small arch, a bad fit for our
    3-wide × 3.2-tall opening — the tiled opening edges read clean instead.
    *Remaining:* `wall-corner.glb` at the 4 corners and the ceiling (still a box).
  - **M7.7 Portal gun ✅** — [`blaster-r.glb`](../../examples/assets/kenney_blaster-kit_2.1)
    shown two ways: a first-person **viewmodel** (child of the camera, drawn only in
    the main pass) **and** a world copy in the **character's hands** (child of
    `playerBody`, so you see yourself holding it through portals). Loaded via a
    dedicated `LoadingManager` (the blaster ships its own `colormap.png`).
- **M6 (wrap-up, after M7)** — hub registration + 20-games checklist tick,
  engine-gap-ledger rows (the 3D-sibling gaps this surfaces), **remove the
  dev-only `__portal` debug hook**, peer review.

## Validation

- `tsc --noEmit && vite build` clean; `eslint` clean.
- Browser E2E per milestone: M1 walk/jump/fall-respawn; M2 portals only on
  portal-able walls; M3 fling test (fall into a floor portal → launch out a wall
  portal, momentum conserved) + walk-through; M4 looking through A shows B's
  side correctly; M5 full solve (portal across, carry cube, drop on plate, door
  opens, reach exit) + cube/player respawn from the hole.

## Peer review

- `runSubagent` review pass(es) until **LGTM** (reviewer: no code edits, no
  `askQuestions`).

## My assessment — is it good / anything missing?

The spec is a **complete, solvable, classic Portal puzzle** — nothing missing for
a real first cut. Things I'd add or pin down (my defaults unless you object):

1. **Crosshair + placement feedback** (you can't aim a portal gun blind).
2. **Only some walls portal-able**, visually distinct — otherwise placement isn't
   a decision and the puzzle trivialises.
3. **Guard the puzzle's solvability**: keep portal-able wall area reachable on
   side A and visible across the gap on side B; don't let a single portal pair
   trivially skip the cube (e.g. floors near the hole non-portal-able).
4. **Clamp pitch** and keep the held cube from clipping into walls.
5. **Door fully clears** the opening when open.

Biggest risk by far is **M4 (the see-through renderer)** — oblique near-plane
clipping + recursion depth. Everything else is standard 3D-platformer +
trigger/teleport work. I'd build M1–M3 to get the mechanic feeling right with
flat portals first, then invest in M4.

## Resolved decisions

- **Grab/drop:** `E`.
- **Portal fire:** LMB = blue, RMB = orange.
- **Fire replaces only on a valid placement:** firing a colour when the shot
  resolves to a valid portal-able spot replaces that colour's existing portal;
  if the shot is invalid (no portal-able surface / fails snapping), the existing
  portal of that colour **stays open** unchanged. Same for both colours.
- **No run key** (single movement speed).
- **No cake easter egg.**
