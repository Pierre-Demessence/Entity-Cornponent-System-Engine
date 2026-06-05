import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';
import type { TmxMap } from '@pierre/ecs/modules/tmx';

import { EcsWorld } from '@pierre/ecs';
import { AssetLoader, imageAsset, textAsset } from '@pierre/ecs/modules/asset-loader';
import { clamp } from '@pierre/ecs/modules/math';
import {
  Canvas2DRenderer,
  RenderableDef,
  RenderOrderDef,
} from '@pierre/ecs/modules/render-canvas2d';
import { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';
import { gidToFrame, parseTmx } from '@pierre/ecs/modules/tmx';
import { PositionDef } from '@pierre/ecs/modules/transform';

// `?url` makes Vite fingerprint and emit these assets, returning their final
// served URLs. The TMX text and the tileset image are then fetched at runtime
// through AssetLoader (text + image), exercising the asset-loader module.
import tmxUrl from '../../assets/kenney_roguelike-rpg-pack/Map/sample_map.tmx?url';
import sheetUrl from '../../assets/kenney_roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png?url';

const ATLAS_NAME = 'roguelike';
const VIEWPORT = 800;

// Camera starts zoomed in on this world point so individual tiles are legible;
// the whole 100×100 map is reachable by zooming out / dragging.
const FOCUS_X = 570;
const FOCUS_Y = 500;
const INITIAL_ZOOM = 1.3;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.1;

function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(RenderableDef);
  world.registerComponent(RenderOrderDef);
  return world;
}

function buildAtlas(map: TmxMap, image: HTMLImageElement): TextureAtlasRegistry {
  const frames: Record<string, { h: number; w: number; x: number; y: number }> = {};
  for (const layer of map.layers) {
    for (const gid of layer.gids) {
      if (gid === 0)
        continue;
      const key = String(gid);
      if (frames[key] === undefined)
        frames[key] = gidToFrame(gid, map.tileset);
    }
  }
  return new TextureAtlasRegistry().add(ATLAS_NAME, image, frames);
}

function spawnTiles(world: EcsWorld, map: TmxMap): number {
  const positions = world.getStore(PositionDef);
  const renderables = world.getStore(RenderableDef);
  const orders = world.getStore(RenderOrderDef);
  let count = 0;
  map.layers.forEach((layer, layerIndex) => {
    for (let i = 0; i < layer.gids.length; i++) {
      const gid = layer.gids[i]!;
      if (gid === 0)
        continue;
      const col = i % layer.width;
      const row = Math.floor(i / layer.width);
      const id = world.createEntity();
      positions.set(id, { x: col * map.tileWidth, y: row * map.tileHeight });
      renderables.set(id, {
        anchor: 'top-left',
        atlas: ATLAS_NAME,
        dh: map.tileHeight,
        dw: map.tileWidth,
        frame: String(gid),
        kind: 'sprite',
      });
      orders.set(id, { value: layerIndex });
      count++;
    }
  });
  return count;
}

function renderMap(ctx2d: CanvasRenderingContext2D, world: EcsWorld, atlases: TextureAtlasRegistry): void {
  ctx2d.imageSmoothingEnabled = false;
  ctx2d.fillStyle = '#10121a';
  ctx2d.fillRect(0, 0, ctx2d.canvas.width, ctx2d.canvas.height);
  const renderCtx: Canvas2DRenderContext = { atlases, ctx2d, world };
  new Canvas2DRenderer().render(renderCtx);
}

/**
 * Pans/zooms the pre-rendered canvas purely via a CSS transform. The map is
 * a single static raster, so interaction never triggers a re-render and stays
 * seam-free (scaling one bitmap, unlike per-tile `ctx.scale`).
 */
function attachPanZoom(viewport: HTMLElement, canvas: HTMLCanvasElement, signal: AbortSignal): void {
  const readout = document.createElement('div');
  readout.style.cssText = 'position:absolute;top:6px;left:6px;pointer-events:none;'
    + 'font:12px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);'
    + 'padding:3px 6px;border-radius:3px';
  viewport.append(readout);

  let zoom = INITIAL_ZOOM;
  let tx = VIEWPORT / 2 - FOCUS_X * zoom;
  let ty = VIEWPORT / 2 - FOCUS_Y * zoom;

  const apply = (): void => {
    canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
    const centerX = (VIEWPORT / 2 - tx) / zoom;
    const centerY = (VIEWPORT / 2 - ty) / zoom;
    readout.textContent = `zoom ${zoom.toFixed(2)}× · center (${Math.round(centerX)}, ${Math.round(centerY)})`;
  };
  apply();

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const worldX = (px - tx) / zoom;
    const worldY = (py - ty) / zoom;
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    tx = px - worldX * zoom;
    ty = py - worldY * zoom;
    apply();
  }, { passive: false, signal });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  viewport.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
    viewport.style.cursor = 'grabbing';
  }, { signal });
  viewport.addEventListener('pointermove', (event) => {
    if (!dragging)
      return;
    tx += event.clientX - lastX;
    ty += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    apply();
  }, { signal });
  const endDrag = (event: PointerEvent): void => {
    dragging = false;
    viewport.style.cursor = 'grab';
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', endDrag, { signal });
  viewport.addEventListener('pointercancel', endDrag, { signal });
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const viewport = document.createElement('div');
  viewport.style.cssText = `position:relative;width:${VIEWPORT}px;height:${VIEWPORT}px;`
    + 'margin:0 auto;overflow:hidden;background:#10121a;cursor:grab;touch-action:none';

  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.transformOrigin = '0 0';
  canvas.style.imageRendering = 'pixelated';
  viewport.append(canvas);

  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = 'Loading sample_map.tmx…';

  container.append(viewport, hint);

  const ctx2d = canvas.getContext('2d')!;
  const assetLoader = new AssetLoader();
  const abort = new AbortController();
  let disposed = false;

  void (async () => {
    try {
      const [tmxText, image] = await Promise.all([
        assetLoader.load(textAsset(tmxUrl), { signal: abort.signal }),
        assetLoader.load(imageAsset(sheetUrl), { signal: abort.signal }),
      ]);
      if (disposed)
        return;

      const map = await parseTmx(tmxText);
      if (disposed)
        return;

      const world = makeWorld();
      const atlases = buildAtlas(map, image);
      const tileCount = spawnTiles(world, map);

      // Render at the map's native pixel size so every 16px tile lands on an
      // integer boundary and tiles abut seamlessly; pan/zoom is then a CSS
      // transform over this single raster (no inter-tile seams, no re-render).
      canvas.width = map.width * map.tileWidth;
      canvas.height = map.height * map.tileHeight;
      renderMap(ctx2d, world, atlases);
      attachPanZoom(viewport, canvas, abort.signal);

      hint.textContent = `${map.width}×${map.height} map · ${map.layers.length} layers · `
        + `${tileCount.toLocaleString()} tile entities · scroll to zoom, drag to pan`;
    }
    catch (error) {
      if (disposed)
        return;
      const message = error instanceof Error ? error.message : String(error);
      hint.style.color = '#f76';
      hint.textContent = `Failed to load map: ${message}`;
      console.error('tilemap example:', error);
    }
  })();

  return () => {
    disposed = true;
    abort.abort();
    container.innerHTML = '';
  };
}
