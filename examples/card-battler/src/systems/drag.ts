import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { DragDrop } from '@pierre/ecs/modules/drag-drop';
import { pileOf } from '@pierre/ecs/modules/pile';
import { entityAtPoint } from '@pierre/ecs/modules/render-dom';

import { CardDefComp } from '../components';
import { discardCard } from '../game';

const DRAG_ACTION = 'drag';

/**
 * Drag system.
 *
 * Only handles *state transitions* (press / release). Between those two
 * ticks the manual tick source is idle: `main.ts` feeds pointer moves into
 * `ctx.drag` directly, and the rAF render loop draws the dragged card at
 * `ctx.drag.session.position`. This works because:
 *
 * - Press: DOM `pointerdown` → `tickSource.tick()` → this system sees
 *   `justPressed(DRAG_ACTION)` and begins a drag on the hand card under the
 *   pointer.
 * - Release: DOM `pointerup` → `tickSource.tick()` → this system sees
 *   `justReleased(DRAG_ACTION)` and ends the drag: dropped on the enemy →
 *   play the card; anywhere else → it stays in hand.
 *
 * The drag runs in client pixels, the space `entityAtPoint` hit-tests in.
 */
export const dragSystem: SchedulableSystem<GameState> = {
  name: 'drag',
  run(ctx) {
    if (ctx.phase !== 'player')
      return;

    if (ctx.drag.session === null && ctx.input.justPressed(DRAG_ACTION)) {
      tryStartDrag(ctx);
      return;
    }

    if (ctx.drag.session !== null && ctx.input.justReleased(DRAG_ACTION))
      resolveDrop(ctx);
  },
};

/** Whether `cardId` can be paid for this turn. */
function affordable(ctx: GameState, cardId: EntityId): boolean {
  const card = ctx.world.getStore(CardDefComp).get(cardId);
  return card !== undefined && card.def.cost <= ctx.energy;
}

/**
 * The card drag: one target (the enemy), hit-tested through the DOM. The
 * dragged card is in a `pointer-events: none` layer, so the browser sees
 * through it to the enemy underneath.
 */
export function makeCardDrag(getState: () => GameState): DragDrop<EntityId, EntityId> {
  return new DragDrop<EntityId, EntityId>({
    accepts: (_enemy, cardId) => affordable(getState(), cardId),
    contains: (enemy, point) => entityAtPoint(point.x, point.y) === enemy,
    targets: () => [getState().enemyId],
  });
}

function tryStartDrag(ctx: GameState): void {
  const pointer = { x: ctx.pointer.clientX, y: ctx.pointer.clientY };
  const cardId = entityAtPoint(pointer.x, pointer.y);
  if (cardId == null || pileOf(ctx.world, cardId) !== ctx.piles.hand)
    return;
  if (!affordable(ctx, cardId))
    return; // unaffordable — no drag
  // Keep the grab offset, so the card does not jump to put its corner under
  // the pointer.
  const rect = document.querySelector(`[data-entity-id="${cardId}"]`)?.getBoundingClientRect();
  ctx.drag.begin(cardId, pointer, rect ? { x: rect.left, y: rect.top } : pointer);
}

function resolveDrop(ctx: GameState): void {
  const drop = ctx.drag.end({ x: ctx.pointer.clientX, y: ctx.pointer.clientY });
  if (!drop?.target)
    return; // stays in hand; the renderer puts it back next frame
  const card = ctx.world.getStore(CardDefComp).get(drop.payload);
  if (!card)
    return;
  ctx.energy -= card.def.cost;
  card.def.effect(ctx);
  discardCard(ctx, drop.payload);
  ctx.events.emit({ cardId: drop.payload, type: 'CardPlayed' });
}
