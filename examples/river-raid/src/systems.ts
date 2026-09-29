import type { EntityId, SchedulableSystem } from '@pierre/ecs';
import type { Aabb } from '@pierre/ecs/modules/collision';

import type { GameState } from './game';

import { aabbVsAabb } from '@pierre/ecs/modules/collision';
import { CooldownDef, makeCooldownSystem, ready, trigger } from '@pierre/ecs/modules/cooldown';
import { clamp } from '@pierre/ecs/modules/math';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { pick } from '@pierre/ecs/modules/rng';
import { tickSpawner } from '@pierre/ecs/modules/spawner';
import { finished, restart, tickTimer } from '@pierre/ecs/modules/timer';

import {
  BridgeDef,
  BridgeTag,
  BulletTag,
  EnemyDef,
  EnemyTag,
  FuelDepotTag,
  PositionDef,
  ShapeAabbDef,
} from './components';
import {
  FUEL_DEPOT_REFILL,
  FUEL_DRAIN_RATE,
  generateSegments,
  JET_H,
  JET_W,
  LEVEL_DISTANCE,
  MAX_FUEL,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  PLAYER_SCREEN_Y,
  resetGame,
  respawnPlayer,
  SCREEN_H,
  SCREEN_W,
  SCROLL_ACCEL,
  SHOOT_COOLDOWN_MS,
  spawnBridge,
  spawnBullet,
  spawnEnemy,
  spawnFuelDepot,
} from './game';

function boxAt(pos: { x: number; y: number }, size: { h: number; w: number }): Aabb {
  return { h: size.h, w: size.w, x: pos.x, y: pos.y };
}

function segmentAt(state: GameState, worldY: number) {
  for (let i = state.segments.length - 1; i >= 0; i--) {
    if (state.segments[i].y <= worldY)
      return state.segments[i];
  }
  return state.segments[0];
}

function movePlayer(ctx: GameState, dir: -1 | 1): void {
  if (ctx.playerId == null)
    return;
  const pos = ctx.world.getStore(PositionDef).get(ctx.playerId);
  if (!pos)
    return;
  const speed = 240;
  pos.x += dir * speed * (ctx.dtMs / 1000);
  // Player Y is world Y; clamp X to river banks at player's world Y
  const seg = segmentAt(ctx, pos.y);
  if (seg) {
    pos.x = clamp(pos.x, seg.leftX + 2, seg.rightX - JET_W - 2);
  }
  else {
    pos.x = clamp(pos.x, 0, SCREEN_W - JET_W);
  }
}

function playerInControl(ctx: GameState): boolean {
  return !ctx.dying && !ctx.gameOver;
}

// ─── Input System ──────────────────────────────────────────────────

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  runAfter: ['cooldown'],
  run(ctx) {
    if (ctx.dying) {
      tickTimer(ctx.deathTimer, ctx.dtMs);
      if (finished(ctx.deathTimer))
        respawnPlayer(ctx);
      return;
    }

    if (ctx.gameOver) {
      if (ctx.input.justPressed('reset'))
        resetGame(ctx);
      return;
    }

    if (ctx.input.isDown('left'))
      movePlayer(ctx, -1);
    if (ctx.input.isDown('right'))
      movePlayer(ctx, 1);

    if (ctx.input.isDown('accelerate')) {
      ctx.scrollSpeed = Math.min(MAX_SCROLL_SPEED, ctx.scrollSpeed + SCROLL_ACCEL * (ctx.dtMs / 1000));
    }
    else if (ctx.input.isDown('brake')) {
      ctx.scrollSpeed = Math.max(MIN_SCROLL_SPEED, ctx.scrollSpeed - SCROLL_ACCEL * (ctx.dtMs / 1000));
    }

    // Fire: held + cooldown gate
    if (ctx.input.isDown('fire') && ctx.playerId != null) {
      const cdStore = ctx.world.getStore(CooldownDef);
      const cd = cdStore.get(ctx.playerId);
      if (cd && ready(cd)) {
        spawnBullet(ctx);
        trigger(cd, SHOOT_COOLDOWN_MS);
      }
    }
  },
};

// ─── Cooldown System ────────────────────────────────────────────────

export const cooldownSystem = makeCooldownSystem<GameState>();

// ─── Scroll System ─────────────────────────────────────────────────

