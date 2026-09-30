import type { Body } from './car';
import type { Track } from './track';

import { clamp } from '@pierre/ecs/modules/math';
import { combine, evade, obstacleAvoidance, pursue, seek } from '@pierre/ecs/modules/steering';

import { CAR_RADIUS, MAX_SPEED } from './car';
import { locate, pointAt } from './track';

/** What the AI is trying to do this tick. */
export type AiGoal
  = | { kind: 'chase'; target: Body }
    | { kind: 'evade'; target: Body }
    | { kind: 'lap' }
    | { kind: 'reach'; x: number; y: number };

export interface AiDrive {
  steer: number;
  throttle: number;
}

/** AI cars run a little below the player's top speed so the player can win. */
export const AI_SPEED_FACTOR = 0.9;
const LOOKAHEAD_BASE = 70;
const LOOKAHEAD_PER_SPEED = 0.45;
const DIRECT_REACH = 120;

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function unit(b: Body): { x: number; y: number } {
  return { x: Math.cos(b.heading), y: Math.sin(b.heading) };
}

/**
 * Decide throttle and steering for an AI car. The desired direction is a
 * steering-force blend: seek (a look-ahead point on the centerline, or the goal
 * itself when it is close), pursue / evade for tag, and obstacle avoidance
 * around the other cars. The force is then turned into wheel and pedal input.
 */
export function aiDrive(body: Body, goal: AiGoal, others: readonly Body[], track: Track): AiDrive {
  const maxSpeed = MAX_SPEED * AI_SPEED_FACTOR;
  const speed = Math.max(Math.abs(body.speed), 25);
  const heading = unit(body);
  const vel = { x: heading.x * speed, y: heading.y * speed };
  const pos = { x: body.x, y: body.y };
  const loc = locate(track, body.x, body.y);
  const ahead = pointAt(track, loc.s + LOOKAHEAD_BASE + Math.abs(body.speed) * LOOKAHEAD_PER_SPEED);

  const forces = [];
  if (goal.kind === 'chase') {
    forces.push({ force: pursue(pos, vel, goal.target, unitVelocity(goal.target), maxSpeed), weight: 1 });
  }
  else if (goal.kind === 'evade') {
    const away = evade(pos, vel, goal.target, unitVelocity(goal.target), maxSpeed);
    // Fleeing straight out of the corridor is a wall crash; blend in the racing line.
    forces.push({ force: away, weight: 0.8 }, { force: seek(pos, ahead, vel, maxSpeed), weight: 1 });
  }
  else if (goal.kind === 'reach' && Math.hypot(goal.x - body.x, goal.y - body.y) < DIRECT_REACH) {
    forces.push({ force: seek(pos, goal, vel, maxSpeed), weight: 1 });
  }
  else {
    forces.push({ force: seek(pos, ahead, vel, maxSpeed), weight: 1 });
  }
  forces.push({
    force: obstacleAvoidance(pos, vel, others.map(o => ({ position: { x: o.x, y: o.y }, radius: CAR_RADIUS * 2.2 })), maxSpeed, 70),
    weight: 1.4,
  });

  const push = combine(forces, maxSpeed * 2);
  const desired = Math.atan2(vel.y + push.y, vel.x + push.x);
  const error = wrapAngle(desired - body.heading);

  // Ease off for tight bends: compare the tangent here with the tangent further on.
  const bend = pointAt(track, loc.s + 150);
  const turn = Math.abs(wrapAngle(Math.atan2(bend.ty, bend.tx) - Math.atan2(loc.ty, loc.tx)));
  const cornerSpeed = clamp(maxSpeed * (1 - 0.9 * turn), 90, maxSpeed);

  let throttle = 1;
  if (Math.abs(error) > 1.1)
    throttle = 0.25;
  else if (body.speed > cornerSpeed)
    throttle = body.speed > cornerSpeed + 30 ? -0.6 : 0;
  return { steer: clamp(error * 2.4, -1, 1), throttle };
}

function unitVelocity(b: Body): { x: number; y: number } {
  const u = unit(b);
  return { x: u.x * b.speed, y: u.y * b.speed };
}
