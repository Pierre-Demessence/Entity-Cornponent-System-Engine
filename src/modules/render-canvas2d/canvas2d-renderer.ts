import type { ComponentStore } from '#component-store';
import type { EntityId } from '#entity-id';
import type { Renderer } from '#renderer';
import type { EcsWorld } from '#world';

import type { Renderable } from './renderable';

import { PositionDef, RotationDef, ScaleDef } from '../transform';
import { OpacityDef } from './opacity';
import { RenderOrderDef } from './render-order';
import { RenderableDef } from './renderable';

export interface Canvas2DRenderContext {
  ctx2d: CanvasRenderingContext2D;
  world: EcsWorld;
}

interface DrawEntry {
  id: EntityId;
  order: number;
  renderable: Renderable;
  seq: number;
  x: number;
  y: number;
}

/**
 * Draws every entity carrying `PositionDef + RenderableDef`. Optional
 * reads: `RotationDef`, `ScaleDef`, `OpacityDef`, `RenderOrderDef`.
 * When no entity carries `RenderOrderDef`, short-circuits to
 * component-store iteration order.
 */
export class Canvas2DRenderer implements Renderer<Canvas2DRenderContext> {
  render(ctx: Canvas2DRenderContext): void {
    const { ctx2d, world } = ctx;
    const posStore = world.getStore(PositionDef);
    const renderableStore = world.getStore(RenderableDef);
    const rotStore = tryGetStore<{ angle: number }>(world, RotationDef);
    const scaleStore = tryGetStore<{ x: number; y: number }>(world, ScaleDef);
    const opacityStore = tryGetStore<{ value: number }>(world, OpacityDef);
    const orderStore = tryGetStore<{ value: number }>(world, RenderOrderDef);

    ctx2d.save();
    try {
      const hasAnyOrder = orderStore !== null && orderStore.size > 0;
      if (!hasAnyOrder) {
        for (const [id, renderable] of renderableStore) {
          const pos = posStore.get(id);
          if (!pos)
            continue;
          drawEntity(ctx2d, id, pos.x, pos.y, renderable, rotStore, scaleStore, opacityStore);
        }
        return;
      }

      const entries: DrawEntry[] = [];
      let seq = 0;
      for (const [id, renderable] of renderableStore) {
        const pos = posStore.get(id);
        if (!pos) {
          seq++;
          continue;
        }
        entries.push({
          id,
          order: orderStore.get(id)?.value ?? 0,
          renderable,
          seq: seq++,
          x: pos.x,
          y: pos.y,
        });
      }
      entries.sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
      for (const e of entries)
        drawEntity(ctx2d, e.id, e.x, e.y, e.renderable, rotStore, scaleStore, opacityStore);
    }
    finally {
      ctx2d.restore();
    }
  }
}

function tryGetStore<T>(
  world: EcsWorld,
  def: { name: string },
): ComponentStore<T> | null {
  return (world.getStoreByName(def.name) as ComponentStore<T> | undefined) ?? null;
}

function drawEntity(
  ctx2d: CanvasRenderingContext2D,
  id: EntityId,
  x: number,
  y: number,
  r: Renderable,
  rotStore: ComponentStore<{ angle: number }> | null,
  scaleStore: ComponentStore<{ x: number; y: number }> | null,
  opacityStore: ComponentStore<{ value: number }> | null,
): void {
  if (r.fill === undefined && r.stroke === undefined)
    return;

  const rot = rotStore?.get(id)?.angle ?? 0;
  const scale = scaleStore?.get(id) ?? null;
  const opacity = opacityStore?.get(id)?.value ?? 1;

  const sh = shapeOffset(r);
  const needsTransform = rot !== 0 || scale !== null;
  const needsIsolation = needsTransform || opacity !== 1 || r.blendMode !== undefined;

  if (needsIsolation) {
    ctx2d.save();
    try {
      if (opacity !== 1)
        ctx2d.globalAlpha *= opacity;
      if (r.blendMode !== undefined)
        ctx2d.globalCompositeOperation = r.blendMode;

      if (needsTransform) {
        ctx2d.translate(x, y);
        if (rot !== 0)
          ctx2d.rotate(rot);
        if (scale !== null)
          ctx2d.scale(scale.x, scale.y);
        drawShape(ctx2d, sh.x, sh.y, r);
      }
      else {
        drawShape(ctx2d, x + sh.x, y + sh.y, r);
      }
    }
    finally {
      ctx2d.restore();
    }
    return;
  }

  drawShape(ctx2d, x + sh.x, y + sh.y, r);
}

function shapeOffset(r: Renderable): { x: number; y: number } {
  if (r.kind === 'rect') {
    const anchor = r.anchor ?? 'top-left';
    if (anchor === 'center')
      return { x: -r.w / 2, y: -r.h / 2 };
    return { x: 0, y: 0 };
  }
  if (r.kind === 'circle') {
    const anchor = r.anchor ?? 'center';
    if (anchor === 'top-left')
      return { x: r.radius, y: r.radius };
    return { x: 0, y: 0 };
  }
  return { x: 0, y: 0 };
}

function drawShape(
  ctx2d: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  r: Renderable,
): void {
  switch (r.kind) {
    case 'rect': {
      if (r.fill !== undefined) {
        ctx2d.fillStyle = r.fill;
        ctx2d.fillRect(originX, originY, r.w, r.h);
      }
      if (r.stroke !== undefined) {
        ctx2d.strokeStyle = r.stroke;
        ctx2d.lineWidth = r.lineWidth ?? 1;
        ctx2d.strokeRect(originX, originY, r.w, r.h);
      }
      return;
    }
    case 'circle': {
      ctx2d.beginPath();
      ctx2d.arc(originX, originY, r.radius, 0, Math.PI * 2);
      if (r.fill !== undefined) {
        ctx2d.fillStyle = r.fill;
        ctx2d.fill();
      }
      if (r.stroke !== undefined) {
        ctx2d.strokeStyle = r.stroke;
        ctx2d.lineWidth = r.lineWidth ?? 1;
        ctx2d.stroke();
      }
      return;
    }
    case 'polygon': {
      if (r.points.length === 0)
        return;
      ctx2d.beginPath();
      const p0 = r.points[0]!;
      ctx2d.moveTo(originX + p0.x, originY + p0.y);
      for (let i = 1; i < r.points.length; i++) {
        const p = r.points[i]!;
        ctx2d.lineTo(originX + p.x, originY + p.y);
      }
      if (r.closed)
        ctx2d.closePath();
      if (r.fill !== undefined) {
        ctx2d.fillStyle = r.fill;
        ctx2d.fill();
      }
      if (r.stroke !== undefined) {
        ctx2d.strokeStyle = r.stroke;
        ctx2d.lineWidth = r.lineWidth ?? 1;
        ctx2d.stroke();
      }
      return;
    }
    case 'text': {
      ctx2d.font = r.font;
      ctx2d.textAlign = r.align ?? 'left';
      ctx2d.textBaseline = r.baseline ?? 'alphabetic';
      if (r.fill !== undefined) {
        ctx2d.fillStyle = r.fill;
        ctx2d.fillText(r.text, originX, originY);
      }
      if (r.stroke !== undefined) {
        ctx2d.strokeStyle = r.stroke;
        ctx2d.lineWidth = r.lineWidth ?? 1;
        ctx2d.strokeText(r.text, originX, originY);
      }
    }
  }
}
