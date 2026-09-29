import type { EntityId, EventBus } from '@pierre/ecs';
import type { DragDrop } from '@pierre/ecs/modules/drag-drop';
import type { InputState, PointerState } from '@pierre/ecs/modules/input';

import type { CardDef } from './cards';

import { EcsWorld } from '@pierre/ecs';
import { addToPile, createPile, installPiles, moveAll, moveTop, pileSize, shufflePile } from '@pierre/ecs/modules/pile';
import { DomRenderableDef } from '@pierre/ecs/modules/render-dom';
import { PositionDef } from '@pierre/ecs/modules/transform';

import { buildStartingDeck } from './cards';
import {
  BlockDef,
  CardDefComp,
  EnemyIntentDef,
  EnemyTag,
  HealthDef,
  PlayerTag,
} from './components';

export const HAND_SIZE = 5;
export const ENERGY_PER_TURN = 3;
export const PLAYER_MAX_HP = 40;
export const ENEMY_MAX_HP = 30;
export const ENEMY_ATTACK = 8;
export const ENEMY_BLOCK = 5;

export type Phase = 'player' | 'enemy' | 'victory' | 'defeat';

export type Action = 'drag' | 'reset';

export type CardEvent
  = | { type: 'CardPlayed'; cardId: EntityId }
    | { type: 'EnemyDamaged'; amount: number }
    | { type: 'PlayerDamaged'; amount: number }
    | { type: 'TurnEnded' };

/** The three pile entities a card moves between. */
export interface Piles {
  deck: EntityId;
  discard: EntityId;
  hand: EntityId;
}

export interface GameState {
  /**
   * Card drag, in client (viewport) pixels — the space `entityAtPoint`
   * hit-tests in. The payload is the dragged card; the one drop target is the
   * enemy.
   */
  drag: DragDrop<EntityId, EntityId>;
  dtMs: number;
  elapsedMs: number;
  /** Set by the End-Turn button handler, drained by `turnSystem`. */
  endTurnPending: boolean;
  enemyId: EntityId;
  energy: number;
  energyMax: number;
  events: EventBus<CardEvent>;
  input: InputState<Action>;
  phase: Phase;
  /** Replaced by `resetGame`, which recreates the world's piles. */
  piles: Piles;
  playerId: EntityId;
  pointer: PointerState;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(CardDefComp);
  w.registerComponent(DomRenderableDef);
  w.registerComponent(HealthDef);
  w.registerComponent(BlockDef);
  w.registerComponent(EnemyIntentDef);
  w.registerComponent(PositionDef);
  installPiles(w);
  w.registerTag(PlayerTag);
  w.registerTag(EnemyTag);
  return w;
}

/** Create the card entities and the three piles, with every card in the deck. */
function spawnPiles(state: GameState, deck: CardDef[]): Piles {
  const cardStore = state.world.getStore(CardDefComp);
  const cards = deck.map((def) => {
    const id = state.world.createEntity();
    cardStore.set(id, { def });
    return id;
  });
  return {
    deck: createPile(state.world, cards),
    discard: createPile(state.world),
    hand: createPile(state.world),
  };
}

function spawnPlayer(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(HealthDef).set(id, { current: PLAYER_MAX_HP, max: PLAYER_MAX_HP });
  state.world.getStore(BlockDef).set(id, { amount: 0 });
  state.world.getTag(PlayerTag).add(id);
  return id;
}

function spawnEnemy(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(HealthDef).set(id, { current: ENEMY_MAX_HP, max: ENEMY_MAX_HP });
  state.world.getStore(BlockDef).set(id, { amount: 0 });
  state.world.getStore(EnemyIntentDef).set(id, { kind: 'attack', value: ENEMY_ATTACK });
  state.world.getTag(EnemyTag).add(id);
  return id;
}

/** Full world wipe + repopulate. Called at startup and on Reset. */
export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();

  state.phase = 'player';
  state.energyMax = ENERGY_PER_TURN;
  state.energy = ENERGY_PER_TURN;
  state.drag.cancel();
  state.endTurnPending = false;
  state.elapsedMs = 0;

  state.playerId = spawnPlayer(state);
  state.enemyId = spawnEnemy(state);

  state.piles = spawnPiles(state, buildStartingDeck());
  shufflePile(state.world, state.piles.deck);

  drawCards(state, HAND_SIZE);
}

/**
 * Draw `count` cards from the top of the deck into the hand, reshuffling the
 * discard pile into the deck if it runs empty mid-draw. If both are empty the
 * draw stops early.
 */
export function drawCards(state: GameState, count: number): void {
  const { deck, discard, hand } = state.piles;
  for (let i = 0; i < count; i++) {
    if (pileSize(state.world, deck) === 0) {
      if (pileSize(state.world, discard) === 0) {
        console.warn('[card-battler] draw aborted: deck and discard are both empty');
        return;
      }
      moveAll(state.world, discard, deck);
      shufflePile(state.world, deck);
    }
    moveTop(state.world, deck, hand);
  }
}

/** Discard entire hand (end-of-turn ceremony). */
export function discardHand(state: GameState): void {
  moveAll(state.world, state.piles.hand, state.piles.discard);
}

/** Move a single card from hand to discard. */
export function discardCard(state: GameState, cardId: EntityId): void {
  addToPile(state.world, state.piles.discard, cardId);
}
