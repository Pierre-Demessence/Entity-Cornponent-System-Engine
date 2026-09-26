import type { Vec2 } from '../math';

import { vec2Normalize, vec2ScaleToLength } from '../math';

/**
 * A neighbour as steering sees it: a plain position + velocity pair.
 * Deliberately ECS-decoupled — the caller builds these from whatever
 * store / spatial index it uses, so steering stays a pure math layer.
 */
export interface Neighbor {
  position: Vec2;
  velocity: Vec2;
}

/** One steering force with a blend weight, consumed by {@link combine}. */
export interface WeightedForce {
  force: Vec2;
  weight: number;
}

/** Clamp a vector's magnitude to `max`, preserving direction. */
export function truncate(v: Vec2, max: number): Vec2 {
  const mag = Math.hypot(v.x, v.y);
  if (mag <= max || mag === 0)
    return { x: v.x, y: v.y };
  const k = max / mag;
  return { x: v.x * k, y: v.y * k };
}

/**
 * Reynolds steering force: `desired − velocity`, where `desired` is
 * `(dirX, dirY)` rescaled to `maxSpeed`. Returning the *force* (not the
 * desired velocity) is what lets multiple behaviours blend with momentum
 * — the flocking-quality difference over "just set velocity = desired".
 */
function steer(dirX: number, dirY: number, maxSpeed: number, vel: Vec2): Vec2 {
  const desired = vec2ScaleToLength({ x: dirX, y: dirY }, maxSpeed);
  return { x: desired.x - vel.x, y: desired.y - vel.y };
}

/** Steer toward `target` at full speed. */
export function seek(pos: Vec2, target: Vec2, vel: Vec2, maxSpeed: number): Vec2 {
  return steer(target.x - pos.x, target.y - pos.y, maxSpeed, vel);
}

/** Steer directly away from `target` at full speed. */
export function flee(pos: Vec2, target: Vec2, vel: Vec2, maxSpeed: number): Vec2 {
  return steer(pos.x - target.x, pos.y - target.y, maxSpeed, vel);
}

/**
 * Seek `target`, but scale desired speed down linearly inside
 * `slowRadius` so the agent decelerates and settles instead of orbiting.
 */
export function arrive(pos: Vec2, target: Vec2, vel: Vec2, maxSpeed: number, slowRadius: number): Vec2 {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0)
    return { x: -vel.x, y: -vel.y };
  const speed = dist < slowRadius ? maxSpeed * (dist / slowRadius) : maxSpeed;
  const desiredX = (dx / dist) * speed;
  const desiredY = (dy / dist) * speed;
  return { x: desiredX - vel.x, y: desiredY - vel.y };
}

/** Time-to-target used to lead a moving target in pursue / evade. */
function leadTime(pos: Vec2, targetPos: Vec2, maxSpeed: number): number {
  if (maxSpeed <= 0)
    return 0;
  const dist = Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y);
  return dist / maxSpeed;
}

/** Seek where a moving target *will be*, leading it by its velocity. */
export function pursue(pos: Vec2, vel: Vec2, targetPos: Vec2, targetVel: Vec2, maxSpeed: number): Vec2 {
  const t = leadTime(pos, targetPos, maxSpeed);
  const future = { x: targetPos.x + targetVel.x * t, y: targetPos.y + targetVel.y * t };
  return seek(pos, future, vel, maxSpeed);
}

/** Flee where a moving threat *will be*, leading it by its velocity. */
export function evade(pos: Vec2, vel: Vec2, targetPos: Vec2, targetVel: Vec2, maxSpeed: number): Vec2 {
  const t = leadTime(pos, targetPos, maxSpeed);
  const future = { x: targetPos.x + targetVel.x * t, y: targetPos.y + targetVel.y * t };
  return flee(pos, future, vel, maxSpeed);
}

/** Per-agent wander state: the current offset angle on the wander circle. */
export interface WanderState {
  angle: number;
}

/** Tuning for {@link wander}: the wander circle's `distance` and `radius`, per-call `jitter`, and an optional `random` source. */
export interface WanderParams {
  /** How far ahead of the agent the wander circle is projected. */
  distance: number;
  /** Max random change to the wander angle per call, in radians. */
  jitter: number;
  /** Radius of the wander circle — larger = wider turns. */
  radius: number;
  /** Random source in `[0, 1)`. Defaults to `Math.random`. */
  random?: () => number;
}