export const scrollSystem: SchedulableSystem<GameState> = {
  name: 'scroll',
  runAfter: ['input'],
  runIf: playerInControl,
  run(ctx) {
    // Advance scroll
    ctx.scrollOffset += ctx.scrollSpeed * (ctx.dtMs / 1000);
    ctx.levelProgress += ctx.scrollSpeed * (ctx.dtMs / 1000);

    // Level transition
    if (ctx.levelProgress >= LEVEL_DISTANCE) {
      ctx.levelProgress -= LEVEL_DISTANCE;
      ctx.level++;
    }

    // Keep player at fixed screen Y by updating world Y with scroll.
    if (ctx.playerId != null) {
      const pos = ctx.world.getStore(PositionDef).get(ctx.playerId);
      if (pos)
        pos.y = ctx.scrollOffset + SCREEN_H - PLAYER_SCREEN_Y;
    }

    // Generate new segments ahead
    generateSegments(ctx);

    // Spawn enemies, fuel depots, bridges ahead
    spawnContent(ctx);

    // Remove off-screen entities (below screen)
    cleanupOffscreen(ctx);
  },
};

// ─── Spawn Logic ───────────────────────────────────────────────────

const ENEMY_KINDS: ReadonlyArray<'boat' | 'helicopter' | 'jet'> = ['boat', 'boat', 'helicopter', 'jet'];

function spawnContent(ctx: GameState): void {
  // Enemy spawning — spawn ahead (above the visible area, HIGHER world Y)
  // screenY = SCREEN_H + scrollOffset - worldY; for screenY < 0, need worldY > SCREEN_H + scrollOffset
  tickSpawner(ctx.enemySpawner, ctx.dtMs, () => {
    const kind = pick(ENEMY_KINDS)!;
    const spawnWorldY = ctx.scrollOffset + SCREEN_H + 40 + Math.random() * 200;
    spawnEnemy(ctx, spawnWorldY, kind);
  });

  // Fuel depot spawning — spawn ahead (above the screen)
  tickSpawner(ctx.depotSpawner, ctx.dtMs, () => {
    const spawnWorldY = ctx.scrollOffset + SCREEN_H + 60 + Math.random() * 300;
    spawnFuelDepot(ctx, spawnWorldY);
  });

  // Bridge spawning (at level boundary) — spawn ahead (above the screen)
  const distInLevel = ctx.levelProgress;
  const bridgeZone = LEVEL_DISTANCE - 200;
  if (distInLevel >= bridgeZone && !ctx.bridgeSpawned) {
    const bridgeWorldY = ctx.scrollOffset + SCREEN_H + 40;
    spawnBridge(ctx, bridgeWorldY);
    ctx.bridgeSpawned = true;
  }
  if (distInLevel < bridgeZone) {
    ctx.bridgeSpawned = false;
  }
}

function cleanupOffscreen(ctx: GameState): void {
  const stores = ctx.world;
  const toRemove: EntityId[] = [];

  for (const tag of [BulletTag, EnemyTag, FuelDepotTag, BridgeTag]) {
    for (const id of ctx.world.getTag(tag)) {
      const pos = stores.getStore(PositionDef).get(id);
      const size = stores.getStore(ShapeAabbDef).get(id);
      if (!pos || !size)
        continue;
      const sy = SCREEN_H + ctx.scrollOffset - pos.y;
      if (tag === BulletTag) {
        // Bullets: remove when off top of screen
        if (sy + size.h < -50)
          toRemove.push(id);
      }
      else {
        // Enemies/depots/bridges: remove only when FAR below screen (passed player)
        // or far off horizontally. Never remove for being above — that's where they spawn.
        if (sy > SCREEN_H + 400
          || pos.x + size.w < -100 || pos.x > SCREEN_W + 100) {
          toRemove.push(id);
        }
      }
    }
  }

  // Also clean up old segments
  while (ctx.segments.length > 0 && ctx.segments[0].y < ctx.scrollOffset - 200) {
    ctx.segments.shift();
  }

  for (const id of toRemove) {
    ctx.world.destroyEntity(id);
  }
}

// ─── Motion System ─────────────────────────────────────────────────

export const motionSystem = makeVelocityIntegrationSystem<GameState>({
  name: 'motion',
  runAfter: ['scroll'],
});

// ─── Collision System ──────────────────────────────────────────────

function killPlayer(ctx: GameState): void {
  if (ctx.dying)
    return;
  ctx.lives--;
  ctx.dying = true;
  restart(ctx.deathTimer);
  if (ctx.playerId != null) {
    ctx.world.destroyEntity(ctx.playerId);
    ctx.playerId = null;
  }
}

