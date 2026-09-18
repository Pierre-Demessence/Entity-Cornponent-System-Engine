# Starfighter — 3D six-degrees-of-freedom space shooter example

A new `examples/starfighter` project: control a 3D spaceship in third-person
with full 6DOF translation (thrust forward/back, strafe left/right,
climb/dive), steer with the mouse, fire bullets, and destroy target drones
that drift in around the ship. Validates that the third-person chase camera,
6-axis flight, and shoot-the-targets loop all sit cleanly on `@pierre/ecs`
with no engine change.

## Engine assumption it stresses

- **Third-person orbit/chase camera driven by a moving, freely-oriented
  body** — distinct from platformer-3d (yaw-only orbit, no pitch) and doom
  (first-person, camera *is* the body). Here the camera trails a body that
  can point anywhere in 3D.
- **6DOF translation on an oriented local basis** (forward/right/up from
  yaw+pitch), not the gravity+XZ-plane kinematics every other 3D example uses.

## Design

- **Orientation**: a `Quat` (in `src/quat.ts`) steered No-Man's-Sky style. A
  free-floating **reticle** (the mouse, clamped to a reference ring) sets a
  *target angular velocity* past a central **deadzone**; the ship's angular
  velocity eases toward it, so turns build and settle over time instead of
  snapping. Roll is on A/D. No pointer-lock — the cursor is free and the
  reticle holds where you leave it, so the ship keeps turning until you
  recentre it.
- **Motion**: throttle-only. W/S accelerate forward/back speed; the ship
  always coasts along its own nose (no strafe, no vertical thrust). Position
  clamped to a spherical play boundary.
- **Firing**: LMB/Space + cooldown spawns a bullet at the nose along forward,
  inheriting ship momentum; TTL despawn. Bullets track the fixed centre
  crosshair, independent of the steering reticle.
- **Targets**: RNG-seeded drones spawn over time up to a cap, drift slowly,
  bounce off the boundary. One bullet destroys a drone → score + event.
- **Camera**: third-person chase — position trails behind+above the nose;
  orientation **slerps** toward the ship's so the view banks with roll.
- **Environment / spatial reference**: a wireframe boundary sphere, a
  recycled 3D dust field wrapped around the camera (near motion parallax), a
  world-fixed starfield recentred on the camera each frame (far rotational
  parallax), and a distant planet.
- **Fullscreen**: canvas fills its mounted container and tracks window resize.

## Components / tags

- `Position3DDef {x,y,z}`, `Velocity3DDef {vx,vy,vz}`, `RadiusDef {r}`
- `TargetDef {hp}`, `BulletDef {ttl}`
- `ShipTag`, `BulletTag`, `TargetTag`

## Systems (scheduler order)

1. `shipSystem` — throttle → reticle/roll → target angular velocity → eased
   quaternion integrate → nose-forward velocity → integrate → boundary clamp.
2. `weaponSystem` — trigger + cooldown → spawn bullet along forward.
3. `bulletSystem` — integrate, TTL, sphere-vs-target hit → destroy both +
   score.
4. `targetSystem` — spawn timer → spawn; drift-integrate; boundary bounce.

## Subtasks

- [x] Plan file.
- [x] Scaffold `examples/starfighter`: `package.json`
      (`@pierre/ecs-example-starfighter`, three dep), `index.html`,
      `vite.config.ts` (unused port), `tsconfig.json`.
- [x] `src/components.ts` — component/tag defs.
- [x] `src/game.ts` — constants, `GameState`, `makeWorld`, spawn helpers,
      `resetGame`, local-basis math.
- [x] `src/systems/*` — ship, weapon, bullet, target + barrel.
- [x] `src/render.ts` — three.js chase camera, entity mesh reconcile, dust
      field, boundary sphere, planet, starfield.
- [x] `src/main.ts` — wiring: input, pointer lock, tick runners, HUD.
- [x] Register in `examples/hub`: `package.json` dep + `ExampleId` union +
      manifest entry.
- [x] Log engine gaps in `docs/roadmap/engine-gap-ledger.md`.
- [x] `examples/starfighter/POSTMORTEM.md` — shape-validation writeup
      (6DOF → aim-to-steer lesson, gaps hit, promotion candidates).
- [x] Validate: root `tsc`/`vitest`, example `vite build`; hand E2E to owner.
- [x] Peer review loop until LGTM.

## Notes

- Per repo E2E-ownership rule (AGENTS.md / user memory), Pierre owns the
  browser playtest for game projects — the agent runs build/test/lint only
  and hands off.
