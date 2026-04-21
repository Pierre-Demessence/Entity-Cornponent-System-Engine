# `@pierre/ecs/modules/motion`

2D velocity integrator: each tick, `pos += vel · dt`. Optional boundary
handling (wrap / clamp) and an `onMove` hook so games that keep a
separate spatial index or dirty-flag queue can stay in sync without the
motion module owning either.

Canon pattern: Bevy `bevy_transform` motion systems, Godot
`_physics_process` velocity integration, Unity DOTS
`TransformSystemGroup`. Not a full physics module — for gravity +
collision + grounded, see `@pierre/ecs/modules/kinematics` (M4, ships
later).

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

## Scope

- Depends on `@pierre/ecs/modules/transform` (`PositionDef`, `VelocityDef`).
- `bounds.width` and `bounds.height` must be positive (`> 0`). Zero or
  negative bounds produce `NaN` positions under `wrap` and are not
  validated at runtime — caller responsibility.
- 2D only — angle (`RotationDef`) is not integrated here. Games that want
  a rotation-rate component can ship their own `AngularVelocity` system;
  promotion into this module follows the Path-A rule of three.
- No acceleration term, gravity, or collision — those belong in
  `modules/kinematics` (M4).
- `onMove` is the only extension point. Games that need per-entity
  enable/disable either remove the `VelocityDef` component or set
  `(vx, vy)` to `(0, 0)`.
