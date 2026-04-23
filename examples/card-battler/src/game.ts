import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState, PointerState } from '@pierre/ecs/modules/input';

import type { CardDef } from './cards';

import { EcsWorld } from '@pierre/ecs';

import { buildStartingDeck } from './cards';
import {
  BlockDef,
  CardDefComp,
  EnemyIntentDef,
  EnemyTag,
  HealthDef,
  InDeckTag,
  InDiscardTag,
  InHandTag,
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

export interface DragState {
  cardId: EntityId;
  offsetX: number;
  offsetY: number;
}

export interface GameState {
  drag: DragState | null;
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
  playerId: EntityId;
  pointer: PointerState;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(CardDefComp);
  w.registerComponent(HealthDef);
  w.registerComponent(BlockDef);
  w.registerComponent(EnemyIntentDef);
  w.registerTag(InHandTag);
  w.registerTag(InDeckTag);
  w.registerTag(InDiscardTag);
  w.registerTag(PlayerTag);
  w.registerTag(EnemyTag);
  return w;
}

/**
 * Fisher–Yates shuffle, in place. Deterministic if `random` is
 * supplied (used by tests); defaults to `Math.random`.
 */
export function shuffleInPlace<T>(arr: T[], random: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Create all card entities for the deck and tag them InDeck. */
function spawnDeck(state: GameState, deck: CardDef[]): void {
  const cardStore = state.world.getStore(CardDefComp);
  const inDeck = state.world.getTag(InDeckTag);
  for (const def of deck) {
    const id = state.world.createEntity();
    cardStore.set(id, { def });
    inDeck.add(id);
  }
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
  state.drag = null;
  state.endTurnPending = false;
  state.elapsedMs = 0;

  state.playerId = spawnPlayer(state);
  state.enemyId = spawnEnemy(state);

  const deck = buildStartingDeck();
  shuffleInPlace(deck);
  spawnDeck(state, deck);

  drawCards(state, HAND_SIZE);
}

/**
 * Move `count` cards from deck to hand, reshuffling discard into deck
 * if deck runs empty mid-draw. If both are empty the draw stops early.
 */
export function drawCards(state: GameState, count: number): void {
  const inDeck = state.world.getTag(InDeckTag);
  const inDiscard = state.world.getTag(InDiscardTag);
  const inHand = state.world.getTag(InHandTag);
  for (let i = 0; i < count; i++) {
    if (inDeck.size === 0) {
      if (inDiscard.size === 0) {
        console.warn('[card-battler] draw aborted: deck and discard are both empty');
        return;
      }
      reshuffleDiscardIntoDeck(state);
    }
    const cardId = pickRandomFromTag(inDeck);
    if (cardId == null)
      return;
    inDeck.delete(cardId);
    inHand.add(cardId);
  }
}

function pickRandomFromTag(tagSet: Iterable<EntityId> & { size: number }): EntityId | null {
  if (tagSet.size === 0)
    return null;
  const idx = Math.floor(Math.random() * tagSet.size);
  let i = 0;
  for (const id of tagSet) {
    if (i === idx)
      return id;
    i++;
  }
  return null;
}

function reshuffleDiscardIntoDeck(state: GameState): void {
  const inDeck = state.world.getTag(InDeckTag);
  const inDiscard = state.world.getTag(InDiscardTag);
  const cardsToShuffle: EntityId[] = [...inDiscard];
  shuffleInPlace(cardsToShuffle);
  for (const id of cardsToShuffle) {
    inDiscard.delete(id);
    inDeck.add(id);
  }
}

/** Discard entire hand (end-of-turn ceremony). */
export function discardHand(state: GameState): void {
  const inHand = state.world.getTag(InHandTag);
  const inDiscard = state.world.getTag(InDiscardTag);
  const handIds: EntityId[] = [...inHand];
  for (const id of handIds) {
    inHand.delete(id);
    inDiscard.add(id);
  }
}

/** Move a single card from hand to discard. */
export function discardCard(state: GameState, cardId: EntityId): void {
  state.world.getTag(InHandTag).delete(cardId);
  state.world.getTag(InDiscardTag).add(cardId);
}
