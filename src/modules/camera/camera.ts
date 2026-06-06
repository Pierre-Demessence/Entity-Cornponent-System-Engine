import type { ComponentDef, EcsWorld, SchedulableSystem, TagDef } from '#index';

import { simpleComponent } from '#index';

import { clamp, lerp } from '../math';

/**
 * Default "no limit" sentinel for {@link Camera} bounds — a large finite value
 * (mirrors Godot's `10000000`). Finite so it survives JSON serialization, where
 * `Infinity` would become `null`.
 */
export const CAMERA_NO_LIMIT = 1e7;

/**
 * A 2D camera, modelled on Godot's `Camera2D`. `(x, y)` is the anchor centre in
 * world coords; the rendered view is centred there plus `(offsetX, offsetY)`,
 * scaled by `zoom`, and clamped so it never shows past the `limit*` world rect.
 */
export interface Camera {
  limitBottom: number;
  limitLeft: number;
  limitRight: number;
  limitTop: number;
  /** View shift from the anchor, world units (Godot `Camera2D.offset`). */
  offsetX: number;
  offsetY: number;
  /** Viewport height in screen pixels. */
  viewportH: number;
  /** Viewport width in screen pixels. */
  viewportW: number;
  x: number;
  y: number;
  /** Magnification; `> 0`. `screen = (world − viewTopLeft) · zoom` (Godot `Camera2D.zoom`). */
  zoom: number;
}

export const CameraDef: ComponentDef<Camera> = simpleComponent<Camera>('camera', {
  limitBottom: 'number',
  limitLeft: 'number',
  limitRight: 'number',
  limitTop: 'number',
  offsetX: 'number',
  offsetY: 'number',
  viewportH: 'number',
  viewportW: 'number',
  x: 'number',
  y: 'number',
  zoom: 'number',
});

/** Options for {@link makeCamera}; only position + viewport are required. */
export interface CameraOptions {
  limitBottom?: number;
  limitLeft?: number;
  limitRight?: number;
  limitTop?: number;
  offsetX?: number;
  offsetY?: number;
  viewportH: number;
  viewportW: number;
  x: number;
  y: number;
  zoom?: number;
}

/** Create a {@link Camera} with canonical defaults: zoom 1, no offset, no limits. */
export function makeCamera(options: CameraOptions): Camera {
  return {
    limitBottom: options.limitBottom ?? CAMERA_NO_LIMIT,
    limitLeft: options.limitLeft ?? -CAMERA_NO_LIMIT,
    limitRight: options.limitRight ?? CAMERA_NO_LIMIT,
    limitTop: options.limitTop ?? -CAMERA_NO_LIMIT,
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 0,
    viewportH: options.viewportH,
    viewportW: options.viewportW,
    x: options.x,
    y: options.y,
    zoom: options.zoom ?? 1,
  };
}

/** World coords of the viewport's top-left corner (zoom- and offset-aware). */
function viewTopLeft(cam: Camera): { x: number; y: number } {
  return {
    x: cam.x + cam.offsetX - cam.viewportW / cam.zoom / 2,
    y: cam.y + cam.offsetY - cam.viewportH / cam.zoom / 2,
  };
}

/**
 * World → view transform. `vx` / `vy` is the **screen-pixel** offset from the
 * viewport's top-left corner (zoom- and offset-aware). A world point at the
 * camera centre returns `(viewportW/2, viewportH/2)`.
 */
export function worldToView(wx: number, wy: number, cam: Camera): { vx: number; vy: number } {
  const tl = viewTopLeft(cam);
  return { vx: (wx - tl.x) * cam.zoom, vy: (wy - tl.y) * cam.zoom };
}

/** View → world inverse of {@link worldToView} — the canonical zoom-aware pointer unproject. */
export function viewToWorld(vx: number, vy: number, cam: Camera): { wx: number; wy: number } {
  const tl = viewTopLeft(cam);
  return { wx: vx / cam.zoom + tl.x, wy: vy / cam.zoom + tl.y };
}

/** The world-space rectangle the camera currently sees (`w = viewportW / zoom`). */
export function cameraViewRect(cam: Camera): { h: number; w: number; x: number; y: number } {
  const tl = viewTopLeft(cam);
  return { h: cam.viewportH / cam.zoom, w: cam.viewportW / cam.zoom, x: tl.x, y: tl.y };
}

