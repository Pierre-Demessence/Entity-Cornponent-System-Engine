import type { Track } from './track';

import { circleVsCircle } from '@pierre/ecs/modules/collision';
import { clamp } from '@pierre/ecs/modules/math';

import { locate } from './track';

export const MAX_SPEED = 250;
export const MAX_REVERSE = 90;
export const ACCEL = 210;
export const BRAKE = 340;
/** Deceleration while coasting with no pedal down. */
export const COAST = 95;
/** Heading change in rad/s at full lock and `TURN_FULL_SPEED` or faster. */
export const TURN_RATE = 2.7;
/** Speed at which steering reaches full effect; below it the wheel bites proportionally. */
export const TURN_FULL_SPEED = 70;
export const CAR_RADIUS = 9;
/** Fraction of the wall-normal velocity that is kept (reversed) on impact. */
export const WALL_RESTITUTION = 0.35;

export interface Body {
  heading: number;
  speed: number;
  x: number;
  y: number;
}

/**
 * Advance the drive model one step. `throttle` and `steer` are in `[-1, 1]`.
 * Speed eases toward its limit (thrust tapers near top speed) and the car only
 * turns while it rolls, in either direction (steering reverses when backing up).
 */
export function stepCar(body: Body, throttle: number, steer: number, dt: number, maxSpeed = MAX_SPEED): void {
  const pedal = clamp(throttle, -1, 1);
  if (pedal > 0) {
    if (body.speed < 0)
      body.speed = Math.min(0, body.speed + BRAKE * dt);
    else
      body.speed = Math.min(maxSpeed, body.speed + ACCEL * pedal * (1 - body.speed / (maxSpeed * 1.15)) * dt);
  }
  else if (pedal < 0) {
    if (body.speed > 0)
      body.speed = Math.max(0, body.speed - BRAKE * -pedal * dt);
    else
      body.speed = Math.max(-MAX_REVERSE, body.speed + ACCEL * pedal * 0.6 * dt);
  }
  else if (body.speed > 0) {
    body.speed = Math.max(0, body.speed - COAST * dt);
  }
  else {
    body.speed = Math.min(0, body.speed + COAST * dt);
  }

  const grip = clamp(Math.abs(body.speed) / TURN_FULL_SPEED, 0, 1);
  body.heading += clamp(steer, -1, 1) * TURN_RATE * grip * Math.sign(body.speed) * dt;
  body.x += Math.cos(body.heading) * body.speed * dt;
  body.y += Math.sin(body.heading) * body.speed * dt;
}

/** Velocity vector of a body. */
function velocity(b: Body): { x: number; y: number } {
  return { x: Math.cos(b.heading) * b.speed, y: Math.sin(b.heading) * b.speed };
}

/** Re-express a velocity vector as a signed speed along the (unchanged) heading. */
function setVelocity(b: Body, vx: number, vy: number): void {
  b.speed = vx * Math.cos(b.heading) + vy * Math.sin(b.heading);
}

/**
 * Keep the car inside the corridor. Returns the impact speed along the wall
 * normal (0 when the car did not touch the boundary).
 */
export function bounceOffWalls(body: Body, track: Track): number {
  const loc = locate(track, body.x, body.y);
  const limit = track.halfWidth - CAR_RADIUS;
  if (loc.dist <= limit)
    return 0;

  body.x = loc.cx + loc.nx * limit;
  body.y = loc.cy + loc.ny * limit;
  const v = velocity(body);
  const into = v.x * loc.nx + v.y * loc.ny;
  if (into <= 0)
    return 0;
  // Reflect the normal component with loss; the tangential part slides along the wall.
  setVelocity(body, v.x - (1 + WALL_RESTITUTION) * into * loc.nx, v.y - (1 + WALL_RESTITUTION) * into * loc.ny);
  return into;
}

/** Whether two cars overlap. */
export function carsTouch(a: Body, b: Body): boolean {
  return circleVsCircle(a, CAR_RADIUS, b, CAR_RADIUS);
}

/**
 * Push two overlapping cars apart and exchange their momentum along the
 * contact normal (equal masses, restitution 0.6). Returns true when they collided.
 */
export function collideCars(a: Body, b: Body): boolean {
  if (!carsTouch(a, b))
    return false;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist === 0) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const push = (2 * CAR_RADIUS - dist) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;

  const va = velocity(a);
  const vb = velocity(b);
  const closing = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
  if (closing <= 0)
    return true;
  const j = (1 + 0.6) * closing / 2;
  setVelocity(a, va.x - j * nx, va.y - j * ny);
  setVelocity(b, vb.x + j * nx, vb.y + j * ny);
  return true;
}