/**
 * Reynolds wander: jitter an angle each tick, project a point on a circle
 * ahead of the agent's heading, and steer toward it. Produces smooth,
 * meandering motion instead of the twitchy path of pure random velocity.
 * Mutates `state.angle` in place.
 */
export function wander(vel: Vec2, state: WanderState, params: WanderParams, maxSpeed: number): Vec2 {
  const rand = params.random ?? Math.random;
  state.angle += (rand() * 2 - 1) * params.jitter;
  const heading = vec2Normalize(vel);
  const hx = heading.x === 0 && heading.y === 0 ? 1 : heading.x;
  const hy = heading.x === 0 && heading.y === 0 ? 0 : heading.y;
  const headingAngle = Math.atan2(hy, hx);
  const desiredX = hx * params.distance + Math.cos(headingAngle + state.angle) * params.radius;
  const desiredY = hy * params.distance + Math.sin(headingAngle + state.angle) * params.radius;
  return steer(desiredX, desiredY, maxSpeed, vel);
}

/** Steer away from crowding, weighted by inverse distance (closer = stronger). */
export function separation(pos: Vec2, neighbors: readonly Neighbor[], vel: Vec2, maxSpeed: number): Vec2 {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const n of neighbors) {
    const dx = pos.x - n.position.x;
    const dy = pos.y - n.position.y;
    const d = Math.hypot(dx, dy);
    if (d > 0) {
      sx += dx / (d * d);
      sy += dy / (d * d);
      count++;
    }
  }
  if (count === 0)
    return { x: 0, y: 0 };
  return steer(sx, sy, maxSpeed, vel);
}

/** Steer to match the average heading of neighbours. */
export function alignment(vel: Vec2, neighbors: readonly Neighbor[], maxSpeed: number): Vec2 {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const n of neighbors) {
    sx += n.velocity.x;
    sy += n.velocity.y;
    count++;
  }
  if (count === 0)
    return { x: 0, y: 0 };
  return steer(sx / count, sy / count, maxSpeed, vel);
}

/** Steer toward the average position (centre of mass) of neighbours. */
export function cohesion(pos: Vec2, neighbors: readonly Neighbor[], vel: Vec2, maxSpeed: number): Vec2 {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const n of neighbors) {
    sx += n.position.x;
    sy += n.position.y;
    count++;
  }
  if (count === 0)
    return { x: 0, y: 0 };
  return seek(pos, { x: sx / count, y: sy / count }, vel, maxSpeed);
}

/** Weighted sum of steering forces, truncated to `maxForce`. */
export function combine(forces: readonly WeightedForce[], maxForce: number): Vec2 {
  let x = 0;
  let y = 0;
  for (const { force, weight } of forces) {
    x += force.x * weight;
    y += force.y * weight;
  }
  return truncate({ x, y }, maxForce);
}

/** A circular obstacle for {@link obstacleAvoidance}. */
export interface CircleObstacle {
  position: Vec2;
  radius: number;
}

/** A wall as a line segment, for {@link wallFollowing}. */
export interface Segment {
  end: Vec2;
  start: Vec2;
}

/** Tuning for {@link wallFollowing}. */
export interface WallFollowParams {
  /** Preferred gap to keep between the agent and the wall. */
  desiredDistance: number;
  /** Ignore walls whose nearest point is farther than this. */
  range: number;
}

/** A polyline path for {@link pathFollowing}. */
export interface Path {
  /** Ordered waypoints; consecutive pairs form the path segments. */
  points: readonly Vec2[];
  /** Corridor half-width: the agent only corrects once it strays this far off. */
  radius: number;
}

/** Point on segment `a → b` closest to `p`, plus the clamped projection `t` in `[0, 1]`. */
function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0)
    return { point: { x: a.x, y: a.y }, t: 0 };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { point: { x: a.x + abx * t, y: a.y + aby * t }, t };
}

/**
 * Steer laterally around the nearest circular obstacle blocking the agent's
 * path. Projects each obstacle centre onto the heading ray and, for those
 * within `maxSeeAhead` whose perpendicular distance is inside their radius,
 * picks the closest one ahead and pushes away from it. Returns the zero vector
 * when nothing is threatening (or the agent is stationary, so there is no
 * heading to project). Blend with `seek` / `pathFollowing` via {@link combine}.
 */