export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  runAfter: ['motion'],
  runIf: playerInControl,
  run(ctx) {
    if (ctx.playerId == null)
      return;

    const playerPos = ctx.world.getStore(PositionDef).get(ctx.playerId);
    if (!playerPos)
      return;
    const playerBox = boxAt(playerPos, { h: JET_H, w: JET_W });

    // Player vs banks (player position is in world coords)
    const seg = segmentAt(ctx, playerPos.y);
    if (seg) {
      if (playerPos.x < seg.leftX || playerPos.x + JET_W > seg.rightX) {
        killPlayer(ctx);
        return;
      }
    }

    // Player vs enemies
    for (const eid of ctx.world.getTag(EnemyTag)) {
      const epos = ctx.world.getStore(PositionDef).get(eid);
      const esize = ctx.world.getStore(ShapeAabbDef).get(eid);
      if (!epos || !esize)
        continue;
      // Only check if enemy is roughly on screen
      const sy = SCREEN_H + ctx.scrollOffset - epos.y;
      if (sy < -50 || sy > SCREEN_H + 50)
        continue;
      if (aabbVsAabb(playerBox, boxAt(epos, esize))) {
        killPlayer(ctx);
        return;
      }
    }

    // Player vs bridge
    for (const bid of ctx.world.getTag(BridgeTag)) {
      const bpos = ctx.world.getStore(PositionDef).get(bid);
      const bsize = ctx.world.getStore(ShapeAabbDef).get(bid);
      if (!bpos || !bsize)
        continue;
      if (aabbVsAabb(playerBox, boxAt(bpos, bsize))) {
        killPlayer(ctx);
        return;
      }
    }

    // Player vs fuel depots (collect fuel, don't die)
    for (const fid of ctx.world.getTag(FuelDepotTag)) {
      const fpos = ctx.world.getStore(PositionDef).get(fid);
      const fsize = ctx.world.getStore(ShapeAabbDef).get(fid);
      if (!fpos || !fsize)
        continue;
      if (aabbVsAabb(playerBox, boxAt(fpos, fsize))) {
        ctx.fuel = Math.min(MAX_FUEL, ctx.fuel + FUEL_DEPOT_REFILL);
        ctx.world.destroyEntity(fid);
      }
    }

    // Bullets vs enemies, bridges, fuel depots
    for (const bid of ctx.world.getTag(BulletTag)) {
      const bpos = ctx.world.getStore(PositionDef).get(bid);
      const bsize = ctx.world.getStore(ShapeAabbDef).get(bid);
      if (!bpos || !bsize)
        continue;
      const bulletBox = boxAt(bpos, bsize);
      let bulletUsed = false;

      // vs enemies
      for (const eid of ctx.world.getTag(EnemyTag)) {
        const epos = ctx.world.getStore(PositionDef).get(eid);
        const esize = ctx.world.getStore(ShapeAabbDef).get(eid);
        const edef = ctx.world.getStore(EnemyDef).get(eid);
        if (!epos || !esize || !edef)
          continue;
        if (aabbVsAabb(bulletBox, boxAt(epos, esize))) {
          ctx.score += edef.points;
          ctx.world.destroyEntity(eid);
          bulletUsed = true;
          break;
        }
      }

      // vs bridges
      if (!bulletUsed) {
        for (const brid of ctx.world.getTag(BridgeTag)) {
          const brpos = ctx.world.getStore(PositionDef).get(brid);
          const brsize = ctx.world.getStore(ShapeAabbDef).get(brid);
          const brdef = ctx.world.getStore(BridgeDef).get(brid);
          if (!brpos || !brsize || !brdef)
            continue;
          if (aabbVsAabb(bulletBox, boxAt(brpos, brsize))) {
            brdef.hp--;
            if (brdef.hp <= 0) {
              ctx.score += 100;
              ctx.world.destroyEntity(brid);
            }
            bulletUsed = true;
            break;
          }
        }
      }

      // vs fuel depots
      if (!bulletUsed) {
        for (const fid of ctx.world.getTag(FuelDepotTag)) {
          const fpos = ctx.world.getStore(PositionDef).get(fid);
          const fsize = ctx.world.getStore(ShapeAabbDef).get(fid);
          if (!fpos || !fsize)
            continue;
          if (aabbVsAabb(bulletBox, boxAt(fpos, fsize))) {
            ctx.score += 50;
            ctx.world.destroyEntity(fid);
            bulletUsed = true;
            break;
          }
        }
      }

      if (bulletUsed) {
        ctx.world.destroyEntity(bid);
      }
    }
  },
};

// ─── Fuel System ────────────────────────────────────────────────────

export const fuelSystem: SchedulableSystem<GameState> = {
  name: 'fuel',
  runAfter: ['collision'],
  runIf: playerInControl,
  run(ctx) {
    // Fuel drains proportionally to scroll speed
    const drainRate = FUEL_DRAIN_RATE * (ctx.scrollSpeed / 120);
    ctx.fuel -= drainRate * (ctx.dtMs / 1000);
    if (ctx.fuel <= 0) {
      ctx.fuel = 0;
      killPlayer(ctx);
    }
  },
};
