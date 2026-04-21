import type { Renderer } from '#renderer';
import type { EcsWorld } from '#world';

import type { Renderable } from './renderable';

import { PositionDef } from '../transform/position';
import { RenderableDef } from './renderable';

/**
 * Minimal 2D rendering context the renderer needs. Intentionally
 * structural — consumer game state blobs typically carry many other
 * fields; they pass here as long as they expose these two.
 */
export interface Canvas2DRenderContext {
  ctx2d: CanvasRenderingContext2D;
  world: EcsWorld;
}

/**
 * Draws every entity carrying `PositionDef + RenderableDef` onto the
 * provided `CanvasRenderingContext2D`. Entities are rendered in
 * component-store iteration order (insertion order); consumers that
 * need explicit z-layering should wrap the renderer with multiple
 * passes or maintain their own ordered list.
 *
 * The renderer does NOT clear the canvas, set up the viewport, or
 * handle overlay passes (HUD, game-over text). Consumers do all that
 * — this layer is purely "draw the ECS shapes".
 */
export class Canvas2DRenderer implements Renderer<Canvas2DRenderContext> {
  render(ctx: Canvas2DRenderContext): void {
    const { ctx2d, world } = ctx;
    const posStore = world.getStore(PositionDef);
    const renderableStore = world.getStore(RenderableDef);

    // Isolate our draw state from the consumer: anything we set on the
    // context (fillStyle, strokeStyle, lineWidth) is reverted on return.
    ctx2d.save();
    try {
      for (const [id, renderable] of renderableStore) {
        const pos = posStore.get(id);
        if (!pos)
          continue;
        drawRenderable(ctx2d, pos.x, pos.y, renderable);
      }
    }
    finally {
      ctx2d.restore();
    }
  }
}

function drawRenderable(
  ctx2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: Renderable,
): void {
  if (r.fill === undefined && r.stroke === undefined)
    return;
  if (r.kind === 'rect') {
    if (r.fill !== undefined) {
      ctx2d.fillStyle = r.fill;
      ctx2d.fillRect(x, y, r.w, r.h);
    }
    if (r.stroke !== undefined) {
      ctx2d.strokeStyle = r.stroke;
      ctx2d.lineWidth = r.lineWidth ?? 1;
      ctx2d.strokeRect(x, y, r.w, r.h);
    }
    return;
  }
  // circle
  ctx2d.beginPath();
  ctx2d.arc(x, y, r.radius, 0, Math.PI * 2);
  if (r.fill !== undefined) {
    ctx2d.fillStyle = r.fill;
    ctx2d.fill();
  }
  if (r.stroke !== undefined) {
    ctx2d.strokeStyle = r.stroke;
    ctx2d.lineWidth = r.lineWidth ?? 1;
    ctx2d.stroke();
  }
}