export function obstacleAvoidance(
  pos: Vec2,
  vel: Vec2,
  obstacles: readonly CircleObstacle[],
  maxSpeed: number,
  maxSeeAhead: number,
): Vec2 {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed === 0)
    return { x: 0, y: 0 };
  const hx = vel.x / speed;
  const hy = vel.y / speed;

  let nearestProj = Infinity;
  let threat: CircleObstacle | undefined;
  for (const o of obstacles) {
    const tox = o.position.x - pos.x;
    const toy = o.position.y - pos.y;
    const proj = tox * hx + toy * hy;
    if (proj < 0 || proj > maxSeeAhead)
      continue;
    const perpX = tox - hx * proj;
    const perpY = toy - hy * proj;
    if (Math.hypot(perpX, perpY) < o.radius && proj < nearestProj) {
      nearestProj = proj;
      threat = o;
    }
  }
  if (threat === undefined)
    return { x: 0, y: 0 };

  const aheadX = pos.x + hx * nearestProj;
  const aheadY = pos.y + hy * nearestProj;
  let awayX = aheadX - threat.position.x;
  let awayY = aheadY - threat.position.y;
  if (Math.hypot(awayX, awayY) === 0) {
    // Obstacle dead on the heading ray: no side is implied, so dodge to the
    // left of the heading rather than braking straight into it.
    awayX = -hy;
    awayY = hx;
  }
  return steer(awayX, awayY, maxSpeed, vel);
}

/**
 * Follow the nearest wall within `params.range`, keeping `desiredDistance`
 * from it. Blends a tangential term (move along the wall in the direction the
 * agent is already travelling) with a normal correction that restores the
 * preferred gap. Returns the zero vector when no wall is in range, or when the
 * agent sits exactly on the wall (no side to pick).
 */
export function wallFollowing(
  pos: Vec2,
  vel: Vec2,
  walls: readonly Segment[],
  params: WallFollowParams,
  maxSpeed: number,
): Vec2 {
  let nearestDist = Infinity;
  let nearest: Segment | undefined;
  let nearestPoint: Vec2 | undefined;
  for (const w of walls) {
    const { point } = closestPointOnSegment(pos, w.start, w.end);
    const d = Math.hypot(pos.x - point.x, pos.y - point.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = w;
      nearestPoint = point;
    }
  }
  if (nearest === undefined || nearestPoint === undefined || nearestDist > params.range)
    return { x: 0, y: 0 };
  if (nearestDist === 0)
    return { x: 0, y: 0 };

  const nx = (pos.x - nearestPoint.x) / nearestDist;
  const ny = (pos.y - nearestPoint.y) / nearestDist;

  let wallDir = vec2Normalize({ x: nearest.end.x - nearest.start.x, y: nearest.end.y - nearest.start.y });
  if (wallDir.x * vel.x + wallDir.y * vel.y < 0)
    wallDir = { x: -wallDir.x, y: -wallDir.y };

  const error = nearestDist - params.desiredDistance;
  const correction = Math.max(-1, Math.min(1, error / params.desiredDistance));
  const desiredX = wallDir.x - nx * correction;
  const desiredY = wallDir.y - ny * correction;
  return steer(desiredX, desiredY, maxSpeed, vel);
}

/**
 * Reynolds path following: predict where the agent is heading, and if that
 * point strays outside the path corridor (`path.radius`), seek back toward a
 * target nudged forward along the nearest segment. Returns the zero vector
 * while the agent stays within the corridor. Stateless — it re-derives the
 * nearest segment each call, so no waypoint index is threaded through.
 *
 * Keeps the agent *on* the path; it does not stop at the final point. Compose
 * with `arrive` for the last-leg approach.
 */
export function pathFollowing(
  pos: Vec2,
  vel: Vec2,
  path: Path,
  maxSpeed: number,
  predictDistance: number,
): Vec2 {
  const pts = path.points;
  if (pts.length === 0)
    return { x: 0, y: 0 };
  if (pts.length === 1)
    return seek(pos, pts[0], vel, maxSpeed);

  const heading = vec2Normalize(vel);
  const futureX = pos.x + heading.x * predictDistance;
  const futureY = pos.y + heading.y * predictDistance;
  const future = { x: futureX, y: futureY };

  let bestDist = Infinity;
  let target: Vec2 | undefined;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const { point } = closestPointOnSegment(future, a, b);
    const d = Math.hypot(future.x - point.x, future.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      const segDir = vec2Normalize({ x: b.x - a.x, y: b.y - a.y });
      target = { x: point.x + segDir.x * predictDistance, y: point.y + segDir.y * predictDistance };
    }
  }
  if (target === undefined || bestDist <= path.radius)
    return { x: 0, y: 0 };
  return seek(pos, target, vel, maxSpeed);
}
