# Examples

Every prototype under `examples/` is a first-class engine consumer: a small,
runnable game or harness that imports the engine only through its public paths
(`@pierre/ecs`, `@pierre/ecs/modules/*`) — the same entry points an outside
consumer gets. So an example is also the fastest way to see a module in use.

They are listed roughly in the order they were built, because each was built to
prove something the ones before it could not. Each entry also names the modules
that prototype imports, which is the surface it exercises.

## The early rungs

- **[`snake`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/snake)** — Arcade grid movement with event-driven growth and restart flow.
  Exercises `input`, `rng`, `tick`, `transform`.
- **[`asteroids`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/asteroids)** — Continuous motion, thrust + rotation, bullets, rock splitting.
  Exercises `attach`, `collision`, `cooldown`, `input`, `lifetime`, `motion`,
  `particles`, `render-canvas2d`, `spatial`, `tick`, `transform`.
- **[`platformer`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/platformer)** — Side-view gravity + AABB kinematics, pickups, and respawn.
  Exercises `collision`, `input`, `kinematics`, `render-canvas2d`, `spatial`,
  `tick`, `transform`.
- **[`top-down-shooter`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/top-down-shooter)** — Twin-stick arena: continuous mouse aim, held-fire bullets, enemy swarms at scale.
  Exercises `asset-loader`, `audio`, `collision`, `cooldown`, `input`, `lifetime`,
  `math`, `motion`, `render-canvas2d`, `spatial`, `spawner`, `tick`, `transform`.
- **[`card-battler`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/card-battler)** — Turn-based card combat: DOM renderer, manual tick, drag-to-play — proves the renderer interface is not canvas-coupled.
  Exercises `drag-drop`, `input`, `pile`, `render-dom`, `tick`, `transform`.
- **[`rhythm`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/rhythm)** — Four-lane rhythm: tick source driven by `AudioContext.currentTime`, not `performance.now` — first external-clock test.
  Exercises `easing`, `input`, `math`.
- **[`platformer-3d`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/platformer-3d)** — 3D platformer via three.js with custom 3D AABB kinematics — the defining test that `@pierre/ecs` is not secretly 2D.
  Exercises `camera-3d`, `collision`, `collision-3d`, `input`, `kinematics-3d`,
  `math`, `render-scene3d`, `tick`, `transform-3d`.
- **[`local-pong`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/local-pong)** — Local multiplayer Pong with player-scoped keyboard input and score kept as game state, not entity data.
  Exercises `collision`, `input`, `math`, `render-canvas2d`, `tick`, `transform`.
- **[`tilemap`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/tilemap)** — First sprite/texture-atlas consumer: parses a Tiled TMX map (base64+zlib) and renders every tile as a sprite entity, layered via `RenderOrderDef`.
  Exercises `asset-loader`, `camera`, `math`, `render-canvas2d`, `texture-atlas`,
  `tilemap`, `tmx`, `transform`.
- **[`solitaire`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/solitaire)** — First interactive canvas scene: draw-1 Klondike with per-frame card dragging, dynamic z-order via `RenderOrderDef`, and world-space hit-testing over a texture atlas.
  Exercises `asset-loader`, `audio`, `collision`, `drag-drop`, `input`, `pile`,
  `render-canvas2d`, `rng`, `texture-atlas`, `transform`.
- **[`rpg`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/rpg)** — First camera-follow and first NPC dialogue scene: walks a Tiled dungeon (CSV + external `.tsx` + flipped tiles) with a follow camera, wall collision, and a nine-slice dialogue box.
  Exercises `animation`, `asset-loader`, `camera`, `input`, `render-canvas2d`,
  `texture-atlas`, `tilemap`, `tmx`, `transform`.

## The 20 Games Challenge

One game per rung of the challenge list, in challenge order.

- **[`flappy`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/flappy)** — #2: gravity + flap impulse, scrolling recycled pipe pairs, circle-vs-AABB collision, and score-on-pass.
  Exercises `collision`, `input`, `motion`, `render-canvas2d`, `spawner`, `tick`,
  `transform`.
- **[`breakout`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/breakout)** — #3: circle-vs-AABB brick field with axis-of-least-penetration bounce response, paddle english, lives, escalating ball speed, and a persisted high score.
  Exercises `collision`, `input`, `math`, `motion`, `render-canvas2d`, `tick`,
  `transform`.
- **[`jetpack`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/jetpack)** — #4: endless right-to-left scroller with hold-to-rise gravity, script-spawned recycled zappers, distance score, machine-gun bullets and particle juice.
  Exercises `collision`, `input`, `lifetime`, `math`, `motion`, `particles`,
  `render-canvas2d`, `spawner`, `tick`, `transform`.
- **[`space-invaders`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/space-invaders)** — #5: beat-stepped alien fleet that drops and reverses at the walls and speeds up as it thins, single-rocket fire, bombs the player can shoot down, destructible bunkers, a bonus mothership, lives and waves.
  Exercises `collision`, `cooldown`, `input`, `lifetime`, `math`, `motion`,
  `particles`, `render-canvas2d`, `spawner`, `tick`, `transform`.
