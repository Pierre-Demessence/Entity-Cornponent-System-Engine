# `@pierre/ecs/modules/camera`

2D camera component, follow system, and world↔view transforms. Canon
pattern: Bevy `Camera2dBundle`, Godot `Camera2D`, Phaser `Cameras`,
Unity `Camera` (orthographic 2D).

## API

```ts
interface Camera {
  x: number;
  y: number;
  viewportW: number;
  viewportH: number;
}

const CameraDef: ComponentDef<Camera>;

interface CameraFollowTickCtx { world: EcsWorld }

interface CameraFollowOptions {
  cameraTag: TagDef;
  targetTag: TagDef;
  positionDef: ComponentDef<{ x: number; y: number }>;
  name?: string;
  runAfter?: string[];
}

function makeFollowCameraSystem<TCtx extends CameraFollowTickCtx>(
  options: CameraFollowOptions,
): SchedulableSystem<TCtx>;

function worldToView(wx: number, wy: number, cam: Camera): { vx: number; vy: number };
function viewToWorld(vx: number, vy: number, cam: Camera): { wx: number; wy: number };
```

## Units

The camera works in **whatever units world positions are in**. Tile
games use tile units; continuous games use pixels or game-units. The
module does not know about pixels — converting the view-space result
to screen pixels (multiplying by a tile size, scaling for canvas
DPI, etc.) is the caller's job.

- `cam.x, cam.y` is the **center** of the viewport in world
  coordinates (Bevy/Godot convention, not top-left).
- `viewportW, viewportH` are the viewport dimensions in world units.
- `worldToView(wx, wy, cam)` returns the offset from the viewport's
  top-left in world units. A world point at the camera center maps
  to `(viewportW/2, viewportH/2)`.

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
import { CameraDef, makeFollowCameraSystem } from '@pierre/ecs/modules/camera';
import { PositionDef } from '@pierre/ecs/modules/transform';

const CameraTag = { name: 'camera' };
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
world.getStore(CameraDef).set(cameraId, {
  x: 0, y: 0, viewportW: 40, viewportH: 25,
});
world.getTag(CameraTag).add(cameraId);

const followSys = makeFollowCameraSystem({
  cameraTag: CameraTag,
  targetTag: PlayerTag,
  positionDef: PositionDef,
});

// Schedule `followSys` before the render system each tick.
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

## Out of scope (Path-B minimum)

- `zoom` and `rotation` — add via Path-A when a 2nd consumer needs them
- Deadzone / lerp follow — same
- Scroll clamping — same
- Parallax layers — same
- Pixel-space helpers — stays in app (DOM/canvas-specific)
