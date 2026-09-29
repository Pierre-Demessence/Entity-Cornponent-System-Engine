import type { EntityId } from '#entity-id';

import { ENTITY_ID_ATTR } from './dom-renderer';

/**
 * The entity whose node {@link DomRenderer} rendered at client coordinates
 * `(x, y)`, or `null` when nothing there belongs to an entity.
 *
 * Asks the browser for the topmost element at the point
 * (`document.elementFromPoint`) and walks up to the nearest ancestor carrying
 * the renderer's `data-entity-id`, so a click on a card's title text still
 * resolves to the card. Elements with `pointer-events: none` are skipped by the
 * browser, which is how a dragged node avoids hiding the drop target beneath it.
 *
 * Pass `root` to ignore entities rendered outside that element — when two
 * renderers share a page, or when an overlay should not count.
 */
export function entityAtPoint(x: number, y: number, root?: Element): EntityId | null {
  const doc = root?.ownerDocument ?? document;
  const hit = doc.elementFromPoint(x, y);
  const holder = hit?.closest(`[${ENTITY_ID_ATTR}]`);
  if (!holder || (root && !root.contains(holder)))
    return null;
  const id = Number(holder.getAttribute(ENTITY_ID_ATTR));
  return Number.isInteger(id) && id >= 0 ? id : null;
}