- **[`frogger`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/frogger)** — #6: tile-discrete hopping across recycled traffic lanes and a river of logs and diving turtles, carried platform-rider kinematics, and five lilypads to fill.
  Exercises `collision`, `input`, `lifetime`, `math`, `motion`, `particles`,
  `render-canvas2d`, `tick`, `transform`.
- **[`river-raid`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/river-raid)** — #7: vertically-scrolling jet fighter up a procedurally-generated river with variable-width banks, branching streams, bridges as checkpoints, enemy boats/helicopters/jets, and a draining fuel gauge.
  Exercises `collision`, `cooldown`, `input`, `math`, `motion`, `tick`,
  `transform`.
- **[`spacewar`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/spacewar)** — #9: two-player local space duel with star gravity, screen wrapping, torpedoes, and particles — the very first video game.
  Exercises `asset-loader`, `attach`, `audio`, `collision`, `cooldown`, `input`,
  `lifetime`, `math`, `motion`, `particles`, `render-canvas2d`, `spatial`, `tick`,
  `transform`.
- **[`doom`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/doom)** — #24: first-person arena shooter — a 3D controller with verticality (stairs and a moving elevator), billboard-sprite enemies with line-of-sight AI, hitscan and projectile weapons, a health/ammo HUD, and pickups.
  Exercises `camera-3d`, `collision-3d`, `input`, `kinematics-3d`, `math`,
  `motion-3d`, `render-scene3d`, `tick`, `transform-3d`.
- **[`portal`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/portal)** — #27: real 3D portals — recursive see-through rendering, momentum-preserving teleport, floor and ceiling portals, a companion cube, and a pressure-plate door.
  Exercises `camera-3d`, `collision-3d`, `input`, `kinematics-3d`, `math`,
  `render-scene3d`, `tick`, `transform-3d`.

## Proving a subsystem

Playgrounds where one module, or one rig, is the whole point.

- **[`starfighter`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/starfighter)** — Third-person space flight: aim-to-steer attitude control (quaternion orientation, rate-based turns), throttle-only motion, a banking chase camera — proves the camera rig is neither yaw-only nor first-person-locked.
  Exercises `camera-3d`, `collision-3d`, `input`, `math`, `motion-3d`,
  `render-scene3d`, `rng`, `tick`, `transform-3d`.
- **[`boids`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/boids)** — Steering-behaviours playground: 140 boids driven purely by composed Reynolds steering — separation, alignment and cohesion plus wander, cursor-flee and food-arrive, with neighbours from a spatial hash grid.
  Exercises `input`, `motion`, `spatial`, `steering`, `tick`, `transform`.
- **[`stealth-guard`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/stealth-guard)** — FSM playground: guards run a 5-state machine (patrol → suspicious → chase → search → return) driven by a vision cone and line-of-sight; the chase state composes `modules/steering`.
  Exercises `collision`, `fsm`, `input`, `math`, `motion`, `steering`, `tick`,
  `transform`.
- **[`critters`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/critters)** — Behaviour-tree playground: critters each tick the same reactive tree — a selector over prioritised needs (flee threat > eat when hungry > sleep when tired > wander) — with a per-critter blackboard. Shows why a tree beats a state machine for layered priorities.
  Exercises `behavior-tree`, `input`, `math`, `motion`, `steering`, `tick`,
  `transform`.
- **[`woodcutter`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/woodcutter)** — GOAP planning playground: workers get actions (get axe, chop, deliver) with preconditions and effects and a goal, and an A* planner sequences them. After the first log a worker keeps its axe, so the planner drops the GetAxe step — the same goal, a different plan.
  Exercises `goap`, `math`, `motion`, `steering`, `tick`, `transform`.

## Harnesses

Not games: these measure the engine, or stress one part of it.

- **[`stress-storage`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/stress-storage)** — Storage benchmark: the same integrate-and-wrap sim over N entities two ways — the ECS Map store against flat SoA typed arrays — with isolated sim, render and frame timings and a frame-time graph.
  Exercises `transform` only.
- **[`worker-offload`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/worker-offload)** — Main-thread-stall demo: a heavy CPU job on the main thread freezes the page and spikes the frame-time graph; in a Web Worker via `modules/worker-pool` the dots keep drifting smoothly.
  Exercises `worker-pool` only.
- **[`parallel-kernel`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/parallel-kernel)** — Core-bound benchmark: a heavy O(n·K) per-entity kernel (K attractors) run single-threaded over the columnar store. Raise entities and K until the sim dominates the frame.
  Exercises `transform` only.

## Running one

Each example is its own small Vite app with its own `package.json`, depending on
the engine through a `file:` install. Open its folder and start it the way that
folder's scripts say. [`hub`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/hub)
runs them all from a single page.
