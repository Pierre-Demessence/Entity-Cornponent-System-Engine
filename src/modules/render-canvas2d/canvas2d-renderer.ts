import type { ComponentStore } from '#component-store';
import type { EntityId } from '#entity-id';
import type { Renderer } from '#renderer';
import type { EcsWorld } from '#world';
import type { Renderable } from './renderable';
import type { ScreenSpace } from './screen-space';

import { PositionDef, RotationDef, ScaleDef } from '../transform';
import { OpacityDef } from './opacity';
import { RenderOrderDef } from './render-order';
import { RenderableDef } from './renderable';
import { ScreenSpaceDef } from './screen-space';

/**
 * A frame resolved against a loaded image, ready to use as the source
 * rectangle of `CanvasRenderingContext2D.drawImage`.
 */
export interface ResolvedSpriteFrame {
  image: CanvasImageSource;
  sh: number;
  sw: number;
  sx: number;
  sy: number;
}

/**
 * Minimal contract the renderer needs to draw `sprite` renderables:
 * resolve an `atlas` + `frame` name to a drawable image and source rect.
 * `TextureAtlasRegistry` from `@pierre/ecs/modules/texture-atlas`
 * satisfies this structurally.
 */
export interface SpriteFrameSource {
  getFrame: (atlas: string, frame: string) => ResolvedSpriteFrame | undefined;
}

/**
 * Optional camera transform applied to the whole scene before drawing.
 * `(x, y)` is the world coordinate at the viewport's top-left corner and
 * `zoom` (default 1) magnifies: `screen = (world − {x, y}) · zoom`. Decoupled
 * from `modules/camera` — pass `cameraToView(cam)` to drive it from a `Camera`.
 */
export interface RenderView {
  x: number;
  y: number;
  zoom?: number;
}

export interface Canvas2DRenderContext {
  atlases?: SpriteFrameSource;
  ctx2d: CanvasRenderingContext2D;
  /** When set, the scene is drawn through this camera transform and entities outside the view rect are culled. */
  view?: RenderView;
  world: EcsWorld;
}

interface ViewRect { maxX: number; maxY: number; minX: number; minY: number }

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
 * reads: `RotationDef`, `ScaleDef`, `OpacityDef`, `RenderOrderDef`,
 * `ScreenSpaceDef`.
 *
 * Two-pass rendering:
 * 1. **World pass** — entities without `ScreenSpaceDef` are drawn
 *    through the optional camera `view` transform, with view-rect
 *    culling when a view is set.
 * 2. **Overlay pass** — entities with `ScreenSpaceDef` are drawn in
 *    screen-pixel coordinates, bypassing the camera and culling.
 *
 * When no entity carries `RenderOrderDef`, each pass short-circuits
 * to component-store iteration order.  The overlay pass is skipped
 * entirely when no entity carries `ScreenSpaceDef`.
 */
export class Canvas2DRenderer implements Renderer<Canvas2DRenderContext> {
  render(ctx: Canvas2DRenderContext): void {
    const { atlases, ctx2d, view, world } = ctx;
    const posStore = world.getStore(PositionDef);
    const renderableStore = world.getStore(RenderableDef);
    const rotStore = tryGetStore<{ angle: number }>(world, RotationDef);
    const scaleStore = tryGetStore<{ x: number; y: number }>(world, ScaleDef);
    const opacityStore = tryGetStore<{ value: number }>(world, OpacityDef);
    const orderStore = tryGetStore<{ value: number }>(world, RenderOrderDef);
    const screenStore = tryGetStore<ScreenSpace>(world, ScreenSpaceDef);

    // ── World pass (through camera) ──────────────────────────────
    ctx2d.save();
    const viewRect = view ? applyView(ctx2d, view) : null;
    drawPass(ctx2d, renderableStore, posStore, rotStore, scaleStore, opacityStore, orderStore, screenStore, viewRect, atlases ?? null, false);
    ctx2d.restore();

    // ── Overlay pass (screen space, no camera) ───────────────────
    if (screenStore !== null && screenStore.size > 0) {
      ctx2d.save();
      drawPass(ctx2d, renderableStore, posStore, rotStore, scaleStore, opacityStore, orderStore, screenStore, null, atlases ?? null, true);
      ctx2d.restore();
    }
  }
}

/**
 * Draw one pass of entities filtered by screen-space membership.
 * When `screenSpace` is `true` only entities WITH `ScreenSpaceDef`
 * are drawn; when `false` only entities WITHOUT it.  Pass a `null`
 * screen store when no entity carries the tag and this is the world
 * pass.  `viewRect` enables culling for the world pass; `null`
 * skips culling (overlay pass).
 */
