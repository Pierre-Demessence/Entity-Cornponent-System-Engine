# modules/steering V2 — obstacle avoidance, wall following, path following

Close the `modules/steering` V2 backlog entry (ready): add the rest of the
Reynolds behaviour set left out of V1. All three ship as **pure functions**
returning a steering force in the same `desired − velocity` model as the
existing behaviours (`src/modules/steering/steering.ts`), consumed by
`combine`. The `SteeringAgentDef` ECS-component wrapper stays deferred — no
consumer wants the component form yet; the pure-function surface is the proven
shape.

## Decisions (settled before building)

- **Same force model as V1.** Each new behaviour returns `steer(dir, maxSpeed,
  vel)` = `desired − velocity`, so it blends through `combine` exactly like
  `seek` / `separation`. No behaviour sets velocity directly.
- **Obstacles are circles.** `obstacleAvoidance` takes
  `CircleObstacle { position: Vec2; radius: number }[]`. Rationale: the
  circle/sphere is the canonical avoidance primitive (Reynolds' "unaligned
  obstacle avoidance", Unity `NavMeshObstacle` carve radius, Godot RVO agent
  radius). A polygon obstacle set is a different, heavier shape and is not part
  of this entry.
- **Projection feeler, not the two-point `ahead`/`ahead2` hack.** Threat
  detection projects each obstacle centre onto the heading ray and tests the
  perpendicular distance against the obstacle radius, within a `maxSeeAhead`
  look-ahead. This is the robust form of the Bevilacqua "collision avoidance"
  tutorial and avoids the sampling gaps of two discrete probe points.
- **Walls are segments; wall following takes a params object.**
  `wallFollowing` takes `Segment { start: Vec2; end: Vec2 }[]` and
  `WallFollowParams { desiredDistance: number; range: number }`. It follows the
  *nearest* wall within `range`, blending a tangential term (move along the
  wall in the direction of travel) with a normal correction (restore
  `desiredDistance`). Wall following has no single engine-canon shape (it is a
  robotics-era behaviour — noted in the backlog entry), so this shape is
  ours; the params object mirrors `wander`'s precedent.
- **Path following is Reynolds' stateless predictive form.** `pathFollowing`
  takes `Path { points: readonly Vec2[]; radius: number }` and a
  `predictDistance`. It projects a future position along the heading, finds the
  closest point across all segments, and seeks a target nudged forward along
  that segment when the future point strays outside `radius` — otherwise zero
  force. Stateless (no waypoint index), matching the module's pure-function
  contract. It keeps the agent *on the corridor*; stopping at the final point
  is the consumer's job (compose with `arrive`).
- **Geometry helper stays private.** `closestPointOnSegment` lives as a
  file-private helper in `steering.ts`, not promoted to `modules/math` — one
  consumer today. Promote only if a second module needs it.

## Probable API

```ts
interface CircleObstacle { position: Vec2; radius: number }
interface Segment { start: Vec2; end: Vec2 }
interface WallFollowParams { desiredDistance: number; range: number }
interface Path { points: readonly Vec2[]; radius: number }

function obstacleAvoidance(pos, vel, obstacles, maxSpeed, maxSeeAhead): Vec2
function wallFollowing(pos, vel, walls, params, maxSpeed): Vec2
function pathFollowing(pos, vel, path, maxSpeed, predictDistance): Vec2
```

## Checklist

- [x] Add `obstacleAvoidance` + `CircleObstacle` to `steering.ts`, with the
      private `closestPointOnSegment` / projection helpers.
- [x] Add `wallFollowing` + `Segment` + `WallFollowParams`.
- [x] Add `pathFollowing` + `Path`.
- [x] Export the three functions and four types from
      `src/modules/steering/index.ts`.
- [x] Colocated tests in `steering.test.ts`:
      - obstacle avoidance: no threat → zero; a circle dead ahead → lateral
        force away from it; obstacle behind / beyond `maxSeeAhead` → zero;
        zero velocity → zero (no heading).
      - wall following: no walls → zero; wall beyond `range` → zero; too close
        → force away; too far (within range) → force toward; tangential term
        follows travel direction.
      - path following: future point inside `radius` → zero; strays off path →
        seeks back; empty path → zero; single-point path → seeks the point.
- [x] `src/modules/steering/README.md` — document the three behaviours, the new
      types, and the obstacle/wall/path shape choices.
- [x] `docs/roadmap/ecs-module-backlog.md` — drop the `modules/steering` V2
      entry and its status-table row.
- [x] `npm run docs:api`.
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Shape notes

- No consumer migration in this change: `examples/boids` uses only the flocking
  set, and no current example needs avoidance/walls/paths. Adoption is a
  consumer's own playtest-owned change, as with the other V2 pure-function
  extensions.
- Cross-module dependency stays `steering → math` only (for `Vec2`,
  `vec2Normalize`, `vec2ScaleToLength`). No new module dependency.
- The deferred `SteeringAgentDef` component wrapper (nested in the old V2
  entry) keeps its durable home: the backlog entry is replaced by a compact
  `modules/steering — SteeringAgentDef component wrapper — deferred` entry and
  status row, not deleted with the shipped behaviours.
- Head-on obstacle degenerate: when a circle sits exactly on the heading ray,
  the away-vector is zero, so `obstacleAvoidance` dodges perpendicular
  (`+90°` of the heading) instead of braking — keeping the "push laterally"
  invariant. Added after peer review.