/** Renderer input: the viewport's top-left in world coords plus `zoom`. */
export function cameraToView(cam: Camera): { x: number; y: number; zoom: number } {
  const tl = viewTopLeft(cam);
  return { x: tl.x, y: tl.y, zoom: cam.zoom };
}

/**
 * Clamp the camera so its view stays within the `limit*` world rect (Godot
 * `Camera2D.limit_*`). When the limit span is narrower than the view on an
 * axis, the camera centres on that axis's limit midpoint.
 */
export function clampCameraToLimits(cam: Camera): void {
  const halfW = cam.viewportW / cam.zoom / 2;
  const halfH = cam.viewportH / cam.zoom / 2;
  const minX = cam.limitLeft + halfW - cam.offsetX;
  const maxX = cam.limitRight - halfW - cam.offsetX;
  cam.x = minX <= maxX ? clamp(cam.x, minX, maxX) : (minX + maxX) / 2;
  const minY = cam.limitTop + halfH - cam.offsetY;
  const maxY = cam.limitBottom - halfH - cam.offsetY;
  cam.y = minY <= maxY ? clamp(cam.y, minY, maxY) : (minY + maxY) / 2;
}

/** Desired camera centre on one axis given a deadzone half-extent. */
function chaseAxis(camCenter: number, target: number, deadzone: number): number {
  if (deadzone <= 0)
    return target;
  const d = target - camCenter;
  if (Math.abs(d) <= deadzone)
    return camCenter;
  return camCenter + (d - Math.sign(d) * deadzone);
}

export interface CameraFollowTickCtx { dtMs?: number; world: EcsWorld }

export interface CameraFollowOptions {
  name?: string;
  cameraTag: TagDef;
  /** Deadzone half-height (world units); the camera chases vertically only once the target leaves this band. */
  deadzoneH?: number;
  /** Deadzone half-width (world units); the camera chases horizontally only once the target leaves this band. */
  deadzoneW?: number;
  positionDef: ComponentDef<{ x: number; y: number }>;
  runAfter?: string[];
  /** Exponential smoothing speed (per second); omit for an instant snap (Godot `position_smoothing`). Requires `dtMs` on the tick ctx. */
  smoothing?: number;
  targetTag: TagDef;
}

/**
 * Returns a system that, each tick, follows the first `targetTag`-tagged entity
 * with every `cameraTag`-tagged `CameraDef`. Optional deadzone (chase only once
 * the target leaves a centred band), smoothing (ease toward the target — needs
 * `ctx.dtMs`), and `limit*` clamping (applied after following).
 *
 * Multiple target tags are not supported — tag exactly one entity per game.
 * When no target is tagged or it has no position, the tick is a no-op.
 */
export function makeFollowCameraSystem<TCtx extends CameraFollowTickCtx>(
  options: CameraFollowOptions,
): SchedulableSystem<TCtx> {
  const {
    name = 'camera-follow',
    cameraTag,
    deadzoneH = 0,
    deadzoneW = 0,
    positionDef,
    runAfter,
    smoothing,
    targetTag,
  } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const targets = ctx.world.getTag(targetTag);
      let targetPos: { x: number; y: number } | undefined;
      const positions = ctx.world.getStore(positionDef);
      for (const targetId of targets) {
        const pos = positions.get(targetId);
        if (pos) {
          targetPos = pos;
          break;
        }
      }
      if (!targetPos)
        return;

      const dt = (ctx.dtMs ?? 0) / 1000;
      const cameras = ctx.world.getTag(cameraTag);
      const cams = ctx.world.getStore(CameraDef);
      for (const cameraId of cameras) {
        const cam = cams.get(cameraId);
        if (!cam)
          continue;
        const desiredX = chaseAxis(cam.x, targetPos.x, deadzoneW);
        const desiredY = chaseAxis(cam.y, targetPos.y, deadzoneH);
        if (smoothing && smoothing > 0 && dt > 0) {
          const t = 1 - Math.exp(-smoothing * dt);
          cam.x = lerp(cam.x, desiredX, t);
          cam.y = lerp(cam.y, desiredY, t);
        }
        else {
          cam.x = desiredX;
          cam.y = desiredY;
        }
        clampCameraToLimits(cam);
      }
    },
  };
}
