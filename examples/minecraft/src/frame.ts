import type { Vec3 } from '@pierre/ecs/modules/math';

import type { GameState } from './game';

import { Camera3DDef, camera3DFrustum, frustumIntersectsAabb, getCameraPose, screenPointToRay, worldToScreen } from '@pierre/ecs/modules/camera-3d';

import { ChunkDef, Position3DDef, ShapeAabb3DDef } from './components';
import { REACH, VIEW_H, VIEW_W } from './game';
import { raycastVoxels } from './voxels';

/**
 * Per-frame view work, run after the camera rig has posed the camera: pick the
 * block under the crosshair with a ray through the screen centre, and mark each
 * chunk visible or not by testing its bounds against the camera frustum.
 * Returns how many chunks passed the frustum test.
 */
export function updateView(state: GameState): number {
  if (state.cameraId == null)
    return 0;
  const lens = state.world.getStore(Camera3DDef).get(state.cameraId);
  if (!lens)
    return 0;
  const pose = getCameraPose(state.world, state.cameraId);

  const ray = screenPointToRay(VIEW_W / 2, VIEW_H / 2, lens, pose);
  state.target = raycastVoxels(state.world.grid, ray.origin, ray.dir, REACH);

  const frustum = camera3DFrustum(lens, pose);
  const positions = state.world.getStore(Position3DDef);
  const shapes = state.world.getStore(ShapeAabb3DDef);
  let visible = 0;
  for (const id of state.world.chunkIds) {
    const chunk = state.world.getStore(ChunkDef).get(id);
    const p = positions.get(id);
    const s = shapes.get(id);
    if (!chunk || !p || !s)
      continue;
    const inView = frustumIntersectsAabb(frustum, { center: p, half: { x: s.w / 2, y: s.h / 2, z: s.d / 2 } });
    chunk.visible = inView ? 1 : 0;
    if (inView)
      visible += 1;
  }
  return visible;
}

/** Where the world point `p` lands on screen, or `null` when it is behind the camera. */
export function projectPoint(state: GameState, p: Vec3): { x: number; y: number } | null {
  if (state.cameraId == null)
    return null;
  const lens = state.world.getStore(Camera3DDef).get(state.cameraId);
  if (!lens)
    return null;
  return worldToScreen(p, lens, getCameraPose(state.world, state.cameraId));
}
