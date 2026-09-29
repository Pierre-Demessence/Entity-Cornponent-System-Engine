# Plan — `modules/camera-3d`: lens, projection, frustum and camera rigs

The 3D sibling of `modules/camera`. Backlog entry: `modules/camera-3d` —
"Projection (perspective + ortho), frustum, view matrix, and the rig family —
first-person look, orbit, third-person chase (smoothed, slerped)", **ready**,
gate "Scheduling — build slot". This plan is that build slot.

## What the module is, and what it is not

**Is:** the engine-side description of a 3D camera and the math around it. A
`Camera3D` component holds the lens (projection kind, field of view, clip
planes, viewport); the camera entity's pose is its `Position3D` + `Rotation3D`
from `transform-3d`. Pure functions turn that into view / projection matrices,
project and unproject points, cast a ray through a screen pixel, and build and
test a frustum. A family of rigs — first-person, orbit, chase — computes the
pose each frame, with frame-rate-independent smoothing.

**Is not:** a renderer camera. It holds no `THREE.PerspectiveCamera`, imports
no `three`, and never draws. The consumer copies pose and lens onto whatever
backend camera it owns — the same boundary `render-scene3d` draws around the
scene graph.

**Is not** the portal's virtual camera, the oblique near-plane clip, or render
targets. Those are `modules/render-target` (its own ready entry) and the portal
example.

## Dual-sided verification

**Engine — ABSENT.**

- `src/modules/camera/` is 2D only (`Camera` = `x`, `y`, `zoom`, `limit*`,
  `worldToView` / `viewToWorld`); no 3D camera, lens or frustum symbol exists in
  `src/`.
- `src/modules/math/` has `Vec3` and `Quat` (`quatForward` = local `-Z`,
  right-handed — the three.js convention) and **no matrix type**. Projection,
  view and frustum extraction all need a 4×4 matrix.
- PRESENT and reused:
  - `transform-3d` — `Position3DDef`, `Rotation3DDef` (a `Quat`) for the camera
    pose.
  - `math` — `lerp`, `clamp`, `degToRad`, `quatSlerp`, `quatFromAxisAngle`,
    `quatMul`, `quatRotate`, `vec3*`.
  - `collision-3d` — `Plane3` (`normal·p + constant = 0`, the three.js / Godot
    layout), `Aabb3`, `plane3DistanceToPoint`. A frustum is six `Plane3`s.
    `aabb3VsPlane3` / `sphere3VsPlane3` test *straddling*, not *which side*,
    so the frustum's half-space tests are its own.
  - `input` — `MouseLookProvider` already emits yaw / pitch deltas in radians
    and deliberately "does not own yaw / pitch — clamping, sign conventions and
    camera semantics stay with the consumer". The first-person rig is that
    consumer-side half.

**Consumers — four examples, three rig shapes, each hand-rolled.**

- **First-person look (2 copies).** `doom` and `portal` both keep `yaw` /
  `pitch` on `GameState`, clamp pitch to a `MAX_PITCH = π/2 − 0.04` constant
  they each declare (`doom/src/game.ts:50`, `portal/src/game.ts:76`), apply
  mouse-look deltas with the same two lines (`doom/src/main.ts:117-118`,
  `portal/src/main.ts:106-107`), and pose the camera at the player's eye with
  `rotation.order = 'YXZ'` + `rotation.set(pitch, yaw, 0)`
  (`doom/src/render.ts:205-212`, `portal/src/render.ts:541-548`).
- **Orbit (1 copy).** `platformer-3d` orbits the player at `cameraYaw`, fixed
  distance and height, lerps position by a per-frame constant (`CAMERA_LERP =
  0.12`) and `lookAt`s a point above the target
  (`platformer-3d/src/render.ts:84-99`). Pitch is fixed; no distance limits.
- **Chase (1 copy).** `starfighter` trails a point behind and above the ship in
  the **ship's local frame**, lerps position and slerps orientation toward the
  ship's with per-frame constants (`CAMERA_POS_LERP`, `CAMERA_ROT_LERP`), so the
  camera banks with roll (`starfighter/src/render.ts:157-181`).
- **Every smoothing constant is per-frame.** All three smoothed rigs use
  `x += (target − x) · k` each render frame, so they converge faster on a
  144 Hz display than on a 60 Hz one. `modules/camera` V2 already fixed this for
  2D (`smoothing` per second, needs `dtMs`); the 3D rigs adopt the same rule.
