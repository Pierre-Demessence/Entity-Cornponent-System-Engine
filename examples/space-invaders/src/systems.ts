import type { EntityId, SchedulableSystem } from '@pierre/ecs';
import type { Aabb } from '@pierre/ecs/modules/collision';

import type { GameState } from './game';

import { aabbVsAabb } from '@pierre/ecs/modules/collision';
import { CooldownDef, ready, trigger } from '@pierre/ecs/modules/cooldown';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { tickSpawner } from '@pierre/ecs/modules/spawner';

import {
  AlienDef,
  AlienTag,
  BombTag,
  BunkerDef,
  BunkerTag,
  MothershipTag,
  PositionDef,
  RenderableDef,
  RocketTag,
  SizeDef,
} from './components';
import {
  beatInterval,
  explode,
  FLEET_STEP_DOWN,
  FLEET_STEP_X,
  INVASION_Y,
  INVULN_MS,
  PLAYER_SPEED,
  PLAYER_W,
  ROCKET_H,
  SCREEN_H,
  SCREEN_W,
  SIDE_MARGIN,
  spawnBomb,
  spawnMothership,
  spawnRocket,
  startWave,
} from './game';

function boxOf(state: GameState, id: EntityId): Aabb | null {
  const pos = state.world.getStore(PositionDef).get(id);
  const size = state.world.getStore(SizeDef).get(id);
  if (!pos || !size)
    return null;
  return { h: size.h, w: size.w, x: pos.x, y: pos.y };
}

function moveDir(ctx: GameState): number {
  let dir = ctx.pointerDir;
  if (ctx.input.isDown('left'))
    dir -= 1;
  if (ctx.input.isDown('right'))
    dir += 1;
  return Math.sign(dir);
}

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.dead || ctx.playerId == null)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.playerId)!;
    const dir = moveDir(ctx);
    if (dir !== 0)
      ctx.started = true;
    pos.x += dir * PLAYER_SPEED * (ctx.dtMs / 1000);
    pos.x = Math.max(SIDE_MARGIN, Math.min(SCREEN_W - SIDE_MARGIN - PLAYER_W, pos.x));

    // Blink the ship while the post-hit grace window is active.
    const cd = ctx.world.getStore(CooldownDef).get(ctx.playerId);
    const r = ctx.world.getStore(RenderableDef).get(ctx.playerId);
    if (cd && r && r.kind === 'rect')
      r.fill = !ready(cd) && Math.floor(cd.remainingMs / 100) % 2 === 1 ? '#2f7d4d' : '#7CFC9B';

    const fire = ctx.input.isDown('fire') || ctx.pointerFire;
    if (fire && [...ctx.world.getTag(RocketTag)].length === 0) {
      ctx.started = true;
      spawnRocket(ctx, pos.x + PLAYER_W / 2 - 2, pos.y - ROCKET_H);
    }
  },
};

/**
 * March the fleet in discrete beats. Each beat the whole grid shifts one
 * step sideways; when a wall is hit it drops down and reverses. The beat
 * interval shrinks as aliens die, recreating the original speed-up.
 */
export const fleetSystem: SchedulableSystem<GameState> = {
  name: 'fleet',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.dead || !ctx.started)
      return;
    const aliens = [...ctx.world.getTag(AlienTag)];
    if (aliens.length === 0)
      return;
    ctx.fleetStepTimerMs -= ctx.dtMs;
    if (ctx.fleetStepTimerMs > 0)
      return;
    ctx.fleetStepTimerMs += beatInterval(ctx);

    const posStore = ctx.world.getStore(PositionDef);
    const sizeStore = ctx.world.getStore(SizeDef);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const id of aliens) {
      const pos = posStore.get(id)!;
      const size = sizeStore.get(id)!;
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + size.w);
    }

    const wouldCross = ctx.fleetDir > 0
      ? maxX + FLEET_STEP_X > SCREEN_W - SIDE_MARGIN
      : minX - FLEET_STEP_X < SIDE_MARGIN;

    if (wouldCross) {
      ctx.fleetDir *= -1;
      for (const id of aliens) {
        const pos = posStore.get(id)!;
        pos.y += FLEET_STEP_DOWN;
      }
    }
    else {
      const dx = FLEET_STEP_X * ctx.fleetDir;
      for (const id of aliens)
        posStore.get(id)!.x += dx;
    }

    for (const id of aliens) {
      const pos = posStore.get(id)!;
      const size = sizeStore.get(id)!;
      if (pos.y + size.h >= INVASION_Y) {
        ctx.dead = true;
        ctx.best = Math.max(ctx.best, ctx.score);
        return;
      }
    }
  },
};

