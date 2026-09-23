# `@pierre/ecs/modules/motion-3d`

3D velocity integrator — the 3D sibling of `@pierre/ecs/modules/motion`. Each
tick, `pos += vel · dt`. Optional boundary handling (wrap / clamp) and an
`onMove` hook so games that keep a separate spatial index or dirty-flag queue
can stay in sync without the motion module owning either.

Canon pattern: Bevy `bevy_transform` motion systems, Godot `_physics_process`
velocity integration, Unity DOTS `TransformSystemGroup`. Not a full physics
module — for gravity + collision + grounded, see
`@pierre/ecs/modules/kinematics-3d`.

## API

```ts
interface Bounds3D { width: number; height: number; depth: number }

type VelocityIntegration3DBoundary =
  | { mode: 'wrap';  bounds: Bounds3D }   // toroidal, range [0, w) × [0, h) × [0, d)
  | { mode: 'clamp'; bounds: Bounds3D };  // pinned,   range [0, w] × [0, h] × [0, d]

interface VelocityIntegration3DTickCtx {
  dtMs: number;
  world: EcsWorld;
}

interface VelocityIntegration3DOptions<TCtx extends VelocityIntegration3DTickCtx> {
  name?: string;
  runAfter?: string[];
  boundary?: VelocityIntegration3DBoundary;
  tag?: TagDef; // integrate only entities carrying this tag (Bevy `With<T>`)
  onMove?: (
    ctx: TCtx,
    id: EntityId,
    prev: Readonly<Position3D>,
    next: Readonly<Position3D>,
  ) => void;
}

function makeVelocityIntegration3DSystem<TCtx extends VelocityIntegration3DTickCtx>(
  options?: VelocityIntegration3DOptions<TCtx>,
): SchedulableSystem<TCtx>;
```

Iterates every entity that has both `Velocity3DDef` and `Position3DDef`. Skips
entities whose `(vx, vy, vz)` is `(0, 0, 0)` and entities whose final position
equals their prior position (after boundary handling) to avoid waking
downstream observers for no-op updates.

## Usage

```ts
import { makeVelocityIntegration3DSystem } from '@pierre/ecs/modules/motion-3d';
import { Position3DDef, Velocity3DDef } from '@pierre/ecs/modules/transform-3d';

const motion = makeVelocityIntegration3DSystem<GameTickCtx>({
  boundary: { mode: 'wrap', bounds: { width: 200, height: 200, depth: 200 } },
});

scheduler.add(motion);
```

## Scope

**Dependencies:** consumes `Position3DDef` / `Velocity3DDef` from
`@pierre/ecs/modules/transform-3d`; no vector helpers are duplicated here —
`Vec3`, `vec3Normalize`, and `vec3ScaleToLength` live in
`@pierre/ecs/modules/math-3d`.

Plain velocity integration only, mirroring the 2D module: no acceleration or
forces (a rigid-body concern), no rotation integration, no gravity/collision.
Free-flight attitude control (rate-steered orientation + throttle) and
non-box (spherical) world bounds are deferred — see the `motion-3d` V2 entry in
[the module backlog](../../../docs/roadmap/ecs-module-backlog.md); they are
game-specific shapes, not engine-canon motion primitives.

A game that uses `modules/kinematics-3d` should not also run this integrator
over the same bodies — kinematics already integrates its velocity, so a global
motion pass would double-integrate. Pass `tag` to scope the integrator to a
disjoint marker set (e.g. `tag: ProjectileTag`) so both can coexist in one game
— the same marker/query-filter idiom as `kinematics-3d`'s `dynamicTag` and
Bevy's `With<T>`.