- **Lens is always perspective, declared four times** with a literal FOV in
  degrees (`75`, `60`, `75`, `65`), near/far clip, and a resize handler that
  rewrites `aspect` and calls `updateProjectionMatrix()`.
- **No example projects, unprojects, casts a screen ray or frustum-culls
  today.** three.js does its own culling, and aiming is centre-screen. These
  operations ship on canon alone (see below); the rigs are what the examples
  prove.

**Canon (load-bearing for the lens / projection / frustum half) — VERIFIED
against current docs.**

- Godot `Camera3D`: `projection` (perspective / orthogonal / frustum), `fov`
  (degrees; vertical under `KEEP_HEIGHT`), `size` (the **full** width or height
  in metres, per `keep_aspect`), `near`, `far`; `project_position`,
  `unproject_position`, `project_ray_origin` / `project_ray_normal`,
  `is_position_behind`, `is_position_in_frustum`, `get_frustum`.
- Unity `Camera`: `fieldOfView` (vertical, degrees), `orthographic`,
  `orthographicSize` (**half**-size), `nearClipPlane` / `farClipPlane`,
  `WorldToScreenPoint`, `ScreenToWorldPoint`, `ScreenPointToRay`,
  `projectionMatrix`, `worldToCameraMatrix`, `CalculateFrustumCorners`;
  `GeometryUtility.CalculateFrustumPlanes` / `TestPlanesAABB`.
- Bevy: `Camera3d`, `Projection` (perspective / orthographic), a `Frustum`
  component required by `Camera`; `Camera::world_to_viewport`,
  `viewport_to_world` (returns a ray), `world_to_ndc` / `ndc_to_world`. Bevy's
  NDC depth is `[0, 1]` with reversed z (1 at near) — unlike WebGL.
- three.js `Frustum`: `setFromProjectionMatrix`, `containsPoint`,
  `intersectsBox`, `intersectsSphere`. Neither three.js nor Unity documents a
  plane order, so this module fixes its own and states it.

**Rig canon (corroborating — the examples already carry the rig shapes) —
VERIFIED.** Cinemachine 3: `CinemachinePanTilt` (input-driven pan / tilt —
first-person), `CinemachineOrbitalFollow` (orbit around the tracking target,
input-driven), `CinemachineThirdPersonFollow` (constant position and distance
relative to the target — chase). All three take their target as a
"tracking target", not an owned reference.

## Decision record

**Decision.** Ship `src/modules/camera-3d/` with a lens component that reads
its pose from `transform-3d`, a 4×4 matrix type added to `modules/math`,
projection / unprojection / ray / frustum functions, and three rigs (component
state + pure pose function + one system), all smoothing per second. Adopt the
rigs in all four 3D examples in the same commit.

**Options considered.**

1. *Pose fields on `Camera3D` itself* (the 2D `Camera` stores `x` / `y`).
   Rejected. Every 3D canon puts the camera's pose on the node / entity
   transform (Godot `Node3D`, Bevy `Transform`, Unity `Transform`), and
   `transform-3d` already ships `Position3D` + `Rotation3D`. Duplicating them
   would give the camera two poses to keep in sync. The pure functions take a
   plain `{ position, rotation }` pose, so a consumer that keeps its camera off
   the world still calls them.
2. *Keep matrix math private inside `camera-3d`.* Rejected. A 4×4 matrix is a
   standard math primitive, and `render-target`, the portal's `viewXform`
   chain and any future `render-webgl` all need the same one. It goes in
   `modules/math` as `mat4.ts`, next to `vec3.ts` / `quat.ts`.
3. *Rigs as pure functions only, with no components or systems.* Rejected as
   the whole surface, kept as its base layer. `modules/camera` ships
   `makeFollowCameraSystem` with tag-based targeting, and Cinemachine's rigs are
   components. The pure pose functions stay exported so a consumer can drive a
   rig without the system.
4. *Target a rig by `EntityId` stored in the rig component.* Rejected. Stored
   entity references break on save / load until `ecs-entity-id-remapping`
   lands. The rigs select the target by tag, like the 2D follow system does.
5. **Chosen:** lens + math + frustum + rigs, as above.

**Conventions (fixed here, stated in the README).**

- Right-handed, camera looks down local `-Z`, `+Y` up — matches `quatForward`
  and three.js.
