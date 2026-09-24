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
