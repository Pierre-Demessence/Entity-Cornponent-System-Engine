/**
 * Board rendering for the Solitaire example.
 *
 * Each card owns a sprite entity (`PositionDef` + `RenderableDef` +
 * `RenderOrderDef`). `syncLayout` rewrites those components from the game
 * state every frame — and, when a stack is being dragged, lifts those cards
 * to the pointer with a large `RenderOrderDef` bump in the same pass, so it
 * stays the single writer of layout. `renderFrame` paints the felt + empty
 * pile slots onto the canvas, then lets the engine's `Canvas2DRenderer` draw
 * the sprites on top, then overlays the win banner.
 */

import type { EcsWorld } from '@pierre/ecs';
import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';
import type { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';

import type { Card, GameState, PileRef } from './game';

import { Canvas2DRenderer, RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { PositionDef } from '@pierre/ecs/modules/transform';

import { CARD_BACK_FRAME, cardFrame } from './cards';
import {
  CANVAS_H,
  CANVAS_W,

  CARD_H,
  CARD_W,
  cardPosition,

  slotPosition,
} from './game';

export const CARDS_ATLAS = 'cards';
export const BACKS_ATLAS = 'backs';

/** Render-order bump applied to the dragged stack so it floats on top. */
export const DRAG_ORDER_BUMP = 100_000;

/** Vertical fan offset between cards in a dragged run. */
const DRAG_FAN = 24;

/**
 * The cards currently held by the pointer, plus the grab/pointer geometry
 * needed to position them. `syncLayout` lifts these above every pile.
 */
export interface DragOverride {
  cards: Card[];
  grabX: number;
  grabY: number;
  pointerX: number;
  pointerY: number;
}

const renderer = new Canvas2DRenderer();

/** Rewrite every card's sprite components from the current game state. */
export function syncLayout(world: EcsWorld, state: GameState, drag?: DragOverride | null): void {
  const positions = world.getStore(PositionDef);
  const renderables = world.getStore(RenderableDef);
  const orders = world.getStore(RenderOrderDef);
  let order = 0;

  const place = (card: Card, pile: PileRef, index: number): void => {
    const pos = cardPosition(state, pile, index);
    positions.set(card.id, pos);
    renderables.set(card.id, {
      anchor: 'top-left',
      atlas: card.faceUp ? CARDS_ATLAS : BACKS_ATLAS,
      dh: CARD_H,
      dw: CARD_W,
      frame: card.faceUp ? cardFrame(card.suit, card.rank) : CARD_BACK_FRAME,
      kind: 'sprite',
    });
    orders.set(card.id, { value: order++ });
  };

  state.stock.forEach((card, i) => place(card, { index: 0, kind: 'stock' }, i));
  state.waste.forEach((card, i) => place(card, { index: 0, kind: 'waste' }, i));
  state.foundations.forEach((pile, f) =>
    pile.forEach((card, i) => place(card, { index: f, kind: 'foundation' }, i)));
  state.tableau.forEach((pile, t) =>
    pile.forEach((card, i) => place(card, { index: t, kind: 'tableau' }, i)));

  if (drag) {
    drag.cards.forEach((card, i) => {
      positions.set(card.id, {
        x: drag.pointerX - drag.grabX,
        y: drag.pointerY - drag.grabY + i * DRAG_FAN,
      });
      orders.set(card.id, { value: DRAG_ORDER_BUMP + i });
    });
  }
}

export function renderFrame(
  ctx2d: CanvasRenderingContext2D,
  world: EcsWorld,
  atlases: TextureAtlasRegistry,
  state: GameState,
): void {
  ctx2d.fillStyle = '#0b3d2e';
  ctx2d.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawSlot(ctx2d, slotPosition({ index: 0, kind: 'stock' }), state.stock.length === 0 ? '↻' : '');
  drawSlot(ctx2d, slotPosition({ index: 0, kind: 'waste' }), '');
  for (let f = 0; f < 4; f++)
    drawSlot(ctx2d, slotPosition({ index: f, kind: 'foundation' }), 'A');
  for (let t = 0; t < 7; t++) {
    if (state.tableau[t]!.length === 0)
      drawSlot(ctx2d, slotPosition({ index: t, kind: 'tableau' }), '');
  }

  const renderCtx: Canvas2DRenderContext = { atlases, ctx2d, world };
  renderer.render(renderCtx);

  if (state.won)
    drawBanner(ctx2d);
}

function drawSlot(
  ctx2d: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  label: string,
): void {
  roundRect(ctx2d, pos.x, pos.y, CARD_W, CARD_H, 8);
  ctx2d.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx2d.lineWidth = 2;
  ctx2d.stroke();
  if (label !== '') {
    ctx2d.fillStyle = 'rgba(255,255,255,0.3)';
    ctx2d.font = '28px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(label, pos.x + CARD_W / 2, pos.y + CARD_H / 2);
  }
}

function drawBanner(ctx2d: CanvasRenderingContext2D): void {
  ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
  ctx2d.fillRect(0, CANVAS_H / 2 - 60, CANVAS_W, 120);
  ctx2d.fillStyle = '#ffe14d';
  ctx2d.font = '700 56px system-ui';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText('You win!', CANVAS_W / 2, CANVAS_H / 2);
}

function roundRect(
  ctx2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx2d.beginPath();
  ctx2d.moveTo(x + r, y);
  ctx2d.arcTo(x + w, y, x + w, y + h, r);
  ctx2d.arcTo(x + w, y + h, x, y + h, r);
  ctx2d.arcTo(x, y + h, x, y, r);
  ctx2d.arcTo(x, y, x + w, y, r);
  ctx2d.closePath();
}