- **Angles in radians** (`fovY` is the vertical field of view), consistent
  with every angle in `math`. three.js takes degrees; the README's three.js
  bridge snippet converts with `radToDeg`.
- Orthographic size is the **half-height** of the view in world units (Unity
  `orthographicSize`). Godot `size` is the full height; the README names the
  difference.
- Clip space is the WebGL / three.js one: NDC `z ∈ [-1, 1]`. A WebGPU backend
  (`[0, 1]`) is out of scope until one exists.
- `Mat4` is a column-major `number[16]` — the WebGL / three.js
  `Matrix4.elements` layout, so `projectionMatrix.fromArray(m)` works with no
  transposing.
- Screen coordinates are pixels from the top-left, like `modules/camera` and
  `projectPointer`.

**Boundaries drawn deliberately.**

- **No backend camera.** The module never touches `THREE.Camera`. The README
  shows the three-line copy (position, quaternion, fov / near / far / aspect)
  into a `PerspectiveCamera`.
- **No resize listener.** `viewportW` / `viewportH` are fields the consumer
  updates, as in `modules/camera`.
- **No collision-aware camera** (spring arm / wall pull-in). Godot
  `SpringArm3D` and Cinemachine's `Deoccluder` are canon, but they need a
  raycast against the consumer's world. Deferred to its own backlog entry,
  gated on a consumer whose camera clips through walls.
- **No camera shake, no blending between cameras, no multiple active-camera
  priority** (Cinemachine brain). Each is its own canon subsystem; logged as
  backlog entries, not built here.
- **Audio listener stays 2D.** `AudioListener` is `{ x, y }`; the 3D listener is
  the separate `modules/audio` V3 entry. The README notes that the camera pose is
  its natural input.

## API (proposed — names settle in implementation)

```ts
// modules/math — mat4.ts
type Mat4 = number[]; // length 16, column-major
function mat4Identity(): Mat4;
function mat4Multiply(a: Mat4, b: Mat4): Mat4;
function mat4Invert(m: Mat4): Mat4 | null;
function mat4FromRotationTranslation(q: Quat, t: Vec3): Mat4;
function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4;
function mat4Orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4;
function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4;
function mat4TransformPoint(m: Mat4, p: Vec3): Vec3; // with perspective divide

// modules/camera-3d — camera3d.ts
interface Camera3D {
  projection: 'perspective' | 'orthographic';
  fovY: number;        // radians, perspective only
  orthoSize: number;   // half-height in world units, orthographic only
  near: number;
  far: number;
  viewportW: number;   // pixels
  viewportH: number;
}
const Camera3DDef: ComponentDef<Camera3D>;
function makeCamera3D(options: Partial<Camera3D> & { viewportW: number; viewportH: number }): Camera3D;

interface CameraPose { position: Vec3; rotation: Quat }

function camera3DAspect(cam: Camera3D): number;
function camera3DProjectionMatrix(cam: Camera3D): Mat4;
function camera3DViewMatrix(pose: CameraPose): Mat4;          // inverse of the pose
function camera3DViewProjection(cam: Camera3D, pose: CameraPose): Mat4;

// projection — screen pixels, top-left origin
function worldToScreen(p: Vec3, cam: Camera3D, pose: CameraPose): { x: number; y: number; depth: number } | null; // null behind the camera
function screenToWorld(x: number, y: number, depth: number, cam: Camera3D, pose: CameraPose): Vec3;
function screenPointToRay(x: number, y: number, cam: Camera3D, pose: CameraPose): { origin: Vec3; dir: Vec3 };
function isPointBehindCamera(p: Vec3, pose: CameraPose): boolean;

// frustum.ts
type Frustum = readonly [Plane3, Plane3, Plane3, Plane3, Plane3, Plane3]; // left, right, bottom, top, near, far
function frustumFromMatrix(viewProjection: Mat4): Frustum;
function camera3DFrustum(cam: Camera3D, pose: CameraPose): Frustum;
function frustumContainsPoint(f: Frustum, p: Vec3): boolean;
function frustumIntersectsSphere(f: Frustum, center: Vec3, radius: number): boolean;
function frustumIntersectsAabb(f: Frustum, box: Aabb3): boolean;
function frustumCorners(cam: Camera3D, pose: CameraPose): Vec3[]; // 8 corners, near then far

// rigs.ts — pure pose functions
function firstPersonRotation(yaw: number, pitch: number): Quat; // YXZ order, what doom/portal use
function orbitPose(target: Vec3, yaw: number, pitch: number, distance: number): CameraPose; // looks at target
function chasePose(targetPos: Vec3, targetRot: Quat, offset: Vec3): CameraPose; // offset in target's local frame
function lookRotation(from: Vec3, to: Vec3, up?: Vec3): Quat;
function dampPose(current: CameraPose, desired: CameraPose, posSmoothing: number, rotSmoothing: number, dtMs: number): CameraPose; // 1 − e^(−k·dt), lerp + slerp

// rig components (flat numeric fields → simpleComponent) + one system
const FirstPersonRigDef: ComponentDef<{ yaw; pitch; minPitch; maxPitch; eyeOffsetY }>;
const OrbitRigDef: ComponentDef<{ yaw; pitch; distance; minPitch; maxPitch; minDistance; maxDistance; targetOffsetY; smoothing }>;
const ChaseRigDef: ComponentDef<{ offsetX; offsetY; offsetZ; posSmoothing; rotSmoothing }>;
function addLookDelta(rig: { yaw: number; pitch: number; minPitch: number; maxPitch: number }, dx: number, dy: number): void; // MouseLookProvider → rig, clamped

function makeCameraRigSystem<TCtx extends { world: EcsWorld; dtMs?: number }>(options: {
  cameraTag: TagDef;
  targetTag: TagDef;
  name?: string;
  runAfter?: string[];
}): SchedulableSystem<TCtx>; // writes the camera entity's Position3D + Rotation3D
```

