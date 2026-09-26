# `@pierre/ecs/modules/transform`

Canonical 2D transform primitives: position, velocity, rotation, scale.

## API

```ts
interface Position { x: number; y: number }
interface Velocity { vx: number; vy: number }
interface Rotation { angle: number }  // radians
interface Scale    { x: number; y: number }  // multiplier per axis

const PositionDef:    ComponentDef<Position>;
const VelocityDef:    ComponentDef<Velocity>;
const RotationDef:    ComponentDef<Rotation>;
const ScaleDef: ComponentDef<Scale>;
```

`ScaleDef` is a geometric transform sibling to position/rotation.
`modules/render-canvas2d` reads it when drawing; non-render systems
(physics, AI vision) may read it if they need per-entity scaling.
Entities without the component render at 1:1.

Data-only module. No systems. A velocity integrator ships separately in
`@pierre/ecs/modules/motion` so games that only need static
positions don't carry motion logic. `VelocityDef` is the *data*; only the
integrator lives in `motion`. Whether the velocity data itself belongs here or
in `motion` is unsettled — if it moves, it moves for both `transform` and
`transform-3d` in one pass so the two dimensions stay aligned.

## Usage

```ts
import { PositionDef, VelocityDef } from '@pierre/ecs/modules/transform';

world.registerComponent(PositionDef);
world.registerComponent(VelocityDef);

const id = world.spawn({ name: 'blob' });
world.getStore(PositionDef).set(id, { x: 0, y: 0 });
world.getStore(VelocityDef).set(id, { vx: 1, vy: 0 });
```

## Scope

2D only. `angle` is a scalar in radians (no quaternions). For 3D, the
sibling `@pierre/ecs/modules/transform-3d` ships `Position3D` (`{x,y,z}`),
`Velocity3D`, a quaternion `Rotation3D`, and `Scale3D`. See
[docs/plans/ecs-2d-engine-modules.md](../../../../docs/plans/ecs-2d-engine-modules.md)
for the parallel-module strategy.

Anchor convention: position is the entity's world-space origin. Shape
components (`ShapeAabbDef`, `ShapeCircleDef` from
`@pierre/ecs/modules/collision`) interpret it per-shape; for AABB the
position is the top-left corner, for circle the center.
