import type { EntityId, TagDef } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import { EcsWorld } from '@pierre/ecs';
import { AssetLoader, imageAsset, textAsset } from '@pierre/ecs/modules/asset-loader';
import { CameraDef, makeFollowCameraSystem } from '@pierre/ecs/modules/camera';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import {
  Canvas2DRenderer,
  RenderableDef,
  RenderOrderDef,
} from '@pierre/ecs/modules/render-canvas2d';
import { PositionDef, RotationDef, ScaleDef } from '@pierre/ecs/modules/transform';

import tmxUrl from '../../assets/kenney_tiny-dungeon/Tiled/sampleMap.tmx?url';
// `.tsx` is a code extension to Vite, so the tileset text is imported via
// `?raw` (inlined file contents); a `?url` import would be transpiled as JSX.
import tsxText from '../../assets/kenney_tiny-dungeon/Tiled/sampleSheet.tsx?raw';
import mapSheetUrl from '../../assets/kenney_tiny-dungeon/Tilemap/tilemap.png?url';
// `?url` makes Vite fingerprint + emit these assets and hand back their served
// URLs; the text/images are then fetched at runtime through AssetLoader.
import packedUrl from '../../assets/kenney_tiny-dungeon/Tilemap/tilemap_packed.png?url';
import panelUrl from '../../assets/kenney_ui-pack/PNG/Grey/Default/button_rectangle_depth_border.png?url';
import { addCharAtlas, CHAR_ATLAS, findNpcPlacements, NPC_DIALOGUES, PLAYER_SPRITE } from './characters';
import { DialogueBox } from './dialogue';
import { buildCollision, loadMap, spawnTiles } from './map';

const TILE = 16;
const VIEW_W = 24 * TILE; // 384
const VIEW_H = 15 * TILE; // 240
const SCALE = 2;
const PLAYER_SPEED = 70; // px/s
const PLAYER_HALF = 5; // collision half-extent
const TALK_RANGE = 22;
const RENDER_LAYER = 100; // the player draws above all map layers

// Ground-layer tiles the player may stand on (the stone-floor variants of
// sampleMap.tmx). Any other ground tile — walls, voids — blocks movement.
const FLOOR_GROUND = new Set<number>([37, 38, 39, 43, 49, 50, 51, 52, 53, 54]);

// Objects/Carts-layer tiles the player may walk over (chairs, rail tracks, the
// bridge, and other floor decor). Any other prop on those layers — furniture,
// pillars, and the baked-in NPC characters — keeps blocking movement.
const WALKABLE_PROPS = new Set<number>([
  31,
  37,
  38,
  39,
  40,
  43,
  44,
  45,
  61,
  62,
  63,
  67,
  68,
  69,
  70,
  71,
  72,
  74,
  80,
  81,
  82,
  84,
  94,
  95,
  96,
]);

const PlayerTag: TagDef = { name: 'player' };
const CameraTag: TagDef = { name: 'camera' };

type RpgAction = 'down' | 'interact' | 'left' | 'right' | 'up';

