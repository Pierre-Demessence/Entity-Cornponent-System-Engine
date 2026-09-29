/**
 * Klondike Solitaire game state, layout, and move rules.
 *
 * Every card is an entity (it also carries the card's sprite). The 13 piles —
 * stock, waste, 4 foundations, 7 tableau columns — are `modules/pile` piles
 * in the world, so pile order and membership live in one place. The card's
 * own data (suit, rank, face up or down) stays here, in `GameState.cards`.
 * Rendering and input live in `render.ts` / `main.ts`; this module is game
 * logic + board layout, so the rules are easy to reason about in isolation.
 */

import type { EcsWorld, EntityId } from '@pierre/ecs';
import type { Aabb } from '@pierre/ecs/modules/collision';

import type { Suit } from './cards';

import { createPile, moveTop, pileItems, pileSize, pileTop, shufflePile } from '@pierre/ecs/modules/pile';

import { RANKS, suitColor, SUITS } from './cards';

export interface Card {
  faceUp: boolean;
  rank: number;
  suit: Suit;
}

export type PileKind = 'foundation' | 'stock' | 'tableau' | 'waste';

/** A pile named by its role on the board — what the layout and the rules speak in. */
export interface PileRef {
  index: number;
  kind: PileKind;
}

export interface GameState {
  cards: Map<EntityId, Card>;
  /** Pile entities, one per suit slot. */
  foundations: EntityId[];
  stock: EntityId;
  /** Pile entities, one per column. */
  tableau: EntityId[];
  waste: EntityId;
  won: boolean;
  world: EcsWorld;
}

// --- Board layout (canvas world coordinates, 1:1 with device pixels) ---

export const CARD_W = 80;
export const CARD_H = 110;
export const CANVAS_W = 700;
export const CANVAS_H = 720;

const MARGIN_X = 22;
const TOP_Y = 20;
const TABLEAU_Y = TOP_Y + CARD_H + 24;
const COL_PITCH = 96;
const FAN_FACE_UP = 24;
const FAN_FACE_DOWN = 10;
/** How far below a tableau column's last card a drop still lands on it. */
const TABLEAU_DROP_SLACK = 40;

/** Column 0 stock, 1 waste, 3–6 foundations, all 7 used for tableau. */
const FOUNDATION_COL = [3, 4, 5, 6];

function columnX(col: number): number {
  return MARGIN_X + col * COL_PITCH;
}

/** Top-left of a pile's base slot (the empty placeholder position). */
export function slotPosition(pile: PileRef): { x: number; y: number } {
  switch (pile.kind) {
    case 'foundation':
      return { x: columnX(FOUNDATION_COL[pile.index]!), y: TOP_Y };
    case 'stock':
      return { x: columnX(0), y: TOP_Y };
    case 'tableau':
      return { x: columnX(pile.index), y: TABLEAU_Y };
    case 'waste':
      return { x: columnX(1), y: TOP_Y };
  }
}

/** A card-sized rect with its top-left at `pos`. */
export function cardRect(pos: { x: number; y: number }): Aabb {
  return { h: CARD_H, w: CARD_W, x: pos.x, y: pos.y };
}

/** The pile entity for a board position. */
export function pileEntity(state: GameState, pile: PileRef): EntityId {
  switch (pile.kind) {
    case 'foundation':
      return state.foundations[pile.index]!;
    case 'stock':
      return state.stock;
    case 'tableau':
      return state.tableau[pile.index]!;
    case 'waste':
      return state.waste;
  }
}

/** The cards in a pile, bottom first. */
export function cardsIn(state: GameState, pile: PileRef): readonly EntityId[] {
  return pileItems(state.world, pileEntity(state, pile));
}

export function cardOf(state: GameState, id: EntityId): Card {
  return state.cards.get(id)!;
}

/** Top-left of the card at `indexInPile` within `pile`. */
export function cardPosition(
  state: GameState,
  pile: PileRef,
  indexInPile: number,
): { x: number; y: number } {
  const base = slotPosition(pile);
  if (pile.kind !== 'tableau')
    return base;

  const column = cardsIn(state, pile);
  let y = base.y;
  for (let i = 0; i < indexInPile; i++)
    y += cardOf(state, column[i]!).faceUp ? FAN_FACE_UP : FAN_FACE_DOWN;
  return { x: base.x, y };
}

/**
 * The area a dragged run can be dropped into: the slot for a foundation, the
 * whole fanned column plus some slack below it for a tableau column.
 */
export function dropRect(state: GameState, pile: PileRef): Aabb {
  const slot = slotPosition(pile);
  if (pile.kind !== 'tableau')
    return cardRect(slot);
  const size = cardsIn(state, pile).length;
  const bottom = size === 0
    ? slot.y + CARD_H
    : cardPosition(state, pile, size - 1).y + CARD_H;
  return { h: bottom + TABLEAU_DROP_SLACK - slot.y, w: CARD_W, x: slot.x, y: slot.y };
}

// --- Deck construction + deal ---

export function dealNewGame(world: EcsWorld): GameState {
  const cards = new Map<EntityId, Card>();
  for (const suit of SUITS) {
    for (const rank of RANKS)
      cards.set(world.createEntity(), { faceUp: false, rank, suit });
  }

  const stock = createPile(world, [...cards.keys()]);
  shufflePile(world, stock);
  const tableau = Array.from({ length: 7 }, () => createPile(world));
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const [id] = moveTop(world, stock, tableau[col]!);
      cards.get(id!)!.faceUp = row === col;
    }
  }

  return {
    cards,
    foundations: Array.from({ length: 4 }, () => createPile(world)),
    stock,
    tableau,
    waste: createPile(world),
    won: false,
    world,
  };
}

// --- Move rules ---

/** Whether `card` can go onto a foundation whose top card is `top`. */
export function canDropOnFoundation(card: Card, top: Card | undefined): boolean {
  if (top === undefined)
    return card.rank === 1;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

/** Whether a run starting with `movingFirst` can go onto a column whose top card is `top`. */
export function canDropOnTableau(movingFirst: Card, top: Card | undefined): boolean {
  if (top === undefined)
    return movingFirst.rank === 13;
  return suitColor(top.suit) !== suitColor(movingFirst.suit)
    && movingFirst.rank === top.rank - 1;
}

/** The top card of a pile, or `undefined` when it is empty. */
export function topCard(state: GameState, pile: PileRef): Card | undefined {
  const id = pileTop(state.world, pileEntity(state, pile));
  return id === undefined ? undefined : cardOf(state, id);
}

/** First legal foundation index for a single card, or -1 if none. */
export function findFoundationFor(state: GameState, card: Card): number {
  for (let i = 0; i < state.foundations.length; i++) {
    if (canDropOnFoundation(card, topCard(state, { index: i, kind: 'foundation' })))
      return i;
  }
  return -1;
}

export function isWon(state: GameState): boolean {
  return state.foundations.every(f => pileSize(state.world, f) === 13);
}
