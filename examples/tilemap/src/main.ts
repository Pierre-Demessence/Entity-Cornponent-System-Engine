import type { Camera } from '@pierre/ecs/modules/camera';
import type { TmxMap } from '@pierre/ecs/modules/tmx';

import { EcsWorld } from '@pierre/ecs';
import { AssetLoader, imageAsset, textAsset } from '@pierre/ecs/modules/asset-loader';
import { cameraToView, makeCamera, viewToWorld } from '@pierre/ecs/modules/camera';
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
        frames[key] = gidToFrame(gid, map.tilesets[0]);
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

/**
 * Renders every tile once into an offscreen canvas at the map's native pixel
 * size. Baking to a single bitmap is the canonical static-tilemap technique
 * (Unity combines tiles into a chunk mesh; we combine into one raster): a
 * lone bitmap has no inter-tile boundaries, so fractional-zoom seams \u2014 the
 * sub-pixel gaps a per-tile draw leaves between 16px tiles at e.g. 1.3\u00d7 \u2014
 * cannot appear. The camera then samples a sub-region of this raster each
 * frame instead of re-drawing thousands of tiles.
 */
function bakeMap(world: EcsWorld, atlases: TextureAtlasRegistry, map: TmxMap): HTMLCanvasElement {
  const baked = document.createElement('canvas');
  baked.width = map.width * map.tileWidth;
  baked.height = map.height * map.tileHeight;
  const bctx = baked.getContext('2d')!;
  bctx.imageSmoothingEnabled = false;
  new Canvas2DRenderer().render({ atlases, ctx2d: bctx, world });
  return baked;
}

/** Draws the visible sub-region of the baked map through the camera transform. */
function renderMap(ctx2d: CanvasRenderingContext2D, baked: HTMLCanvasElement, cam: Camera): void {
  ctx2d.imageSmoothingEnabled = false;
  ctx2d.fillStyle = '#10121a';
  ctx2d.fillRect(0, 0, ctx2d.canvas.width, ctx2d.canvas.height);
  const view = cameraToView(cam);
  // The baked raster is in native world pixels (1:1); place its top-left at
  // (−viewTopLeft)·zoom and scale the whole bitmap by zoom.
  ctx2d.drawImage(
    baked,
    -view.x * view.zoom,
    -view.y * view.zoom,
    baked.width * view.zoom,
    baked.height * view.zoom,
  );
}

/**
 * Drives the viewport-sized canvas through a `CameraDef`: the wheel sets
 * `cam.zoom` (zooming toward the cursor), dragging pans `cam.x`/`cam.y`, and
 * each interaction requests a re-render. The renderer's view-rect cull keeps
 * the per-frame draw cheap even with thousands of tile entities — only the
 * visible tiles are drawn.
 */
function attachPanZoom(
  viewport: HTMLElement,
  cam: Camera,
  requestRender: () => void,
  signal: AbortSignal,
): void {
  const readout = document.createElement('div');
  readout.style.cssText = 'position:absolute;top:6px;left:6px;pointer-events:none;'
    + 'font:12px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);'
    + 'padding:3px 6px;border-radius:3px';
  viewport.append(readout);

  const refresh = (): void => {
    readout.textContent = `zoom ${cam.zoom.toFixed(2)}× · center (${Math.round(cam.x)}, ${Math.round(cam.y)})`;
    requestRender();
  };
  refresh();

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    // World point under the cursor before zooming — keep it pinned after.
    const before = viewToWorld(px, py, cam);
    cam.zoom = clamp(cam.zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
    const after = viewToWorld(px, py, cam);
    cam.x += before.wx - after.wx;
    cam.y += before.wy - after.wy;
    refresh();
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
    // Screen delta → world delta (a drag-right moves the camera left).
    cam.x -= (event.clientX - lastX) / cam.zoom;
    cam.y -= (event.clientY - lastY) / cam.zoom;
    lastX = event.clientX;
    lastY = event.clientY;
    refresh();
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
      const baked = bakeMap(world, atlases, map);

      // The canvas is the viewport itself; the camera transform samples the
      // baked map each frame (seam-free at any zoom, no full-map re-raster).
      canvas.width = VIEWPORT;
      canvas.height = VIEWPORT;

      const cam = makeCamera({
        viewportH: VIEWPORT,
        viewportW: VIEWPORT,
        x: FOCUS_X,
        y: FOCUS_Y,
        zoom: INITIAL_ZOOM,
      });

      // Render on demand, coalesced into a single rAF per interaction burst.
      let pending = false;
      const requestRender = (): void => {
        if (pending || disposed)
          return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          if (!disposed)
            renderMap(ctx2d, baked, cam);
        });
      };

      attachPanZoom(viewport, cam, requestRender, abort.signal);

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
