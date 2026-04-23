import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { CardDefComp, InHandTag } from '../components';
import { discardCard } from '../game';

const DRAG_ACTION = 'drag';

// --- Client-coordinate handoff -----------------------------------------
//
// `elementFromPoint` needs viewport-local coords, which the
// `PointerProvider`'s default projector strips away (it returns
// target-local coords). `main.ts` feeds the raw `clientX` / `clientY`
// here from its own `pointerdown` / `pointerup` listeners so
// `hitTestEntityAt` can consult them.

let lastClient: { x: number; y: number } | null = null;

/**
 * Called by `main.ts` from the `pointerdown` / `pointerup` DOM
 * handlers, passing the raw `clientX` / `clientY`.
 */
export function setLastClient(x: number, y: number): void {
  lastClient = { x, y };
}

/**
 * Drag system.
 *
 * Only handles *state transitions* (press / release). Continuous
 * motion of the dragged card element is owned by the DOM renderer,
 * which reads `ctx.drag` and `ctx.pointer` each render frame. This
 * works because:
 *
 * - Press: DOM `pointerdown` → `tickSource.tick()` → this system sees
 *   `justPressed(DRAG_ACTION)` and opens a drag by hit-testing the DOM
 *   for `[data-entity-id]`.
 * - Release: DOM `pointerup` → `tickSource.tick()` → this system sees
 *   `justReleased(DRAG_ACTION)` and resolves the drop (over enemy?
 *   → play card; else snap back).
 *
 * Between those two ticks, the manual tick source is idle and only
 * the rAF render loop runs, which reads `ctx.pointer.x/y` to keep the
 * dragged card following the cursor.
 */
export const dragSystem: SchedulableSystem<GameState> = {
  name: 'drag',
  run(ctx) {
    if (ctx.phase !== 'player')
      return;

    if (ctx.drag === null && ctx.input.justPressed(DRAG_ACTION)) {
      tryStartDrag(ctx);
      return;
    }

    if (ctx.drag !== null && ctx.input.justReleased(DRAG_ACTION)) {
      resolveDrop(ctx);
    }
  },
};

function tryStartDrag(ctx: GameState): void {
  const entityId = hitTestEntityAt();
  if (entityId == null)
    return;
  if (!ctx.world.getTag(InHandTag).has(entityId))
    return;
  const card = ctx.world.getStore(CardDefComp).get(entityId);
  if (!card)
    return;
  if (card.def.cost > ctx.energy)
    return; // unaffordable — no drag
  ctx.drag = {
    cardId: entityId,
    // offsets left at 0: drag anchors card centre to cursor. Fine for
    // prototype; a production feel would record the click-within-card
    // offset so the card doesn't jump.
    offsetX: 0,
    offsetY: 0,
  };
}

function resolveDrop(ctx: GameState): void {
  if (ctx.drag == null)
    return;
  const drop = hitTestEntityAt();
  const draggedId = ctx.drag.cardId;
  const card = ctx.world.getStore(CardDefComp).get(draggedId);

  let played = false;
  if (card && drop != null && drop === ctx.enemyId) {
    if (card.def.cost <= ctx.energy) {
      ctx.energy -= card.def.cost;
      card.def.effect(ctx);
      discardCard(ctx, draggedId);
      ctx.events.emit({ cardId: draggedId, type: 'CardPlayed' });
      played = true;
    }
  }

  ctx.drag = null;
  if (!played) {
    // Card stays in hand — no state change needed, renderer will
    // reparent it back on next frame.
  }
}

/**
 * Resolve the entity under a pointer position via `elementFromPoint`
 * → nearest `[data-entity-id]` ancestor. Returns null if nothing
 * matches (empty space, over the drag layer, outside viewport).
 *
 * Coupling note: this depends on the renderer tagging every
 * interactive root with `data-entity-id="<id>"`. See
 * `docs/plans/example-rung5-card-battler.md` § "Contract the
 * renderer upholds for hit-testing".
 */
function hitTestEntityAt(): EntityId | null {
  // `elementFromPoint` takes viewport-local coordinates (clientX/Y),
  // which `PointerProvider` projects away. The `setLastClient` hook
  // below is called from `main.ts`'s raw `pointerdown` / `pointerup`
  // handlers, stashing the pre-projection coords so we can hit-test
  // against the live DOM tree.
  const last = lastClient;
  if (last == null)
    return null;
  const target = document.elementFromPoint(last.x, last.y);
  if (!target)
    return null;
  const holder = target.closest('[data-entity-id]');
  if (!holder)
    return null;
  const raw = holder.getAttribute('data-entity-id');
  if (raw == null)
    return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? (parsed as EntityId) : null;
}
