# `@pierre/ecs/modules/motion`

2D velocity integrator: each tick, `pos += vel · dt`. Optional boundary
handling (wrap / clamp) and an `onMove` hook so games that keep a
separate spatial index or dirty-flag queue can stay in sync without the
motion module owning either.

Canon pattern: Bevy `bevy_transform` motion systems, Godot
`_physics_process` velocity integration, Unity DOTS
`TransformSystemGroup`. Not a full physics module — for gravity +
collision + grounded, see the shipped `@pierre/ecs/modules/kinematics`.

## API

```ts
interface Bounds { width: number; height: number }

type VelocityIntegrationBoundary =
  | { mode: 'wrap';  bounds: Bounds }   // toroidal topology, range [0, width) × [0, height)
  | { mode: 'clamp'; bounds: Bounds };  // pinned, range [0, width] × [0, height]

interface VelocityIntegrationTickCtx {
  dtMs: number;
  world: EcsWorld;
}

interface VelocityIntegrationOptions<TCtx extends VelocityIntegrationTickCtx> {
  name?: string;
  runAfter?: string[];
  boundary?: VelocityIntegrationBoundary;
  tag?: TagDef; // integrate only entities carrying this tag (Bevy `With<T>`)
  onMove?: (
    ctx: TCtx,
    id: EntityId,
    prev: Readonly<Position>,
    next: Readonly<Position>,
  ) => void;
}

function makeVelocityIntegrationSystem<TCtx extends VelocityIntegrationTickCtx>(
  options?: VelocityIntegrationOptions<TCtx>,
): SchedulableSystem<TCtx>;
```

Iterates every entity that has both `VelocityDef` and `PositionDef`.
Skips entities whose `(vx, vy)` is `(0, 0)` and entities whose final
position equals their prior position (after boundary handling) to avoid
waking downstream observers for no-op updates.

## Usage

```ts
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { PositionDef, VelocityDef } from '@pierre/ecs/modules/transform';

const motion = makeVelocityIntegrationSystem<GameTickCtx>({
  boundary: { mode: 'wrap', bounds: { width: 800, height: 600 } },
  onMove(ctx, id, prev, next) {
    // Keep a HashGrid2D in sync with the integrated position.
    const p = cellOfPoint(prev.x, prev.y);
    const n = cellOfPoint(next.x, next.y);
    if (p.x !== n.x || p.y !== n.y)
      ctx.grid.move(id, p, n);
  },
});

scheduler.add(motion);
```

## Vector helpers

Pure, allocation-returning 2D vector utilities. No ECS coupling — they
operate on bare `(x, y)` number pairs so they work for velocities,
steering deltas, input axes, or any direction vector.

```ts
interface Vec2 { x: number; y: number }

function normalize(x: number, y: number): Vec2;            // unit vector; (0,0) → (0,0)
function scaleToSpeed(x: number, y: number, speed: number): Vec2; // length === speed; (0,0) → (0,0)
function moveToward(current: Vec2, target: Vec2, delta: number): Vec2; // ≤ delta toward target; never overshoots
```

`scaleToSpeed` is the canonical "normalize then multiply" used to drive a
body at a fixed speed from an arbitrary direction — a WASD input axis
(diagonals don't go faster), a seek/steer delta toward a target, or a
reflected ball velocity. A zero-length input has no direction, so both
`normalize` and `scaleToSpeed` return `{ x: 0, y: 0 }` instead of `NaN`;
supply a fallback direction yourself if you need one.

`moveToward` is the constant-speed step toward a point: it advances at most
`delta` along the straight line and lands *exactly* on the target rather than
stepping past it, so a repeated call converges and stays. A non-positive
`delta` returns the current position unchanged.

Canon: Unity `Vector2.normalized` / `Vector2.MoveTowards`, Godot
`Vector2.normalized()` / `limit_length()` / `move_toward()`, Bevy
`Vec2::normalize_or_zero`, Unreal `FMath::VInterpConstantTo`.

```ts
import { moveToward, scaleToSpeed } from '@pierre/ecs/modules/motion';

const v = scaleToSpeed(dx, dy, PLAYER_SPEED);
vel.vx = v.x;
vel.vy = v.y;

const next = moveToward({ x: pos.x, y: pos.y }, waypoint, CHASE_SPEED * dtSeconds);
pos.x = next.x;
pos.y = next.y;
```

## Scope

- Depends on `@pierre/ecs/modules/transform` (`PositionDef`, `VelocityDef`).
- `bounds.width` and `bounds.height` must be positive (`> 0`). Zero or
  negative bounds produce `NaN` positions under `wrap` and are not
  validated at runtime — caller responsibility.
- 2D only — angle (`RotationDef`) is not integrated here. No engine ships
  angular-velocity integration as a standalone ECS component, so canon gives a
  function and not a shape; a rotation-rate component ships in the game until a
  second consumer converges on one.
- No acceleration term, gravity, or collision — those belong in
  `modules/kinematics`.
- The 3D sibling `vec3MoveToward` ships in `@pierre/ecs/modules/math-3d`; the
  two must agree on every degenerate case.
- `onMove` is the only extension point. Games that need per-entity
  enable/disable either remove the `VelocityDef` component or set
  `(vx, vy)` to `(0, 0)`.
