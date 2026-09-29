# `@pierre/ecs/modules/camera-3d`

A 3D camera for the world: a lens component, the matrices and screen ↔ world
conversions built from it, a view frustum for visibility tests, and three camera
rigs — first-person, orbit and chase — driven by one system. Coming from Godot,
`Camera3D` plus the rig system cover what a `Camera3D` node and a small follow
script do; coming from Unity, the rigs map to Cinemachine's pan-tilt, orbital
follow and third-person follow.

The module describes the camera; it does not draw. Your renderer keeps its own
camera object (a three.js `PerspectiveCamera`, say) and copies the pose and lens
onto it each frame — see [Driving three.js](#driving-threejs).

## The lens and the pose

A camera entity carries a `Camera3D` for the lens, and its pose — where it
stands and which way it faces — lives in the entity's `Position3D` and
`Rotation3D` from [`modules/transform-3d`](../transform-3d/README.md). The rig
system writes those two components; you can also write them yourself.

```ts
type Camera3DProjection = 'perspective' | 'orthographic';

interface Camera3D {
  projection: Camera3DProjection;
  fovY: number;      // vertical field of view, radians (perspective)
  orthoSize: number; // half the view height, world units (orthographic)
  near: number;      // clip distances in front of the camera
  far: number;
  viewportW: number; // pixels
  viewportH: number;
}

const Camera3DDef: ComponentDef<Camera3D>;
function makeCamera3D(options: Partial<Camera3D> & { viewportW: number; viewportH: number }): Camera3D;
// defaults: perspective, fovY 60°, near 0.1, far 1000, orthoSize 5

interface CameraPose { position: Vec3; rotation: Quat }
function getCameraPose(world: EcsWorld, entity: EntityId): CameraPose;

function camera3DAspect(cam: Camera3D): number;                        // viewportW / viewportH
function camera3DProjectionMatrix(cam: Camera3D): Mat4;
function camera3DViewMatrix(pose: CameraPose): Mat4;                   // world → camera
function camera3DViewProjection(cam: Camera3D, pose: CameraPose): Mat4;
```

Every function takes a plain `CameraPose`, so a camera that lives outside the
world works too. `getCameraPose` reads one from an entity, treating a missing
`Rotation3D` as unrotated.

## Screen and world

```ts
interface ScreenPoint { x: number; y: number; depth: number }
interface Ray3 { origin: Vec3; dir: Vec3 }

function worldToScreen(p: Vec3, cam: Camera3D, pose: CameraPose): ScreenPoint | null;
function screenToWorld(x: number, y: number, depth: number, cam: Camera3D, pose: CameraPose): Vec3;
function screenPointToRay(x: number, y: number, cam: Camera3D, pose: CameraPose): Ray3;
function isPointBehindCamera(p: Vec3, pose: CameraPose): boolean;
```

- Screen coordinates are **pixels from the viewport's top-left, `y` down** —
  the same space as [`projectPointer`](../input/README.md) in
  `modules/input`.
- `depth` is the distance in front of the camera along its view axis.
  `worldToScreen` returns `null` for a point on or behind the camera plane;
  anything in front projects, even off-screen or past the clip planes.
- `screenPointToRay` is for picking and aiming: feed its `origin` and `dir` to
  [`modules/collision-3d`](../collision-3d/README.md)'s `rayVsAabb3` /
  `rayVsObb3` / `rayVsPlane3`. A perspective ray starts at the camera; an
  orthographic one starts on the near plane, and rays through different pixels
  are parallel.

## Frustum

```ts
type Frustum = readonly [Plane3, Plane3, Plane3, Plane3, Plane3, Plane3];
// left, right, bottom, top, near, far — unit normals pointing inward

function camera3DFrustum(cam: Camera3D, pose: CameraPose): Frustum;
function frustumFromMatrix(viewProjection: Mat4): Frustum;
function frustumContainsPoint(frustum: Frustum, p: Vec3): boolean;
function frustumIntersectsSphere(frustum: Frustum, center: Vec3, radius: number): boolean;
function frustumIntersectsAabb(frustum: Frustum, box: Aabb3): boolean;
function frustumCorners(cam: Camera3D, pose: CameraPose): Vec3[]; // near TL, TR, BR, BL, then far
```

Use it for gameplay visibility — "can the player see this spawn point?", "is
this enemy on screen?" — or to cull work before it reaches the renderer. The
sphere and box tests are conservative: something just past a frustum corner can
report `true`, never the reverse. Build the frustum once per frame and test many
things against it.

## Rigs

A rig is a component on the camera entity holding the rig's state. One system
poses every tagged camera from its rig, relative to a tagged target.

| Rig | Camera | Reads from the target |
| --- | --- | --- |
| `FirstPersonRig` | at the target plus `eyeHeight`, rotated by `yaw` / `pitch` | `Position3D` |
| `OrbitRig` | `distance` from a point `targetOffsetY` above the target, placed by `yaw` / `pitch`, always looking at it | `Position3D` |
| `ChaseRig` | at `(offsetX, offsetY, offsetZ)` in the target's own axes, sharing its rotation — it banks and pitches with it | `Position3D`, `Rotation3D` |

```ts
interface FirstPersonRig { yaw; pitch; minPitch; maxPitch; eyeHeight }
interface OrbitRig { yaw; pitch; minPitch; maxPitch; distance; minDistance; maxDistance; targetOffsetY; smoothing }
interface ChaseRig { offsetX; offsetY; offsetZ; positionSmoothing; rotationSmoothing }

const FirstPersonRigDef, OrbitRigDef, ChaseRigDef;
function makeFirstPersonRig(options?: Partial<FirstPersonRig>): FirstPersonRig;
function makeOrbitRig(options?: Partial<OrbitRig>): OrbitRig;
function makeChaseRig(options?: Partial<ChaseRig>): ChaseRig;
const CAMERA_RIG_MAX_PITCH: number; // default pitch limit, just short of straight up

function addLookDelta(rig: { yaw; pitch; minPitch; maxPitch }, dx: number, dy: number): void;
function addOrbitZoom(rig: OrbitRig, delta: number): void;

function makeCameraRigSystem<TCtx extends { world: EcsWorld; dtMs?: number }>(options: {
  cameraTag: TagDef;
  targetTag: TagDef;
  name?: string;      // default 'camera-rig'
  runAfter?: string[];
}): SchedulableSystem<TCtx>;
```

- **Yaw and pitch** are radians. `(0, 0)` looks down `-Z`; positive yaw turns
  left, positive pitch looks up (Euler order `YXZ`, no roll). `addLookDelta`
  takes the deltas [`MouseLookProvider`](../input/README.md) reports — pointer
  right turns right, pointer down looks down — and clamps pitch.
- **Smoothing** is a speed per second: each tick closes `1 − e^(−smoothing·dt)`
  of the gap, so the camera settles at the same rate at any frame rate. `0`
  snaps. It needs `dtMs` on the tick context; without it the rigs snap. The
  first tick always snaps, so a new camera does not sweep in from the origin.
- **Limits** — the system clamps pitch and orbit distance to the rig's limits
  when posing, without writing them back. `addLookDelta` and `addOrbitZoom`
  clamp the stored values, so input never winds up past a limit.
- **Targets** are found by tag: the first `targetTag` entity with a
  `Position3D`. With none, the tick does nothing.
- **One rig per camera.** A camera with two rig components throws — which rig
  won would otherwise depend on lookup order. A camera with none is skipped.
- Register only the rig components you use; the system looks up just the
  registered ones. `Position3D` and `Rotation3D` must be registered.

The pose functions behind the rigs are exported for code that runs its own
camera:

```ts
function firstPersonRotation(yaw: number, pitch: number): Quat;
function firstPersonForward(yaw: number, pitch: number): Vec3;  // the look direction
function orbitPose(target: Vec3, yaw: number, pitch: number, distance: number): CameraPose;
function chasePose(targetPosition: Vec3, targetRotation: Quat, offset: Vec3): CameraPose;
function dampPose(current: CameraPose, desired: CameraPose, smoothing: { position: number; rotation: number }, dtMs: number): CameraPose;
function smoothingBlend(smoothing: number, dtMs: number): number; // 1 − e^(−smoothing·dt)
```

`firstPersonForward` is also the aim direction for a first-person weapon: it is
exactly where the camera looks.

## Usage

```ts
import type { TagDef } from '@pierre/ecs';

import { EcsWorld } from '@pierre/ecs';
import {
  addLookDelta,
  Camera3DDef,
  FirstPersonRigDef,
  makeCamera3D,
  makeCameraRigSystem,
  makeFirstPersonRig,
} from '@pierre/ecs/modules/camera-3d';
import { Position3DDef, Rotation3DDef } from '@pierre/ecs/modules/transform-3d';

// Not 'camera3d' — tag names share the save namespace with component names.
const CameraTag: TagDef = { name: 'cameraEntity' };
const PlayerTag: TagDef = { name: 'player' };

const world = new EcsWorld();
world.registerComponent(Position3DDef);
world.registerComponent(Rotation3DDef);
world.registerComponent(Camera3DDef);
world.registerComponent(FirstPersonRigDef);
world.registerTag(CameraTag);
world.registerTag(PlayerTag);

const player = world.createEntity();
world.getStore(Position3DDef).set(player, { x: 0, y: 0, z: 0 });
world.getTag(PlayerTag).add(player);

const camera = world.createEntity();
world.getStore(Camera3DDef).set(camera, makeCamera3D({ viewportH: 720, viewportW: 1280 }));
world.getStore(FirstPersonRigDef).set(camera, makeFirstPersonRig({ eyeHeight: 1.6 }));
world.getTag(CameraTag).add(camera);

const rigSystem = makeCameraRigSystem<{ dtMs: number; world: EcsWorld }>({
  cameraTag: CameraTag,
  targetTag: PlayerTag,
});

// On mouse-look input:
addLookDelta(world.getStore(FirstPersonRigDef).get(camera)!, 0.01, -0.005);

// Each tick, after the player has moved:
rigSystem.run({ dtMs: 16, world });
```

Movement code reads the rig's `yaw` to walk where the player looks.

## Driving three.js

Copy the pose and lens onto the renderer's camera before drawing. three.js takes
its field of view in **degrees**:

```ts
import type { EcsWorld, EntityId } from '@pierre/ecs';

import { Camera3DDef, getCameraPose } from '@pierre/ecs/modules/camera-3d';
import { radToDeg } from '@pierre/ecs/modules/math';

// Stand-in for `THREE.PerspectiveCamera`.
interface PerspectiveCamera {
  aspect: number;
  far: number;
  fov: number;
  near: number;
  position: { set: (x: number, y: number, z: number) => void };
  quaternion: { set: (x: number, y: number, z: number, w: number) => void };
  updateProjectionMatrix: () => void;
}
declare const threeCamera: PerspectiveCamera;
declare const world: EcsWorld;
declare const camera: EntityId;

const lens = world.getStore(Camera3DDef).get(camera)!;
const { position: p, rotation: q } = getCameraPose(world, camera);
threeCamera.position.set(p.x, p.y, p.z);
threeCamera.quaternion.set(q.x, q.y, q.z, q.w); // three.js orders (x, y, z, w)
threeCamera.fov = radToDeg(lens.fovY);
threeCamera.aspect = lens.viewportW / lens.viewportH;
threeCamera.near = lens.near;
threeCamera.far = lens.far;
threeCamera.updateProjectionMatrix();
```

On resize, update `viewportW` / `viewportH` on the component; the copy above
carries the new aspect across. To hand three.js a matrix directly,
`camera3DProjectionMatrix` returns the same column-major layout as
`Matrix4.elements`, so `projectionMatrix.fromArray(m)` takes it as is.

## Conventions

- **Right-handed, `-Z` forward, `+Y` up** — the same as three.js and
  [`modules/math`](../math/README.md)'s `quatForward`. A port from a left-handed
  engine (Unity) needs a handedness mirror, not a sign flip.
- **Radians everywhere.** `fovY` is the vertical field of view; Godot and Unity
  show degrees in their editors.
- **`orthoSize` is the half-height**, like Unity's `orthographicSize`. Godot's
  `size` is the full height — halve it when porting.
- **Clip space is WebGL's**: NDC `x, y, z ∈ [-1, 1]`. WebGPU uses `[0, 1]` for
  depth.
- **Matrices are column-major `Mat4`s** from `modules/math`.

## Not included (by design)

- **A renderer camera.** No three.js import, no drawing, no resize listener —
  the consumer owns those and copies the pose across.
- **Camera collision** (a spring arm that pulls the camera in front of walls).
- **Camera shake, blending between cameras, and choosing the active camera by
  priority.**
- **Render-to-texture and oblique near-plane clipping** — portal-style views.
- **A 3D audio listener.** The camera pose is its natural input; `modules/audio`
  pans in 2D today.

## Dependencies

- [`modules/math`](../math/README.md) — `Vec3`, `Quat`, `Mat4` and their
  functions.
- [`modules/transform-3d`](../transform-3d/README.md) — `Position3D` and
  `Rotation3D` hold the camera's pose, and the target's.
- [`modules/collision-3d`](../collision-3d/README.md) — `Plane3` and `Aabb3`
  are the frustum's plane and box types, measured with `plane3DistanceToPoint`.
