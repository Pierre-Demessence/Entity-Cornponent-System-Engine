import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  BlockDef,
  EnemyIntentDef,
  HealthDef,
  InHandTag,
} from '../components';
import {
  discardHand,
  drawCards,
  ENEMY_ATTACK,
  ENEMY_BLOCK,
  ENERGY_PER_TURN,
  HAND_SIZE,
} from '../game';

/**
 * Turn system. Responsible for:
 *
 * 1. Detecting victory/defeat from HP and transitioning phase.
 * 2. Draining `endTurnPending`: on player turn end, discard hand, run
 *    enemy intent, flip to enemy phase, resolve enemy action, roll
 *    new intent, reset player block, start new player turn (reset
 *    energy, draw new hand).
 *
 * The entire end-of-turn ceremony happens within a single tick for
 * simplicity — no animations to gate it behind, so the player sees an
 * instant transition. A polished game would split this across multiple
 * ticks.
 */
export const turnSystem: SchedulableSystem<GameState> = {
  name: 'turn',
  run(ctx) {
    // Victory / defeat checks always run.
    if (ctx.phase !== 'victory' && ctx.phase !== 'defeat') {
      const enemyHp = ctx.world.getStore(HealthDef).get(ctx.enemyId);
      const playerHp = ctx.world.getStore(HealthDef).get(ctx.playerId);
      if (enemyHp && enemyHp.current <= 0) {
        ctx.phase = 'victory';
        return;
      }
      if (playerHp && playerHp.current <= 0) {
        ctx.phase = 'defeat';
        return;
      }
    }

    if (!ctx.endTurnPending)
      return;
    if (ctx.phase !== 'player')
      return; // ignore end-turn during enemy resolution
    if (ctx.drag !== null)
      return; // don't end turn mid-drag (see plan §edge cases)

    ctx.endTurnPending = false;
    endPlayerTurn(ctx);
    runEnemyTurn(ctx);
    startPlayerTurn(ctx);
  },
};

function endPlayerTurn(ctx: GameState): void {
  discardHand(ctx);
  ctx.events.emit({ type: 'TurnEnded' });
}

function runEnemyTurn(ctx: GameState): void {
  ctx.phase = 'enemy';
  const intent = ctx.world.getStore(EnemyIntentDef).get(ctx.enemyId);
  if (!intent)
    return;
  if (intent.kind === 'attack') {
    const playerHp = ctx.world.getStore(HealthDef).get(ctx.playerId);
    const playerBlock = ctx.world.getStore(BlockDef).get(ctx.playerId);
    if (!playerHp)
      return;
    let dmg = intent.value;
    if (playerBlock && playerBlock.amount > 0) {
      const absorbed = Math.min(playerBlock.amount, dmg);
      playerBlock.amount -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) {
      playerHp.current = Math.max(0, playerHp.current - dmg);
      ctx.events.emit({ amount: dmg, type: 'PlayerDamaged' });
    }
  }
  else if (intent.kind === 'block') {
    const enemyBlock = ctx.world.getStore(BlockDef).get(ctx.enemyId);
    if (enemyBlock)
      enemyBlock.amount += intent.value;
  }
  // Roll next intent: alternate attack/block so gameplay has texture.
  intent.kind = intent.kind === 'attack' ? 'block' : 'attack';
  intent.value = intent.kind === 'attack' ? ENEMY_ATTACK : ENEMY_BLOCK;
}

function startPlayerTurn(ctx: GameState): void {
  if (ctx.phase === 'victory' || ctx.phase === 'defeat')
    return;
  // Defeat may have been triggered by enemy attack in runEnemyTurn; re-check.
  const playerHp = ctx.world.getStore(HealthDef).get(ctx.playerId);
  if (playerHp && playerHp.current <= 0) {
    ctx.phase = 'defeat';
    return;
  }
  ctx.phase = 'player';
  // Reset player block (Slay-the-Spire convention: block doesn't persist).
  const playerBlock = ctx.world.getStore(BlockDef).get(ctx.playerId);
  if (playerBlock)
    playerBlock.amount = 0;
  ctx.energy = ENERGY_PER_TURN;
  drawCards(ctx, HAND_SIZE - ctx.world.getTag(InHandTag).size);
}