function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(RenderableDef);
  world.registerComponent(RenderOrderDef);
  world.registerComponent(ScaleDef);
  world.registerComponent(RotationDef);
  world.registerComponent(CameraDef);
  world.registerTag(PlayerTag);
  world.registerTag(CameraTag);
  return world;
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const viewport = document.createElement('div');
  viewport.style.cssText = `position:relative;width:${VIEW_W * SCALE}px;height:${VIEW_H * SCALE}px;`
    + 'margin:0 auto;overflow:hidden;background:#0b0d12;image-rendering:pixelated';

  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.cssText = `width:${VIEW_W * SCALE}px;height:${VIEW_H * SCALE}px;`
    + 'display:block;image-rendering:pixelated';
  viewport.append(canvas);

  const prompt = document.createElement('div');
  prompt.style.cssText = 'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);'
    + 'padding:4px 10px;border-radius:4px;background:rgba(0,0,0,.6);color:#fff;'
    + 'font:13px system-ui;pointer-events:none;display:none';
  prompt.textContent = 'Space to talk';
  viewport.append(prompt);

  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = 'Loading dungeon…';

  container.append(viewport, hint);

  const dialogue = new DialogueBox(viewport, panelUrl);
  const ctx2d = canvas.getContext('2d')!;
  const assetLoader = new AssetLoader();
  const abort = new AbortController();
  let disposed = false;
  let raf = 0;
  let input: InputState<RpgAction> | null = null;

  void (async () => {
    try {
      const [tmxText, mapImage, packedImage] = await Promise.all([
        assetLoader.load(textAsset(tmxUrl), { signal: abort.signal }),
        assetLoader.load(imageAsset(mapSheetUrl), { signal: abort.signal }),
        assetLoader.load(imageAsset(packedUrl), { signal: abort.signal }),
      ]);
      if (disposed)
        return;

      const { atlas, map } = await loadMap(tmxText, tsxText, 'sampleSheet.tsx', mapImage);
      if (disposed)
        return;
      addCharAtlas(atlas, packedImage);

      const world = makeWorld();
      const tileCount = spawnTiles(world, map);
      const collision = buildCollision(map, FLOOR_GROUND, WALKABLE_PROPS);

      const mapW = map.width * TILE;
      const mapH = map.height * TILE;

      const positions = world.getStore(PositionDef);
      const renderables = world.getStore(RenderableDef);
      const orders = world.getStore(RenderOrderDef);

      const spawnSprite = (sprite: number, cx: number, cy: number): EntityId => {
        const id = world.createEntity();
        positions.set(id, { x: cx, y: cy });
        renderables.set(id, {
          anchor: 'center',
          atlas: CHAR_ATLAS,
          dh: TILE,
          dw: TILE,
          frame: String(sprite),
          kind: 'sprite',
        });
        orders.set(id, { value: RENDER_LAYER });
        return id;
      };

      const isSolid = (px: number, py: number): boolean => {
        if (px < 0 || py < 0 || px >= mapW || py >= mapH)
          return true;
        const col = Math.floor(px / TILE);
        const row = Math.floor(py / TILE);
        return collision.solid[row * collision.width + col] === 1;
      };
      const canStand = (cx: number, cy: number): boolean =>
        !isSolid(cx - PLAYER_HALF, cy - PLAYER_HALF)
        && !isSolid(cx + PLAYER_HALF, cy - PLAYER_HALF)
        && !isSolid(cx - PLAYER_HALF, cy + PLAYER_HALF)
        && !isSolid(cx + PLAYER_HALF, cy + PLAYER_HALF);

      const spawn = findSpawn(collision, canStand);
      const playerId = spawnSprite(PLAYER_SPRITE, spawn.x, spawn.y);
      world.getTag(PlayerTag).add(playerId);

      // NPCs reuse characters already painted into the Objects layer: each is an
      // invisible interaction point centred on its baked tile.
      const npcs = findNpcPlacements(map, NPC_DIALOGUES).map(npc => ({
        name: npc.name,
        dialog: npc.dialog,
        x: npc.tileX * TILE + TILE / 2,
        y: npc.tileY * TILE + TILE / 2,
      }));

      const cameraId = world.createEntity();
      world.getStore(CameraDef).set(cameraId, { viewportH: VIEW_H, viewportW: VIEW_W, x: spawn.x, y: spawn.y });
      world.getTag(CameraTag).add(cameraId);
      const followCamera = makeFollowCameraSystem({ cameraTag: CameraTag, positionDef: PositionDef, targetTag: PlayerTag });

      const keyboard = new KeyboardProvider();
      const inputState = createInput<RpgAction>(
        {
          down: [Key.ArrowDown, Key.KeyS],
          interact: [Key.Space, Key.KeyE],
          left: [Key.ArrowLeft, Key.KeyA],
          right: [Key.ArrowRight, Key.KeyD],
          up: [Key.ArrowUp, Key.KeyW],
        },
        [keyboard],
      );
      input = inputState;

      const nearestNpc = (): typeof npcs[number] | undefined => {
        const pos = positions.get(playerId)!;
        let best: typeof npcs[number] | undefined;
        let bestDist = TALK_RANGE * TALK_RANGE;
        for (const npc of npcs) {
          const d = (npc.x - pos.x) ** 2 + (npc.y - pos.y) ** 2;
          if (d <= bestDist) {
            bestDist = d;
            best = npc;
          }
        }
        return best;
      };

      const renderer = new Canvas2DRenderer();
      const renderCtx: Canvas2DRenderContext = { atlases: atlas, ctx2d, world };

      hint.textContent = `${map.width}×${map.height} dungeon · ${map.layers.length} layers · `
        + `${tileCount.toLocaleString()} tiles · WASD/arrows to move · Space/E to talk`;

      let last = performance.now();
      const frame = (now: number): void => {
        if (disposed)
          return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (inputState.justPressed('interact')) {
          if (dialogue.open) {
            dialogue.advance();
          }
          else {
            const npc = nearestNpc();
            if (npc)
              dialogue.start(npc.name, npc.dialog);
          }
        }

        if (!dialogue.open) {
          let dx = (inputState.isDown('right') ? 1 : 0) - (inputState.isDown('left') ? 1 : 0);
          let dy = (inputState.isDown('down') ? 1 : 0) - (inputState.isDown('up') ? 1 : 0);
          if (dx !== 0 || dy !== 0) {
            const inv = 1 / Math.hypot(dx, dy);
            dx *= inv * PLAYER_SPEED * dt;
            dy *= inv * PLAYER_SPEED * dt;
            const pos = positions.get(playerId)!;
            if (canStand(pos.x + dx, pos.y))
              pos.x += dx;
            if (canStand(pos.x, pos.y + dy))
              pos.y += dy;
          }
        }

        followCamera.run({ world });
        const cam = world.getStore(CameraDef).get(cameraId)!;
        const offX = Math.round(clamp(cam.x - VIEW_W / 2, 0, Math.max(0, mapW - VIEW_W)));
        const offY = Math.round(clamp(cam.y - VIEW_H / 2, 0, Math.max(0, mapH - VIEW_H)));

        prompt.style.display = !dialogue.open && nearestNpc() ? 'block' : 'none';

        ctx2d.imageSmoothingEnabled = false;
        ctx2d.fillStyle = '#0b0d12';
        ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx2d.save();
        ctx2d.translate(-offX, -offY);
        renderer.render(renderCtx);
        ctx2d.restore();

        inputState.clearEdges();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    catch (error) {
      if (disposed)
        return;
      const message = error instanceof Error ? error.message : String(error);
      hint.style.color = '#f76';
      hint.textContent = `Failed to load: ${message}`;
      console.error('rpg example:', error);
    }
  })();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    input?.dispose();
    abort.abort();
    container.innerHTML = '';
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Spiral out from the map centre to the nearest standable tile. */
function findSpawn(
  collision: { height: number; solid: Uint8Array; width: number },
  canStand: (cx: number, cy: number) => boolean,
): { x: number; y: number } {
  const cx = Math.floor(collision.width / 2);
  const cy = Math.floor(collision.height / 2);
  for (let radius = 0; radius < Math.max(collision.width, collision.height); radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const col = cx + dx;
        const row = cy + dy;
        if (col < 0 || row < 0 || col >= collision.width || row >= collision.height)
          continue;
        const x = col * TILE + TILE / 2;
        const y = row * TILE + TILE / 2;
        if (canStand(x, y))
          return { x, y };
      }
    }
  }
  return { x: TILE / 2, y: TILE / 2 };
}
