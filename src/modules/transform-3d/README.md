# `@pierre/ecs/modules/transform-3d`

Canonical 3D transform primitives: position, velocity, rotation, scale — the
3D sibling of `@pierre/ecs/modules/transform`.
Canon pattern: Bevy `Transform`, Godot `Node3D`, Unity `Transform`.

## API

```ts
type Position3D = Vec3;                       // { x, y, z }
interface Velocity3D { vx: number; vy: number; vz: number }
type Rotation3D = Quat;                       // { w, x, y, z }, scalar-first
interface Scale3D { x: number; y: number; z: number }  // per-axis multiplier

const Position3DDef: ComponentDef<Position3D>;
const Velocity3DDef: ComponentDef<Velocity3D>;
const Rotation3DDef: ComponentDef<Rotation3D>;
const Scale3DDef: ComponentDef<Scale3D>;
```

`Position3D` and `Rotation3D` reuse `Vec3` and `Quat` from
`@pierre/ecs/modules/math` (type-only dependency — the only module this one
imports from), so the vector and quaternion helpers there apply directly.
`Rotation3D`'s conventional default is `QUAT_IDENTITY`; an entity without the
component is unrotated, and one without `Scale3D` renders at 1:1.

Data-only module. No systems. A velocity integrator ships separately in
`@pierre/ecs/modules/motion-3d` so games that only need static positions don't
carry motion logic.

## Usage

```ts
import { Position3DDef, Velocity3DDef } from '@pierre/ecs/modules/transform-3d';

const id = world.createEntity();
world.getStore(Position3DDef).set(id, { x: 0, y: 0, z: 0 });
world.getStore(Velocity3DDef).set(id, { vx: 1, vy: 0, vz: 0 });
```

## Scope

The component set mirrors the 2D `modules/transform` so the two dimensions read
the same. The one deliberate 2D→3D difference is rotation: 2D stores a scalar
`angle` in radians, 3D stores a quaternion (`Quat`, scalar `w` first) to carry a
3-axis attitude without gimbal lock.

Numeric fields use the `number` (f64) schema type — matching the 3D siblings
`collision-3d` / `kinematics-3d` and the values the consumers already stored,
not the 2D `transform`'s space-optimised `f32`. This keeps the four migrated
consumers a lossless drop-in.

Anchor convention: position is the entity's world-space origin. Shape
components (`ShapeAabb3Def`, `ShapeSphere3Def` from
`@pierre/ecs/modules/collision-3d`) anchor on it as the shape **centre** with
full extents — the deliberate contrast with the 2D top-left AABB anchor.
