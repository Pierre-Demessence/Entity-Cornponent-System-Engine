# `@pierre/ecs/modules/transform`

Canonical 2D transform primitives: position, velocity, rotation. Canon
pattern: Bevy `Transform`, Godot `Node2D`, Unity `Transform`, flecs
`flecs.components.transforms`.

## API

```ts
interface Position { x: number; y: number }
interface Velocity { vx: number; vy: number }
interface Rotation { angle: number }  // radians

const PositionDef: ComponentDef<Position>;
const VelocityDef: ComponentDef<Velocity>;
const RotationDef: ComponentDef<Rotation>;
```

Data-only module. No systems. A velocity integrator ships separately in
`@pierre/ecs/modules/motion` (M2) so games that only need static
positions don't carry motion logic.

## Usage

```ts
import { PositionDef, VelocityDef } from '@pierre/ecs/modules/transform';

const id = world.spawn();
world.getStore(PositionDef).set(id, { x: 0, y: 0 });
world.getStore(VelocityDef).set(id, { vx: 1, vy: 0 });
```

## Scope

2D only. `angle` is a scalar in radians (no quaternions). For 3D, a
sibling `@pierre/ecs/modules/transform-3d` will ship with `Position3D`
(`{x,y,z}`) and a quaternion `Rotation3D`. See
[docs/plans/ecs-2d-engine-modules.md](../../../../docs/plans/ecs-2d-engine-modules.md)
for the parallel-module strategy.

Anchor convention: position is the entity's world-space origin. Shape
components (`ShapeAabbDef`, `ShapeCircleDef` from
`@pierre/ecs/modules/collision`) interpret it per-shape; for AABB the
position is the top-left corner, for circle the center.
