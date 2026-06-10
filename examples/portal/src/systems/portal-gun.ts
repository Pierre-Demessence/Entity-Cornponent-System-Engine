import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState, Portal, PortalColor, Vec3 } from '../game';

import { PortalableSurfaceTag, Position3DDef, ShapeAabb3DDef } from '../components';
import {
  PLAYER_EYE,
  PORTAL_EDGE_MARGIN,
  PORTAL_H,
  PORTAL_SURFACE_OFFSET,
  PORTAL_W,
} from '../game';
import { forwardVec } from './portal-math';

type Axis = 'x' | 'y' | 'z';
const AXES: readonly Axis[] = ['x', 'y', 'z'];

interface SurfaceHit {
  axis: Axis;
  center: Vec3;
  half: Vec3;
  normalSign: number;
  point: Vec3;
  surfaceId: EntityId;
}

/**
 * Portal gun. When a fire is queued (`pendingFire`), cast a ray from the eye
 * along the look direction at the portal-able surfaces; on a valid hit, snap a
 * portal onto that face and replace that colour's portal. An invalid shot
 * (no portal-able surface, or a face too small to hold the portal) leaves the
 * existing portal of that colour untouched.
 */
export const portalGunSystem: SchedulableSystem<GameState> = {
  name: 'portal-gun',
  run(ctx) {
    const color = ctx.pendingFire;
    ctx.pendingFire = null;
    if (!color || ctx.playerId == null)
      return;

    const eye = ctx.world.getStore(Position3DDef).get(ctx.playerId);
    if (!eye)
      return;
    const origin: Vec3 = { x: eye.x, y: eye.y + PLAYER_EYE, z: eye.z };
    const dir = forwardVec(ctx.yaw, ctx.pitch);

    const hit = nearestSurface(ctx, origin, dir);
    if (!hit)
      return;

    const portal = buildPortal(hit, ctx.portals[other(color)]);
    if (portal)
      ctx.portals[color] = portal;
  },
};

function nearestSurface(ctx: GameState, origin: Vec3, dir: Vec3): SurfaceHit | null {
  const posStore = ctx.world.getStore(Position3DDef);
  const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
  let best: SurfaceHit | null = null;
  let bestT = Infinity;

  for (const sid of ctx.world.getTag(PortalableSurfaceTag)) {
    const c = posStore.get(sid);
    const a = aabbStore.get(sid);
    if (!c || !a)
      continue;
    const half: Vec3 = { x: a.w / 2, y: a.h / 2, z: a.d / 2 };
    const entry = rayAabbEntry(origin, dir, c, half);
    if (!entry || entry.t >= bestT)
      continue;
    bestT = entry.t;
    best = {
      axis: entry.axis,
      center: { x: c.x, y: c.y, z: c.z },
      half,
      normalSign: dir[entry.axis] > 0 ? -1 : 1,
      surfaceId: sid,
      point: {
        x: origin.x + dir.x * entry.t,
        y: origin.y + dir.y * entry.t,
        z: origin.z + dir.z * entry.t,
      },
    };
  }
  return best;
}

/** Slab method: entry t (>0) + the axis of the entry face, or null. */
function rayAabbEntry(o: Vec3, d: Vec3, c: Vec3, half: Vec3): { axis: Axis; t: number } | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis: Axis = 'x';
  for (const a of AXES) {
    const lo = c[a] - half[a];
    const hi = c[a] + half[a];
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < lo || o[a] > hi)
        return null;
      continue;
    }
    let t1 = (lo - o[a]) / d[a];
    let t2 = (hi - o[a]) / d[a];
    if (t1 > t2)
      [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      axis = a;
    }
    if (t2 < tmax)
      tmax = t2;
    if (tmin > tmax)
      return null;
  }
  if (tmin <= 1e-4)
    return null; // origin inside/behind the box
  return { axis, t: tmin };
}

/** Snap a portal onto the hit face; null if the face can't hold it. */
function buildPortal(hit: SurfaceHit, otherPortal: Portal | null): Portal | null {
  const normal = axisVec(hit.axis, hit.normalSign);
  const ref: Vec3 = hit.axis === 'y' ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(ref, normal));
  const up = cross(normal, right);

  const center: Vec3 = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
  // Sit exactly on the face plane, nudged out to avoid z-fighting.
  center[hit.axis]
    = hit.center[hit.axis] + hit.normalSign * (hit.half[hit.axis] + PORTAL_SURFACE_OFFSET);

  // Clamp the centre within the face on the two perpendicular axes.
  for (const a of AXES) {
    if (a === hit.axis)
      continue;
    const portalHalf = Math.abs(right[a]) * (PORTAL_W / 2) + Math.abs(up[a]) * (PORTAL_H / 2);
    const lo = hit.center[a] - hit.half[a] + portalHalf + PORTAL_EDGE_MARGIN;
    const hi = hit.center[a] + hit.half[a] - portalHalf - PORTAL_EDGE_MARGIN;
    if (lo > hi)
      return null; // face too small on this axis
    center[a] = Math.min(hi, Math.max(lo, center[a]));
  }

  // Reject if it would land on top of the other-colour portal (same plane).
  if (otherPortal && samePlane(normal, center, otherPortal)) {
    const dx = center.x - otherPortal.center.x;
    const dy = center.y - otherPortal.center.y;
    const dz = center.z - otherPortal.center.z;
    if (Math.hypot(dx, dy, dz) < PORTAL_W * 0.9)
      return null;
  }

  return { center, normal, right, surfaceId: hit.surfaceId, up };
}

function samePlane(normal: Vec3, center: Vec3, p: Portal): boolean {
  const sameNormal = Math.abs(normal.x - p.normal.x) < 1e-3
    && Math.abs(normal.y - p.normal.y) < 1e-3
    && Math.abs(normal.z - p.normal.z) < 1e-3;
  if (!sameNormal)
    return false;
  // Same offset along the shared normal ⇒ coplanar.
  const along = (center.x - p.center.x) * normal.x
    + (center.y - p.center.y) * normal.y
    + (center.z - p.center.z) * normal.z;
  return Math.abs(along) < 0.2;
}

function other(color: PortalColor): PortalColor {
  return color === 'blue' ? 'orange' : 'blue';
}

function axisVec(axis: Axis, sign: number): Vec3 {
  return { x: axis === 'x' ? sign : 0, y: axis === 'y' ? sign : 0, z: axis === 'z' ? sign : 0 };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