export const bombSystem: SchedulableSystem<GameState> = {
  name: 'bomb',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.dead || !ctx.started)
      return;
    const aliens = [...ctx.world.getTag(AlienTag)];
    if (aliens.length === 0)
      return;
    tickSpawner(ctx.bombSpawner, ctx.dtMs, () => {
      // Prefer the front-most alien in a random column so bombs clear the fleet.
      const alienDef = ctx.world.getStore(AlienDef);
      const posStore = ctx.world.getStore(PositionDef);
      const col = ctx.world.getStore(AlienDef).get(aliens[Math.floor(Math.random() * aliens.length)])!.col;
      let shooter: EntityId | null = null;
      let lowestY = -Infinity;
      for (const id of aliens) {
        if (alienDef.get(id)!.col !== col)
          continue;
        const y = posStore.get(id)!.y;
        if (y > lowestY) {
          lowestY = y;
          shooter = id;
        }
      }
      shooter ??= aliens[Math.floor(Math.random() * aliens.length)];
      const box = boxOf(ctx, shooter)!;
      spawnBomb(ctx, box.x + box.w / 2 - 2, box.y + box.h);
    });
  },
};

export const mothershipSystem: SchedulableSystem<GameState> = {
  name: 'mothership',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.dead || !ctx.started)
      return;
    if ([...ctx.world.getTag(MothershipTag)].length > 0)
      return;
    tickSpawner(ctx.mothershipSpawner, ctx.dtMs, () => spawnMothership(ctx));
  },
};

export const motionSystem = makeVelocityIntegrationSystem<GameState>({
  name: 'motion',
  runAfter: ['fleet', 'bomb', 'mothership'],
});

