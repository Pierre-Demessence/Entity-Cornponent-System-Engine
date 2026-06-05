/**
 * Klondike Solitaire game state, layout, and move rules.
 *
 * The state is plain data: piles are arrays of `Card`, and each `Card`
 * carries the `EntityId` of its sprite. Rendering and input live in
 * `render.ts` / `main.ts`; this module is pure game logic + board layout
 * so the rules are easy to reason about in isolation.
 */

import type { EntityId } from '@pierre/ecs';

import type { Suit } from './cards';

import { shuffle } from '@pierre/ecs/modules/rng';

import { RANKS, suitColor, SUITS } from './cards';

export interface Card {
  id: EntityId;
  faceUp: boolean;
  rank: number;
  suit: Suit;
}

export type PileKind = 'foundation' | 'stock' | 'tableau' | 'waste';

export interface PileRef {
  index: number;
  kind: PileKind;
}

export interface GameState {
  foundations: Card[][];
  stock: Card[];
  tableau: Card[][];
  waste: Card[];
  won: boolean;
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

/** Top-left of the card at `indexInPile` within `pile`. */
export function cardPosition(
  state: GameState,
  pile: PileRef,
  indexInPile: number,
): { x: number; y: number } {
  const base = slotPosition(pile);
  if (pile.kind !== 'tableau')
    return base;

  const column = state.tableau[pile.index]!;
  let y = base.y;
  for (let i = 0; i < indexInPile; i++)
    y += column[i]!.faceUp ? FAN_FACE_UP : FAN_FACE_DOWN;
  return { x: base.x, y };
}

export function pileArray(state: GameState, pile: PileRef): Card[] {
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

// --- Deck construction + deal ---

function makeDeck(createEntity: () => EntityId): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS)
      deck.push({ id: createEntity(), faceUp: false, rank, suit });
  }
  return deck;
}

export function dealNewGame(createEntity: () => EntityId): GameState {
  const deck = makeDeck(createEntity);
  shuffle(deck);

  const tableau: Card[][] = [[], [], [], [], [], [], []];
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = deck.pop()!;
      card.faceUp = row === col;
      tableau[col]!.push(card);
    }
  }

  return {
    foundations: [[], [], [], []],
    stock: deck,
    tableau,
    waste: [],
    won: false,
  };
}

// --- Move rules ---

export function canDropOnFoundation(card: Card, foundation: Card[]): boolean {
  const top = foundation.at(-1);
  if (top === undefined)
    return card.rank === 1;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

export function canDropOnTableau(movingFirst: Card, column: Card[]): boolean {
  const top = column.at(-1);
  if (top === undefined)
    return movingFirst.rank === 13;
  return suitColor(top.suit) !== suitColor(movingFirst.suit)
    && movingFirst.rank === top.rank - 1;
}

/** First legal foundation index for a single card, or -1 if none. */
export function findFoundationFor(state: GameState, card: Card): number {
  for (let i = 0; i < state.foundations.length; i++) {
    if (canDropOnFoundation(card, state.foundations[i]!))
      return i;
  }
  return -1;
}

export function isWon(state: GameState): boolean {
  return state.foundations.every(f => f.length === 13);
}