`chasePose` reads the target's `Rotation3D`; first-person and orbit read only
its `Position3D`. A camera entity carries exactly one rig component; the system
treats more than one as a configuration error (throw on first run, matching
how core reports misconfiguration).

**Module dependencies (declared in the README):** `math`, `transform-3d`,
`collision-3d` (`Plane3` / `Aabb3` types and the plane tests). No `three`, no
`input` import — `addLookDelta` takes plain numbers, so `MouseLookProvider`
feeds it without coupling the modules.

## Resolved questions

- [x] **`Mat4` placement** — in `modules/math` as `mat4.ts`, built within this
      plan (no separate `mat4` plan first).
- [x] **Rig systems in V1** — components + `makeCameraRigSystem` ship now; doom
      and portal move yaw / pitch off `GameState` onto a camera entity as part
      of adoption.
- [x] **Frustum dependency on `collision-3d`** — reuse `Plane3` / `Aabb3`; the
      dependency is declared in the module README.

## Tasks

- [x] Verify the canon citations above against current docs; drop any that do
      not check out. (Dropped `smooth-bevy-cameras`, unverified; corrected
      Godot `size` to full extent.)
- [x] `src/modules/math/mat4.ts` + `mat4.test.ts` — the `Mat4` surface above;
      tests pin column-major layout against known three.js matrices (literal
      expected arrays), invert round-trip, perspective / ortho corner mapping to
      NDC `±1`. Export from `math/index.ts`; update the math README.
- [x] `src/modules/camera-3d/camera3d.ts` — `Camera3D`, `Camera3DDef`,
      `makeCamera3D`, aspect / projection / view / view-projection.
- [x] `src/modules/camera-3d/project.ts` — `worldToScreen`, `screenToWorld`,
      `screenPointToRay`, `isPointBehindCamera`.
- [x] `src/modules/camera-3d/frustum.ts` — `Frustum`, `frustumFromMatrix`
      (Gribb–Hartmann plane extraction, normalised), `camera3DFrustum`,
      containment and intersection tests, `frustumCorners`.
- [x] `src/modules/camera-3d/rigs.ts` — pose functions, `lookRotation`,
      `dampPose`, rig components, `addLookDelta`, `makeCameraRigSystem`.
- [x] `src/modules/camera-3d/index.ts` — barrel.
- [x] Tests alongside each file, proving:
  - [x] `worldToScreen` ∘ `screenToWorld` round-trips for perspective and
        orthographic, at several depths; screen centre maps to the forward
        axis; a point behind the camera yields `null`.
  - [x] `screenPointToRay` through the centre equals `quatForward(rotation)`;
        orthographic rays are parallel with offset origins.
  - [x] frustum: a point / sphere / AABB just inside and just outside each of
        the six planes; an AABB straddling a plane counts as intersecting.
  - [x] `firstPersonRotation(yaw, pitch)` matches three.js `YXZ` Euler output
        for the same angles (literal expected quaternions); `addLookDelta`
        clamps pitch.
  - [x] `orbitPose` keeps `distance` to the target and faces it; `chasePose`
        places the camera in the target's local frame and follows its roll.
  - [x] `dampPose` is frame-rate independent: one 32 ms step equals two 16 ms
        steps (within ε); `smoothing` omitted snaps.
  - [x] `makeCameraRigSystem` writes the camera's `Position3D` / `Rotation3D`
        for each rig kind; no target → camera untouched; two rigs on one
        camera throw.