function drawPass(
  ctx2d: CanvasRenderingContext2D,
  renderableStore: ComponentStore<Renderable>,
  posStore: ComponentStore<{ x: number; y: number }>,
  rotStore: ComponentStore<{ angle: number }> | null,
  scaleStore: ComponentStore<{ x: number; y: number }> | null,
  opacityStore: ComponentStore<{ value: number }> | null,
  orderStore: ComponentStore<{ value: number }> | null,
  screenStore: ComponentStore<ScreenSpace> | null,
  viewRect: ViewRect | null,
  atlases: SpriteFrameSource | null,
  screenSpace: boolean,
): void {
  const hasAnyOrder = orderStore !== null && orderStore.size > 0;
  if (!hasAnyOrder) {
    for (const [id, renderable] of renderableStore) {
      const pos = posStore.get(id);
      if (!pos)
        continue;
      if (screenStore !== null && (screenStore.has(id) !== screenSpace))
        continue;
      if (viewRect && isCulled(pos.x, pos.y, renderable, viewRect))
        continue;
      drawEntity(ctx2d, id, pos.x, pos.y, renderable, rotStore, scaleStore, opacityStore, atlases);
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
    if (screenStore !== null && (screenStore.has(id) !== screenSpace)) {
      seq++;
      continue;
    }
    if (viewRect && isCulled(pos.x, pos.y, renderable, viewRect)) {
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
    drawEntity(ctx2d, e.id, e.x, e.y, e.renderable, rotStore, scaleStore, opacityStore, atlases);
}

/** Apply the camera transform to `ctx2d` and return the visible world rect. */
function applyView(ctx2d: CanvasRenderingContext2D, view: RenderView): ViewRect {
  const zoom = view.zoom ?? 1;
  ctx2d.scale(zoom, zoom);
  ctx2d.translate(-view.x, -view.y);
  return {
    maxX: view.x + ctx2d.canvas.width / zoom,
    maxY: view.y + ctx2d.canvas.height / zoom,
    minX: view.x,
    minY: view.y,
  };
}

/**
 * Whether the renderable's world AABB lies fully outside `rect`. `text`,
 * `sprite`, and `polygon` have no cheap reliable bounds here, so they are
 * never culled (returns `false`).
 */
function isCulled(x: number, y: number, r: Renderable, rect: ViewRect): boolean {
  let minX: number;
  let minY: number;
  let maxX: number;
  let maxY: number;
  if (r.kind === 'rect') {
    if ((r.anchor ?? 'top-left') === 'center') {
      minX = x - r.w / 2;
      minY = y - r.h / 2;
    }
    else {
      minX = x;
      minY = y;
    }
    maxX = minX + r.w;
    maxY = minY + r.h;
  }
  else if (r.kind === 'circle') {
    const cx = (r.anchor ?? 'center') === 'top-left' ? x + r.radius : x;
    const cy = (r.anchor ?? 'center') === 'top-left' ? y + r.radius : y;
    minX = cx - r.radius;
    minY = cy - r.radius;
    maxX = cx + r.radius;
    maxY = cy + r.radius;
  }
  else {
    return false;
  }
  return maxX < rect.minX || minX > rect.maxX || maxY < rect.minY || minY > rect.maxY;
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
  atlases: SpriteFrameSource | null,
): void {
  if (r.kind !== 'sprite' && r.fill === undefined && r.stroke === undefined)
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
        drawShape(ctx2d, sh.x, sh.y, r, atlases);
      }
      else {
        drawShape(ctx2d, x + sh.x, y + sh.y, r, atlases);
      }
    }
    finally {
      ctx2d.restore();
    }
    return;
  }

  drawShape(ctx2d, x + sh.x, y + sh.y, r, atlases);
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
  atlases: SpriteFrameSource | null,
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
      return;
    }
    case 'sprite': {
      if (!atlases)
        return;
      const f = atlases.getFrame(r.atlas, r.frame);
      if (!f)
        return;
      const dw = r.dw ?? f.sw;
      const dh = r.dh ?? f.sh;
      const flipH = r.flipH === true;
      const flipV = r.flipV === true;
      if (flipH || flipV) {
        const anchor = r.anchor ?? 'center';
        // Flip around the anchor point. For centre anchor the half-extent
        // keeps the sprite centred; for top-left the full extent shifts the
        // draw origin so the flipped sprite occupies the same world rect.
        const ax = anchor === 'center' ? -dw / 2 : (flipH ? -dw : 0);
        const ay = anchor === 'center' ? -dh / 2 : (flipV ? -dh : 0);
        ctx2d.save();
        ctx2d.translate(originX, originY);
        ctx2d.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx2d.drawImage(f.image, f.sx, f.sy, f.sw, f.sh, ax, ay, dw, dh);
        ctx2d.restore();
      }
      else {
        const anchor = r.anchor ?? 'center';
        const ox = anchor === 'center' ? originX - dw / 2 : originX;
        const oy = anchor === 'center' ? originY - dh / 2 : originY;
        ctx2d.drawImage(f.image, f.sx, f.sy, f.sw, f.sh, ox, oy, dw, dh);
      }
    }
  }
}
