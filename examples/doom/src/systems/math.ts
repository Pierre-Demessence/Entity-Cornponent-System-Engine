import type { Vec3 } from '@pierre/ecs/modules/math-3d';

/** Camera forward unit vector from yaw/pitch (YXZ Euler; looks -Z at 0,0). */
export function forwardVec(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) };
}