export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.dead)
      return;
    const world = ctx.world;
    const consumed = new Set<EntityId>();
    const destroy = (id: EntityId): void => {
      consumed.add(id);
      world.queueDestroy(id);
    };

    const aliens = [...world.getTag(AlienTag)];
    const bombs = [...world.getTag(BombTag)];
    const bricks = [...world.getTag(BunkerTag)];
    const motherships = [...world.getTag(MothershipTag)];

    const damageBrick = (id: EntityId): void => {
      const brick = world.getStore(BunkerDef).get(id);
      const box = boxOf(ctx, id);
      if (!brick || !box)
        return;
      brick.hp -= 1;
      explode(ctx, box.x + box.w / 2, box.y + box.h / 2, 4, ['#3ddc6b', '#2f7d4d']);
      if (brick.hp <= 0)
        destroy(id);
    };

    // Player rockets sweep upward.
    for (const rocket of world.getTag(RocketTag)) {
      if (consumed.has(rocket))
        continue;
      const rb = boxOf(ctx, rocket);
      if (!rb)
        continue;
      let hit = false;

      for (const alien of aliens) {
        if (consumed.has(alien))
          continue;
        const ab = boxOf(ctx, alien);
        if (ab && aabbVsAabb(rb, ab)) {
          ctx.score += world.getStore(AlienDef).get(alien)!.points;
          explode(ctx, ab.x + ab.w / 2, ab.y + ab.h / 2, 12, ['#ffd23f', '#ff7b00', '#fff']);
          destroy(alien);
          destroy(rocket);
          hit = true;
          break;
        }
      }
      if (hit)
        continue;

      for (const ship of motherships) {
        if (consumed.has(ship))
          continue;
        const sb = boxOf(ctx, ship);
        if (sb && aabbVsAabb(rb, sb)) {
          const bonus = 100 + Math.floor(Math.random() * 5) * 50;
          ctx.score += bonus;
          explode(ctx, sb.x + sb.w / 2, sb.y + sb.h / 2, 22, ['#ff4d6d', '#ffd23f', '#fff']);
          destroy(ship);
          destroy(rocket);
          hit = true;
          break;
        }
      }
      if (hit)
        continue;

      // Player rockets shoot down enemy bombs.
      for (const bomb of bombs) {
        if (consumed.has(bomb))
          continue;
        const bb = boxOf(ctx, bomb);
        if (bb && aabbVsAabb(rb, bb)) {
          explode(ctx, bb.x + bb.w / 2, bb.y, 6, ['#ff9f1c', '#fff3b0']);
          destroy(bomb);
          destroy(rocket);
          hit = true;
          break;
        }
      }
      if (hit)
        continue;

      for (const brick of bricks) {
        if (consumed.has(brick))
          continue;
        const cb = boxOf(ctx, brick);
        if (cb && aabbVsAabb(rb, cb)) {
          damageBrick(brick);
          destroy(rocket);
          break;
        }
      }
    }

    // Enemy bombs fall onto the player or bunkers.
    const playerId = ctx.playerId;
    const pb = playerId != null ? boxOf(ctx, playerId) : null;
    for (const bomb of bombs) {
      if (consumed.has(bomb))
        continue;
      const bb = boxOf(ctx, bomb);
      if (!bb)
        continue;

      if (pb && aabbVsAabb(bb, pb)) {
        destroy(bomb);
        const cd = playerId != null ? ctx.world.getStore(CooldownDef).get(playerId) : null;
        if (cd && !ready(cd))
          continue;
        explode(ctx, pb.x + pb.w / 2, pb.y + pb.h / 2, 20, ['#7CFC9B', '#fff', '#ff4d6d']);
        ctx.lives -= 1;
        if (cd)
          trigger(cd, INVULN_MS);
        if (ctx.lives <= 0) {
          ctx.dead = true;
          ctx.best = Math.max(ctx.best, ctx.score);
        }
        continue;
      }

      let blocked = false;
      for (const brick of bricks) {
        if (consumed.has(brick))
          continue;
        const cb = boxOf(ctx, brick);
        if (cb && aabbVsAabb(bb, cb)) {
          damageBrick(brick);
          destroy(bomb);
          blocked = true;
          break;
        }
      }
      if (blocked)
        continue;
    }
  },
};

export const recycleSystem: SchedulableSystem<GameState> = {
  name: 'recycle',
  runAfter: ['motion'],
  run(ctx) {
    const posStore = ctx.world.getStore(PositionDef);
    const sizeStore = ctx.world.getStore(SizeDef);
    for (const id of ctx.world.getTag(RocketTag)) {
      const pos = posStore.get(id);
      if (pos && pos.y + ROCKET_H < 0)
        ctx.world.queueDestroy(id);
    }
    for (const id of ctx.world.getTag(BombTag)) {
      const pos = posStore.get(id);
      if (pos && pos.y > SCREEN_H)
        ctx.world.queueDestroy(id);
    }
    for (const id of ctx.world.getTag(MothershipTag)) {
      const pos = posStore.get(id);
      const size = sizeStore.get(id);
      if (pos && size && (pos.x + size.w < -10 || pos.x > SCREEN_W + 10))
        ctx.world.queueDestroy(id);
    }
  },
};

export const waveSystem: SchedulableSystem<GameState> = {
  name: 'wave',
  runAfter: ['collision'],
  run(ctx) {
    if (ctx.dead || !ctx.started)
      return;
    // Destroyed aliens still appear in the tag until the end-of-tick flush,
    // so an empty tag means the previous wave is fully cleared.
    if ([...ctx.world.getTag(AlienTag)].length === 0) {
      ctx.wave += 1;
      startWave(ctx);
    }
  },
};
