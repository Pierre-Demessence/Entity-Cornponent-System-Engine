import type { ComponentDef, EcsWorld, SchedulableSystem, TagDef } from '#index';

import { simpleComponent } from '#index';

export interface Camera { viewportH: number; viewportW: number; x: number; y: number }

export const CameraDef: ComponentDef<Camera> = simpleComponent<Camera>(
  'camera',
  { viewportH: 'number', viewportW: 'number', x: 'number', y: 'number' },
);

export interface CameraFollowTickCtx { world: EcsWorld }

export interface CameraFollowOptions {
  name?: string;
  cameraTag: TagDef;
  positionDef: ComponentDef<{ x: number; y: number }>;
  runAfter?: string[];
  targetTag: TagDef;
}

/**
 * Returns a system that, each tick, centers every `cameraTag`-tagged entity's
 * `CameraDef` on the first `targetTag`-tagged entity's position.
 *
 * Multiple target tags are not supported — tag exactly one entity per game,
 * or the choice of follow target is undefined (first iteration order).
 * When no target is tagged or the tagged target has no position component,
 * the system is a no-op for that tick.
 */
export function makeFollowCameraSystem<TCtx extends CameraFollowTickCtx>(
  options: CameraFollowOptions,
): SchedulableSystem<TCtx> {
  const { name = 'camera-follow', cameraTag, positionDef, runAfter, targetTag } = options;
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

      const cameras = ctx.world.getTag(cameraTag);
      const cams = ctx.world.getStore(CameraDef);
      for (const cameraId of cameras) {
        const cam = cams.get(cameraId);
        if (!cam)
          continue;
        cam.x = targetPos.x;
        cam.y = targetPos.y;
      }
    },
  };
}

/**
 * World → view transform. `vx` / `vy` is the offset from the viewport's
 * top-left corner, expressed in the same units as world positions.
 * A world point exactly at the camera's center returns `(viewportW/2, viewportH/2)`.
 */
export function worldToView(wx: number, wy: number, cam: Camera): { vx: number; vy: number } {
  return {
    vx: wx - (cam.x - cam.viewportW / 2),
    vy: wy - (cam.y - cam.viewportH / 2),
  };
}

/** View → world inverse of {@link worldToView}. */
export function viewToWorld(vx: number, vy: number, cam: Camera): { wx: number; wy: number } {
  return {
    wx: vx + (cam.x - cam.viewportW / 2),
    wy: vy + (cam.y - cam.viewportH / 2),
  };
}
