# Next examples for engine coverage

> **Point-in-time audit.** Written against
> [engine-usage.md](../agent/engine-usage.md) as of this file's last commit
> (`git log -1 -- docs/audit/next-examples-coverage.md`). Examples landed since
> may have closed some of the gaps below — regenerate the usage report
> (`npm run docs:usage`) before acting on a row.

Which examples to build next so that more of the public surface is reached by
at least one example. Candidates come from the
[20 Games Challenge list](../twenty-games-challenge.md) and from new ideas; not
every candidate has to be a game (`tilemap` isn't).

## Where the gaps are

At the time of writing: 62 public entries, 45 reached by an example; 202 of
355 value exports reached by none. The unreached surface falls into four
clusters:

| Cluster | Unreached surface |
|---|---|
| **Grid / turn logic** | `grid-based` (FOV, LOS, Bresenham), `pathfinding`, `turn-based`, `noise` — all 0%; `rng.randomInt` / `shuffle` |
| **Juice & time** | `tween` 0/5, `timer` 0/7, `easing` 1/31, scalar math (`remap`, `smoothstep`, `pingPong`, `wrap`, `lerpAngle`, `vec2MoveToward`), `animation` animator + clip registry (9/12 unused), `particles` emitters |
| **App lifecycle** | `save` 0/7, `scene-transition` 0/2, `stats` 0/3, `composeTemplates`, `FixedAccumulatorTickSource`, `Gamepad`, `createEventInput`, `ScreenSpaceDef`, `jsonAsset` |
| **3D math** | `math` mat4 / quat / vec3 (~30 unused), `camera-3d` 21/33 (frustum, `worldToScreen`, `screenPointToRay`, `addOrbitZoom`, `dampPose`), `collision-3d` 13/17 (OBB, plane, swept), `Scale3DDef`, `Grounded3Def` |

## Recommended examples, highest coverage first

### 1. Roguelike dungeon crawler (new)

_Built as [`examples/roguelike`](../../examples/roguelike/)._

The largest single win: about seven untouched modules in one example.

- `grid-based` — FOV + fog of war, monster line of sight, projectile lines via
  `bresenhamLine`.
- `pathfinding.findPath` — monsters chasing the player.
- `turn-based.TurnCycler` — player turn, then monster turns.
- `noise` + `rng.randomInt` / `shuffle` — level generation.
- `scene-transition` — descending floors; `transferEntities` carries the player.
- `save` — save & load, with `MigrationRegistry` and `IndexedDBBackend`.
- `composeTemplates` — monster archetypes (`goblin` + `archer`).
- `behavior-tree.inverter` — "not adjacent → approach / shoot".

### 2. Pac-Man (challenge #12)

`pathfinding` for ghost targeting; `timer` for scatter / chase / frightened
phases; `animation` `SpriteAnimator` + `SpriteClipRegistry` + `playClip` for
chomp and per-direction ghost sprites; `tmx` flip flags (`TMX_FLIP_*`,
`gidToFrame`) for mirrored maze tiles; `wrap` for the tunnel; `tween` + easing
for the death animation; `save` for the high score; `scene-transition` between
levels.

### 3. Lunar Lander (challenge #11)

`noise.fbm1D` terrain; `ParticleEmitterDef` / `makeParticleEmitterSystem` for a
continuous thrust flame; `aabbVsAabbSwept` + `reflect` for high-speed landings;
`lerpAngle`, `remap`, `smoothstep`; a camera that zooms near the ground
(`cameraViewRect`, `clampCameraToLimits`, `worldToView`); `ScreenSpaceDef` HUD;
`FixedAccumulatorTickSource` for deterministic physics; `Gamepad` analog thrust.

### 4. Super Monkey Ball (challenge #21)

The natural home for the 3D-math cluster, the largest unreached block. A tilting
board uses `quatFromAxisAngle`, `quatSlerp`, `quatRotate`; a ball on a tilted
surface uses `obb3VsSphere3`, `sphere3VsPlane3`, `aabb3VsSphere3`; plus
`Grounded3Def`, `Scale3DDef`, `dampPose` / `chasePose`, and frustum culling
(`frustumIntersectsSphere`).

### 5. Match-3 (new)

The honest consumer for `tween` + `easing`: swaps, falls and cascades want many
curves (`easeOutBounce`, `easeInBack`, `easeOutElastic`, …). Adds `timer` (timed
mode), `pingPong` (hint pulse), `drag-drop`, `save`, and `scene-transition`
(menu → game → results). A better proof than an easing gallery, which would add
references without validating shape.

## Non-game candidates

### 6. Conway's Game of Life (challenge #14)

A simulation sandbox. `stats` (`FrameStats`, `TimedTickSource`,
`drawStatsOverlay` — 0% and a natural fit for a "how fast is it" tool); `save`
for storing / sharing patterns (`LocalStorageBackend`) plus `jsonAsset` for
bundled ones; `HashGrid2D.cellOfPoint` for painting; `createEventInput`; a
`noise` seed fill.

### 7. 3D picking / inspector sandbox (new)

The 3D counterpart to `tilemap`. Click-select with `screenPointToRay` +
`rayVsObb3` / `rayVsPlane3`; floating labels via `worldToScreen`; orbit camera
with `addOrbitZoom`; a frustum-culling visualiser (`camera3DFrustum`,
`frustumCorners`, `frustumIntersectsAabb`); gizmos from `mat4LookAt` /
`mat4Invert`. Clears most of the `camera-3d` backlog with no game design.

## Lower yield, still worth doing later

- **Indy 500 (#10)** — strictly next in list order. `steering`
  `pathFollowing` / `obstacleAvoidance` / `pursue` / `evade` for AI cars;
  `Gamepad` for local 2-player.
- **Tic-Tac-Toe (#13)** — small; a second consumer for `turn-based` and `save`,
  and could put the board in `render-dom`.
- **Worms (#18)** — turn timers, `TurnCycler`, `noise` terrain, projectile
  `reflect`, camera limits.
- **Minecraft (#26)** — `noise` 2D/3D, block picking by ray, `IndexedDBBackend`
  chunk saves, `worker-pool` meshing. Big; save for later.

## Recommendation

Strict list order: Indy 500, then Lunar Lander, then Pac-Man. For maximum
engine coverage per example: the **roguelike** first, then **Lunar Lander** and
**Super Monkey Ball** — together they reach nearly every module no example
touches today.
