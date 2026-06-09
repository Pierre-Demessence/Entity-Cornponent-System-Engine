import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState, PlayerSlot } from '../game';

import { circleVsCircle, makeTriggerSystem } from '@pierre/ecs/modules/collision';
import { burst } from '@pierre/ecs/modules/particles';

import {
  PositionDef,
  ShapeCircleDef,
  Ship1Tag,
  Ship2Tag,
  StarTag,
  TorpedoTag,
} from '../components';
import {
  CELL_SIZE,
  despawn,
  despawnShip,
  spawnShip,
  WIN_SCORE,
} from '../game';

function otherPlayer(slot: PlayerSlot): PlayerSlot {
  return slot === 1 ? 2 : 1;
}

interface DeathRecord {
  deadId: EntityId;
  killedBy: PlayerSlot | null;
  pos: { x: number; y: number };
  slot: PlayerSlot;
}

function makeCollisionSystem(): SchedulableSystem<GameState> {
  const destroyed = new Set<EntityId>();
  let shipDeaths: DeathRecord[] = [];
  let mutualTorpedoKills: Array<readonly [EntityId, EntityId]> = [];
  let torpedoHits: EntityId[] = [];

  const trigger = makeTriggerSystem<GameState>({
    name: 'collision-pairs',
    broadphase(ctx) {
      destroyed.clear();
      shipDeaths = [];
      mutualTorpedoKills = [];
      torpedoHits = [];

      const posStore = ctx.world.getStore(PositionDef);
      // Walk every ship and torpedo; query the neighbourhood of each
      const pairs: Array<readonly [EntityId, EntityId]> = [];
      const origins = new Set<EntityId>();

      for (const tag of [Ship1Tag, Ship2Tag, TorpedoTag]) {
        for (const aId of ctx.world.getTag(tag)) {
          origins.add(aId);
          const aPos = posStore.get(aId);
          if (!aPos)
            continue;
          for (const bId of ctx.grid.queryNear(aPos.x, aPos.y, 2 * CELL_SIZE)) {
            if (bId === aId || origins.has(bId))
              continue;
            pairs.push([aId, bId] as const);
          }
        }
      }
      return pairs;
    },
    onOverlap(ctx, aId, bId) {
      if (destroyed.has(aId) || destroyed.has(bId))
        return;

      const aIsShip1 = ctx.world.getTag(Ship1Tag).has(aId);
      const aIsShip2 = ctx.world.getTag(Ship2Tag).has(aId);
      const aIsTorp = ctx.world.getTag(TorpedoTag).has(aId);
      const bIsShip1 = ctx.world.getTag(Ship1Tag).has(bId);
      const bIsShip2 = ctx.world.getTag(Ship2Tag).has(bId);
      const bIsTorp = ctx.world.getTag(TorpedoTag).has(bId);
      const aIsShip = aIsShip1 || aIsShip2;
      const bIsShip = bIsShip1 || bIsShip2;

      // Ship ↔ Ship: both lose, and neither scores (neutral mutual destruction).
      if (aIsShip && bIsShip) {
        const aSlot: PlayerSlot = aIsShip1 ? 1 : 2;
        const bSlot: PlayerSlot = bIsShip1 ? 1 : 2;
        const aPos = ctx.world.getStore(PositionDef).get(aId)!;
        const bPos = ctx.world.getStore(PositionDef).get(bId)!;
        destroyed.add(aId);
        destroyed.add(bId);
        shipDeaths.push({ deadId: aId, killedBy: null, pos: aPos, slot: aSlot });
        shipDeaths.push({ deadId: bId, killedBy: null, pos: bPos, slot: bSlot });
        return;
      }

      // Torpedo ↔ Torpedo: both destroyed
      if (aIsTorp && bIsTorp) {
        destroyed.add(aId);
        destroyed.add(bId);
        mutualTorpedoKills.push([aId, bId]);
        return;
      }

      // Torpedo ↔ Ship: the ship dies and the OTHER player scores. Torpedoes are
      // unowned, so a gravity-slingshot self-hit also credits the opponent —
      // consistent with the spec's "if a torpedo hits a player, the other wins".
      if (aIsTorp && bIsShip) {
        const bSlot: PlayerSlot = bIsShip1 ? 1 : 2;
        const bPos = ctx.world.getStore(PositionDef).get(bId)!;
        destroyed.add(aId);
        destroyed.add(bId);
        torpedoHits.push(aId);
        shipDeaths.push({ deadId: bId, killedBy: otherPlayer(bSlot), pos: bPos, slot: bSlot });
        return;
      }
      if (aIsShip && bIsTorp) {
        const aSlot: PlayerSlot = aIsShip1 ? 1 : 2;
        const aPos = ctx.world.getStore(PositionDef).get(aId)!;
        destroyed.add(aId);
        destroyed.add(bId);
        torpedoHits.push(bId);
        shipDeaths.push({ deadId: aId, killedBy: otherPlayer(aSlot), pos: aPos, slot: aSlot });
      }
    },
    overlaps(ctx, aId, bId) {
      // Skip star collisions
      if (ctx.world.getTag(StarTag).has(aId) || ctx.world.getTag(StarTag).has(bId))
        return false;
      const posStore = ctx.world.getStore(PositionDef);
      const radStore = ctx.world.getStore(ShapeCircleDef);
      const aPos = posStore.get(aId);
      const aRad = radStore.get(aId);
      const bPos = posStore.get(bId);
      const bRad = radStore.get(bId);
      if (!aPos || !aRad || !bPos || !bRad)
        return false;
      return circleVsCircle(aPos, aRad.radius, bPos, bRad.radius);
    },
  });

  return {
    name: 'collision',
    runAfter: ['movement'],
    run(ctx) {
      trigger.run(ctx);

      // Torpedo↔Torpedo mutual destruction
      for (const [aId, bId] of mutualTorpedoKills) {
        const aPos = ctx.world.getStore(PositionDef).get(aId);
        if (aPos) {
          burst(ctx.world, {
            colors: ['#fe6', '#fa0'],
            count: 4,
            fadeOut: true,
            lifetimeMs: [180, 360],
            position: { x: aPos.x, y: aPos.y },
            size: [2, 4],
            speed: [40, 120],
          });
        }
        despawn(ctx, aId);
        despawn(ctx, bId);
      }

      // Despawn torpedoes that struck a ship (otherwise they pierce through and
      // can rack up multiple kills — and multiple points — from a single shot).
      for (const torpId of torpedoHits) {
        despawn(ctx, torpId);
      }

      // Ship deaths
      for (const { deadId, killedBy, pos, slot } of shipDeaths) {
        // Spawn explosion particles
        burst(ctx.world, {
          colors: ['#cfd8dc', '#ff8a65', '#ffcc80', '#ffffff'],
          count: 18,
          fadeOut: true,
          lifetimeMs: [400, 800],
          position: { x: pos.x, y: pos.y },
          shrink: true,
          size: [2, 6],
          speed: [60, 260],
        });

        despawnShip(ctx, deadId);
        ctx.shipIds[slot] = null;
        ctx.events.emit({ type: 'ShipDestroyed' });

        // A torpedo kill scores for the shooter; a mutual ram (killedBy === null)
        // destroys both ships without awarding a point. Once the game is over,
        // stop scoring so a same-tick double-kill can't overwrite the winner.
        if (killedBy != null && !ctx.dead) {
          ctx.scores[killedBy] += 1;
          ctx.events.emit({ scorer: killedBy, type: 'PlayerScored' });

          if (ctx.scores[killedBy] >= WIN_SCORE) {
            ctx.dead = true;
            ctx.winner = killedBy;
            ctx.events.emit({ type: 'GameOver', winner: killedBy });
            // Clear ship refs so input stops
            ctx.shipIds[1] = null;
            ctx.shipIds[2] = null;
          }
        }
      }

      // Respawn destroyed ships if game is still live
      if (!ctx.dead) {
        for (const slot of [1, 2] as const) {
          if (ctx.shipIds[slot] === null) {
            ctx.shipIds[slot] = spawnShip(ctx, slot);
          }
        }
      }
    },
  };
}

export const collisionSystem: SchedulableSystem<GameState> = makeCollisionSystem();
