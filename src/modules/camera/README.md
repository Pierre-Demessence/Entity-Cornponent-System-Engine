# `@pierre/ecs/modules/camera`

2D camera component, follow system, and world↔view transforms, modelled on
Godot `Camera2D` (zoom, offset, limits, smoothing, drag-margin deadzone). Canon
pattern: Bevy `Camera2dBundle`, Godot `Camera2D`, Phaser `Cameras`, Unity
`Camera` (orthographic 2D).

## API

```ts
interface Camera {
  x: number; // anchor centre, world coords
  y: number;
  viewportW: number; // viewport size, screen pixels
  viewportH: number;
  zoom: number; // magnification; screen = (world − topLeft) · zoom
  offsetX: number; // view shift from the anchor (Godot Camera2D.offset)
  offsetY: number;
  limitLeft: number; // world rect the view never shows past (Godot limit_*)
  limitTop: number;
  limitRight: number;
  limitBottom: number;
}

const CameraDef: ComponentDef<Camera>;
const CAMERA_NO_LIMIT: number; // large finite sentinel (JSON-safe, unlike Infinity)

// Construct with canonical defaults (zoom 1, no offset, no limits):
function makeCamera(options: {
  x: number; y: number; viewportW: number; viewportH: number;
  zoom?: number; offsetX?: number; offsetY?: number;
  limitLeft?: number; limitTop?: number; limitRight?: number; limitBottom?: number;
}): Camera;

// Zoom- and offset-aware transforms (vx/vy are screen pixels):
function worldToView(wx: number, wy: number, cam: Camera): { vx: number; vy: number };
function viewToWorld(vx: number, vy: number, cam: Camera): { wx: number; wy: number };

function cameraViewRect(cam: Camera): { x: number; y: number; w: number; h: number }; // world rect seen
function cameraToView(cam: Camera): { x: number; y: number; zoom: number };           // renderer input
function clampCameraToLimits(cam: Camera): void;                                       // enforce limit_*

interface CameraFollowTickCtx { world: EcsWorld; dtMs?: number }

interface CameraFollowOptions {
  cameraTag: TagDef;
  targetTag: TagDef;
  positionDef: ComponentDef<{ x: number; y: number }>;
  name?: string;
  runAfter?: string[];
  smoothing?: number; // exponential ease toward target (per second); needs ctx.dtMs
  deadzoneW?: number; // chase horizontally only once the target leaves this half-width
  deadzoneH?: number;
}

function makeFollowCameraSystem<TCtx extends CameraFollowTickCtx>(
  options: CameraFollowOptions,
): SchedulableSystem<TCtx>;
```

## Driving a renderer

`cameraToView(cam)` returns `{ x, y, zoom }` — the viewport's top-left in world
coords plus zoom — which is exactly the `view` shape
[`modules/render-canvas2d`](../render-canvas2d/README.md) consumes. This keeps
the renderer **decoupled** from this module: it never imports `camera`, it just
takes a plain view transform.

```ts
renderer.render({ atlases, ctx2d, world, view: cameraToView(cam) });
```

For zoom-aware **pointer picking**, `viewToWorld(screenX, screenY, cam)` is the
canonical unproject (replaces hand-rolled `(px − tx) / zoom`).

## Units

- `cam.x, cam.y` is the **anchor centre** of the view in world coords
  (Bevy/Godot convention, not top-left). `offsetX/Y` shift the view from it.
- `viewportW, viewportH` are **screen pixels**; the world span seen on an axis
  is `viewport / zoom`. When driving `modules/render-canvas2d`, set these to the
  **canvas backing size** (`canvas.width`/`canvas.height`) — the renderer derives
  its cull rect from the canvas dimensions, so a mismatch would offset culling.
- `worldToView` returns **screen-pixel** offset from the viewport top-left
  (zoom-applied). A world point at the camera centre maps to
  `(viewportW/2, viewportH/2)` at any zoom.
- `limit*` are world coords; `clampCameraToLimits` (and the follow system) keep
  the visible rect inside them, centring on the midpoint when a limit span is
  narrower than the view.

## Tags

The follow system requires **two** tags:

- `cameraTag` — identifies the camera entity (the observer). The
  system updates `CameraDef` components on every entity with this tag.
- `targetTag` — identifies what to follow (the subject). The system
  reads the position of the first entity with this tag (via
  `positionDef`) and centers all tagged cameras on it.

The module does not export built-in tags — games provide their own,
keeping tag ownership in app code.

**Naming caveat.** `CameraDef` serializes under the key `'camera'` (its
component name). Tag names share the same save-file namespace as
component names, so the `cameraTag` you pass **must not be named
`'camera'`** or save/load will collide. Use e.g. `'cameraEntity'` or
anything else distinct.

## `positionDef` parameter

The follow system reads target positions via a
`ComponentDef<{ x: number; y: number }>` passed in config. Any
component with `x` and `y` fields works — `PositionDef` from
`modules/transform` is the typical choice, but games with custom
position components (e.g. grid-cell integer coordinates) can pass
those instead. Keeps the module decoupled from `modules/transform`.

## Usage

```ts
import { EcsWorld } from '@pierre/ecs';
import { CameraDef, cameraToView, makeCamera, makeFollowCameraSystem } from '@pierre/ecs/modules/camera';
import { PositionDef } from '@pierre/ecs/modules/transform';

// Not 'camera' — tag names share the save namespace with component names.
const CameraTag = { name: 'cameraEntity' };
const PlayerTag = { name: 'player' };

const world = new EcsWorld();
world.registerComponent(PositionDef);
world.registerComponent(CameraDef);
world.registerTag(CameraTag);
world.registerTag(PlayerTag);

const playerId = world.createEntity();
world.getStore(PositionDef).set(playerId, { x: 0, y: 0 });
world.getTag(PlayerTag).add(playerId);

const cameraId = world.createEntity();
world.getStore(CameraDef).set(cameraId, makeCamera({
  x: 0, y: 0, viewportW: 400, viewportH: 250,
  limitLeft: 0, limitTop: 0, limitRight: mapW, limitBottom: mapH,
}));
world.getTag(CameraTag).add(cameraId);

const followSys = makeFollowCameraSystem({
  cameraTag: CameraTag,
  targetTag: PlayerTag,
  positionDef: PositionDef,
  smoothing: 10, // ease toward the player; pass ctx.dtMs each tick
});

// Schedule `followSys` before the render system each tick; then:
//   renderer.render({ ctx2d, world, view: cameraToView(cam) });
```

## Multi-camera

Multiple `cameraTag`-tagged entities are supported (splitscreen,
picture-in-picture, minimap). Every tagged camera follows the same
target — one `targetTag` applies to all. For distinct follow targets
per camera, register multiple follow-system instances with different
tag pairs.

Multiple `targetTag`-tagged entities are **not** supported — tag
exactly one, or the choice of follow target is undefined (iteration
order).

## Out of scope

- **Rotation** — Godot `Camera2D.rotation`. Deferred: a rotated view needs a
  full affine transform and a conservative rotated-AABB cull, and 2D
  top-down/platformers rarely rotate the camera. Add when a consumer needs it.
- **Parallax layers** — a layer/scroll-factor model; its own follow-up.
- **Pixel-space / DPI helpers** — stay in app code (DOM/canvas-specific).

Import via `@pierre/ecs/modules/camera`. Depends on
[`modules/math`](../math/README.md) (`clamp`, `lerp`).
