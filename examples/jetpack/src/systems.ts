import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from './game';

import { aabbVsAabb } from '@pierre/ecs/modules/collision';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { tickSpawner } from '@pierre/ecs/modules/spawner';

import {
  ObstacleTag,
  ParticleTag,
  PositionDef,
  SizeDef,
  VelocityDef,
} from './components';
import {
  CEIL_Y,
  explode,
  FLOOR_Y,
  GRAVITY,
  MAX_VY,
  MIN_VY,
  PLAYER_H,
  PLAYER_W,
  SCREEN_W,
  SCROLL_MAX,
  SCROLL_RAMP,
  spawnBullet,
  spawnObstacle,
  spawnParticle,
  THRUST_ACCEL,
} from './game';

export const thrustSystem: SchedulableSystem<GameState> = {
  name: 'thrust',
  run(ctx) {
    if (ctx.dead || ctx.playerId == null)
      return;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.playerId)!;
    const dt = ctx.dtMs / 1000;
    ctx.thrusting = ctx.input.isDown('thrust');
    if (ctx.thrusting)
      ctx.started = true;

    vel.vy += (GRAVITY + (ctx.thrusting ? THRUST_ACCEL : 0)) * dt;
    vel.vy = Math.max(MIN_VY, Math.min(MAX_VY, vel.vy));
  },
};

export const scrollSystem: SchedulableSystem<GameState> = {
  name: 'scroll',
  runAfter: ['thrust'],
  run(ctx) {
    if (ctx.dead || !ctx.started)
      return;
    ctx.scrollSpeed = Math.min(SCROLL_MAX, ctx.scrollSpeed + SCROLL_RAMP * (ctx.dtMs / 1000));
    const velStore = ctx.world.getStore(VelocityDef);
    for (const id of ctx.world.getTag(ObstacleTag)) {
      const vel = velStore.get(id);
      if (vel)
        vel.vx = -ctx.scrollSpeed;
    }
  },
};

export const spawnSystem: SchedulableSystem<GameState> = {
  name: 'spawn',
  runAfter: ['scroll'],
  run(ctx) {
    if (ctx.dead || !ctx.started)
      return;
    tickSpawner(ctx.obstacleSpawner, ctx.dtMs, () => spawnObstacle(ctx));
  },
};

export const bulletSystem: SchedulableSystem<GameState> = {
  name: 'bullet',
  runAfter: ['thrust'],
  run(ctx) {
    if (ctx.dead || ctx.playerId == null)
      return;
    tickSpawner(ctx.bulletSpawner, ctx.dtMs, () => {
      const pos = ctx.world.getStore(PositionDef).get(ctx.playerId!)!;
      spawnBullet(ctx, pos.x + PLAYER_W, pos.y + PLAYER_H - 6);
      // Jet exhaust puffs beneath the player while rising.
      spawnParticle(
        ctx,
        pos.x + PLAYER_W * 0.3,
        pos.y + PLAYER_H,
        -ctx.scrollSpeed * 0.4 - Math.random() * 60,
        80 + Math.random() * 140,
        280 + Math.random() * 160,
        Math.random() < 0.5 ? '#9fd2ff' : '#e8f4ff',
        3 + Math.random() * 3,
      );
    });
  },
};

export const motionSystem = makeVelocityIntegrationSystem<GameState>({
  name: 'motion',
  runAfter: ['scroll', 'spawn', 'bullet'],
});

export const playerBoundsSystem: SchedulableSystem<GameState> = {
  name: 'playerBounds',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.playerId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.playerId)!;
    if (pos.y < CEIL_Y) {
      pos.y = CEIL_Y;
      vel.vy = 0;
    }
    const floorTop = FLOOR_Y - PLAYER_H;
    if (pos.y > floorTop) {
      pos.y = floorTop;
      vel.vy = 0;
    }
  },
};

export const recycleSystem: SchedulableSystem<GameState> = {
  name: 'recycle',
  runAfter: ['motion'],
  run(ctx) {
    const posStore = ctx.world.getStore(PositionDef);
    const sizeStore = ctx.world.getStore(SizeDef);
    for (const id of ctx.world.getTag(ObstacleTag)) {
      const pos = posStore.get(id);
      const size = sizeStore.get(id);
      if (pos && size && pos.x + size.w < 0)
        ctx.world.queueDestroy(id);
    }
    for (const id of ctx.world.getTag(ParticleTag)) {
      const pos = posStore.get(id);
      if (pos && (pos.x > SCREEN_W + 40 || pos.x < -40 || pos.y > FLOOR_Y + 60))
        ctx.world.queueDestroy(id);
    }
  },
};

export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  runAfter: ['playerBounds'],
  run(ctx) {
    if (ctx.dead || ctx.playerId == null)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.playerId)!;
    const posStore = ctx.world.getStore(PositionDef);
    const sizeStore = ctx.world.getStore(SizeDef);

    for (const id of ctx.world.getTag(ObstacleTag)) {
      const op = posStore.get(id);
      const os = sizeStore.get(id);
      if (!op || !os)
        continue;
      const hit = aabbVsAabb(
        { h: PLAYER_H, w: PLAYER_W, x: pos.x, y: pos.y },
        { h: os.h, w: os.w, x: op.x, y: op.y },
      );
      if (hit) {
        ctx.dead = true;
        ctx.best = Math.max(ctx.best, ctx.score);
        explode(ctx, pos.x + PLAYER_W / 2, pos.y + PLAYER_H / 2);
        return;
      }
    }
  },
};

export const scoreSystem: SchedulableSystem<GameState> = {
  name: 'score',
  runAfter: ['scroll'],
  run(ctx) {
    if (ctx.dead || !ctx.started)
      return;
    ctx.distance += ctx.scrollSpeed * (ctx.dtMs / 1000);
    ctx.score = Math.floor(ctx.distance / 10);
  },
};