- [x] `src/modules/camera-3d/README.md` — API, conventions (handedness, radians,
      half-height ortho, NDC range, matrix layout), the three.js bridge snippet,
      "not included (by design)". Consumer-facing tone per `AGENTS.md`: no
      canon / consumer-count language. Keep samples type-checkable
      (`scripts/doc-samples.test.ts`); the bridge snippet uses a structural
      fake camera, since the engine cannot import `three`.
- [x] Adopt in doom — first-person rig on a camera entity; `MouseLookProvider`
      feeds `addLookDelta`; delete `MAX_PITCH`, `state.yaw` / `state.pitch`
      (movement reads the rig's yaw); render copies pose + lens to the three.js
      camera.
- [x] Adopt in portal — same as doom. The virtual portal camera keeps its own
      matrix chain (render-target territory) but copies the lens's projection
      matrix from `camera3DProjectionMatrix`.
- [x] Adopt in platformer-3d — orbit rig; delete `CAMERA_LERP` and the manual
      lerp / `lookAt`, converting the per-frame constant to a per-second
      `smoothing` that feels the same at 60 Hz.
- [x] Adopt in starfighter — chase rig; delete `CAMERA_POS_LERP` /
      `CAMERA_ROT_LERP` and the manual lerp / slerp; same per-second
      conversion.
- [x] `scripts/manual.ts` — add `camera-3d` to the category that holds `camera`,
      exactly once.
- [x] `npm run docs:api` and `npm run docs:usage`.
- [x] `docs/roadmap/ecs-module-backlog.md` — delete the `modules/camera-3d`
      entry and its status-table row. In the same edit, add entries for the
      deferred pieces: collision-aware camera (spring arm), camera shake, camera
      blending / active-camera priority, WebGPU `[0, 1]` depth range.
- [x] `website/manual/getting-started/examples.md` — add `camera-3d` to the four
      3D examples' "Exercises" lists.
- [x] Gate green: lint, typecheck, `npm test`, every example typechecks; each
      3D example smoke-run in a browser (look, orbit, chase feel unchanged at
      60 Hz) with no console errors.
- [x] Peer review (subagent, no edits, no `askQuestions`) and fix what it finds.
- [x] Move this plan to `docs/plans/done/` in the same commit.

## Implementation notes

- **`quatLookRotation(forward, up?)` joined `modules/math`.** The orbit rig
  faces its focus point; a look rotation is a math primitive (Unity's
  `Quaternion.LookRotation`, aiming `-Z` here), not a camera one.
- **Final rig surface:** `firstPersonForward` (replaces the `forwardVec` copies
  in doom and portal), `smoothingBlend`, `addOrbitZoom`,
  `CAMERA_RIG_MAX_PITCH`, `getCameraPose`; the first tick of a smoothed rig
  snaps.
- **The rig system runs per render frame** in every example, with the frame's
  `deltaMs` — once per logic tick would add a tick of mouse-look latency and
  step the smoothing at the tick rate.
- **starfighter's attitude moved from `GameState.orientation` to the ship's
  `Rotation3D`**, which the chase rig reads. The ship is not drawn through
  `render-scene3d`, so this does not trigger that module's deferred pose copier.
- **The `Camera3D` lens is authoritative for aspect** in all four examples;
  each `Renderer3D.resize` now resizes only the drawing buffer, and starfighter
  (the one responsive example) updates the lens through `resizeView`.

`package.json` needs no change: `"./modules/*"` already publishes the subpath.

## What this deliberately leaves open

- **Spring arm / camera collision** — needs a consumer whose camera clips
  through geometry.
- **Camera shake, camera blending, active-camera priority** — separate canon
  subsystems, each its own backlog entry.
- **Oblique near-plane clipping and render-to-texture** — `modules/render-target`
  and the portal example.
- **3D audio listener** — `modules/audio` V3.
- **WebGPU depth range** — lands with a WebGPU backend.
