import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from './game';

import { easeOutCubic } from '@pierre/ecs/modules/easing';
import { clamp, lerp, lerpAngle, smoothstep } from '@pierre/ecs/modules/math';
import { burst } from '@pierre/ecs/modules/particles';

import { CameraDef, LanderDef, PositionDef, VelocityDef } from './components';
import { FUEL_BONUS, FUEL_BURN, GRAVITY, LEG_DROP, MAX_SPIN, SPIN_ACCEL, SPIN_DAMP, THRUST } from './game';
import { FUEL_MAX, judgeTouchdown, LEG_SPREAD } from './landing';
import { heightAt, WORLD_W } from './terrain';

const MIN_ZOOM = 1;
const MAX_ZOOM = 2.6;
const ZOOM_SMOOTHING = 2.5;
const SETTLE_RATE = 6;

const TAU = Math.PI * 2;

/** Wrap an angle to `[-π, π)`. */
function wrapAngle(a: number): number {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** Exponential-decay blend factor for a per-second `rate` over `dt` seconds. */
function blend(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

const CRASH_TEXT = {
  angle: 'Crashed: tilted on touchdown',
  pad: 'Crashed: missed the pad',
  speed: 'Crashed: came in too fast',
} as const;

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.landerId == null)
      return;
    const lander = ctx.world.getStore(LanderDef).get(ctx.landerId)!;
    if (ctx.phase !== 'flying') {
      lander.thrusting = false;
      return;
    }
    const dt = ctx.dtMs / 1000;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.landerId)!;

    const turn = (ctx.input.isDown('right') ? 1 : 0) - (ctx.input.isDown('left') ? 1 : 0);
    lander.spin = turn === 0
      ? lerp(lander.spin, 0, blend(SPIN_DAMP, dt))
      : clamp(lander.spin + turn * SPIN_ACCEL * dt, -MAX_SPIN, MAX_SPIN);
    lander.angle = wrapAngle(lander.angle + lander.spin * dt);

    lander.thrusting = ctx.input.isDown('thrust') && lander.fuel > 0;
    if (lander.thrusting) {
      lander.fuel = Math.max(0, lander.fuel - FUEL_BURN * dt);
      vel.vx += Math.sin(lander.angle) * THRUST * dt;
      vel.vy -= Math.cos(lander.angle) * THRUST * dt;
    }
  },
};

export const gravitySystem: SchedulableSystem<GameState> = {
  name: 'gravity',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.phase !== 'flying' || ctx.landerId == null)
      return;
    ctx.world.getStore(VelocityDef).get(ctx.landerId)!.vy += GRAVITY * (ctx.dtMs / 1000);
  },
};

/** Exhaust sparks while the engine burns, thrown opposite the thrust vector. */
export const exhaustSystem: SchedulableSystem<GameState> = {
  name: 'exhaust',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.phase !== 'flying' || ctx.landerId == null)
      return;
    const lander = ctx.world.getStore(LanderDef).get(ctx.landerId)!;
    if (!lander.thrusting)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.landerId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.landerId)!;
    const nx = -Math.sin(lander.angle);
    const ny = Math.cos(lander.angle);
    burst(ctx.world, {
      angle: Math.atan2(ny, nx),
      colors: ['#ffd23f', '#ff9f1c', '#ff5d5d'],
      count: 2,
      fadeOut: true,
      lifetimeMs: [180, 380],
      position: { x: pos.x + nx * (LEG_DROP + 2), y: pos.y + ny * (LEG_DROP + 2) },
      shrink: true,
      size: [2, 4],
      speed: [70 + vel.vy * 0.2, 150],
      spread: 0.22,
    });
  },
};

export const contactSystem: SchedulableSystem<GameState> = {
  name: 'contact',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.phase !== 'flying' || ctx.landerId == null)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.landerId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.landerId)!;
    const lander = ctx.world.getStore(LanderDef).get(ctx.landerId)!;

    // The map edges are walls, not part of the challenge.
    if (pos.x < 20 || pos.x > WORLD_W - 20) {
      pos.x = clamp(pos.x, 20, WORLD_W - 20);
      vel.vx = 0;
    }

    const footY = pos.y + LEG_DROP;
    const left = heightAt(ctx.terrain, pos.x - LEG_SPREAD);
    const right = heightAt(ctx.terrain, pos.x + LEG_SPREAD);
    if (footY < Math.min(left, right))
      return;

    const verdict = judgeTouchdown(ctx.terrain, {
      angle: lander.angle,
      fuel: lander.fuel,
      vx: vel.vx,
      vy: vel.vy,
      x: pos.x,
    });
    lander.thrusting = false;
    vel.vx = 0;
    vel.vy = 0;

    if (verdict.kind === 'landed') {
      pos.y = verdict.pad.y - LEG_DROP;
      ctx.phase = 'landed';
      ctx.landings += 1;
      ctx.score += verdict.score;
      lander.fuel = Math.min(FUEL_MAX, lander.fuel + FUEL_BONUS);
      ctx.message = { ageMs: 0, text: `Landed x${verdict.pad.multiplier}  +${verdict.score}` };
      return;
    }

    ctx.phase = 'crashed';
    ctx.message = { ageMs: 0, text: CRASH_TEXT[verdict.reason] };
    burst(ctx.world, {
      colors: ['#ffd23f', '#ff9f1c', '#ff5d5d', '#cfd8dc'],
      count: 46,
      fadeOut: true,
      gravity: { x: 0, y: 90 },
      lifetimeMs: [500, 1300],
      position: { x: pos.x, y: pos.y },
      shrink: true,
      size: [2, 6],
      speed: [40, 260],
    });
  },
};

/** After a good landing the hull eases upright onto its feet. */
export const settleSystem: SchedulableSystem<GameState> = {
  name: 'settle',
  runAfter: ['contact'],
  run(ctx) {
    if (ctx.landerId == null)
      return;
    if (ctx.message)
      ctx.message.ageMs += ctx.dtMs;
    if (ctx.phase !== 'landed')
      return;
    const lander = ctx.world.getStore(LanderDef).get(ctx.landerId)!;
    lander.angle = lerpAngle(lander.angle, 0, blend(SETTLE_RATE, ctx.dtMs / 1000));
  },
};

/** Zoom in as the lander nears the ground; the ease keeps the transition gentle. */
export const cameraZoomSystem: SchedulableSystem<GameState> = {
  name: 'cameraZoom',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.landerId == null || ctx.cameraId == null)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.landerId)!;
    const cam = ctx.world.getStore(CameraDef).get(ctx.cameraId)!;
    const altitude = heightAt(ctx.terrain, pos.x) - pos.y;
    const closeness = 1 - smoothstep(70, 450, altitude);
    const target = lerp(MIN_ZOOM, MAX_ZOOM, easeOutCubic(closeness));
    cam.zoom = lerp(cam.zoom, target, blend(ZOOM_SMOOTHING, ctx.dtMs / 1000));
  },
};
