import type { EcsWorld, EntityId } from '@pierre/ecs';
import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';
import type { SaveStorage } from '@pierre/ecs/modules/save';

import type { Level } from './level';
import type { Game } from './rules';
import type { SaveData } from './save';

import { AssetLoader, imageAsset } from '@pierre/ecs/modules/asset-loader';
import {
  CameraDef,
  cameraToView,
  cameraViewRect,
  clampCameraToLimits,
  makeCamera,
  makeFollowCameraSystem,
} from '@pierre/ecs/modules/camera';
import { createEventInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { Canvas2DRenderer, OpacityDef, RenderableDef, RenderOrderDef, ScreenSpaceDef } from '@pierre/ecs/modules/render-canvas2d';
import { makeSeededRng, randomInt } from '@pierre/ecs/modules/rng';
import { SceneTransitionQueue, transferEntities } from '@pierre/ecs/modules/scene-transition';
import { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';
import { PositionDef } from '@pierre/ecs/modules/transform';
import { TurnCycler } from '@pierre/ecs/modules/turn-based';

import sheetUrl from '../../assets/kenney_tiny-dungeon/Tilemap/tilemap_packed.png?url';
import { takeMonsterTurn } from './ai';
import {
  ActiveTurnTag,
  ActorTag,
  ATLAS,
  CameraTag,
  cellCenter,
  FighterDef,
  GridPosDef,
  HudTag,
  InventoryDef,
  LabelDef,
  makeWorld,
  MONSTERS,
  MonsterTag,
  PlayerTag,
  POTION,
  sprite,
  STAIRS,
  TILE,
} from './defs';
import { bakeLevel, generateLevel, isFloor, MAP_H, MAP_W, roomCenter, updateFov } from './level';
import { afterPlayerStep, drinkPotion, stepOrAttack, tickMotion } from './rules';
import { decodeMask, describeSave, encodeMask, openSaveStorage, readSave, SAVE_VERSION, writeSave } from './save';

const VIEW_W = 24 * TILE; // 384
const VIEW_H = 15 * TILE; // 240
const SCALE = 2;
const LOG_LINES = 3;
const PLAYER_COMPONENTS = ['position', 'fighter', 'inventory', 'label', 'renderable', 'renderOrder', 'opacity'];

type Action = 'down' | 'left' | 'load' | 'potion' | 'restart' | 'right' | 'save' | 'up' | 'wait';

interface Hud { log: EntityId[]; status: EntityId }

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.cssText = `width:${VIEW_W * SCALE}px;height:${VIEW_H * SCALE}px;display:block;`
    + 'margin:0 auto;image-rendering:pixelated;background:#000';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = 'Loading…';
  const status = document.createElement('div');
  status.style.cssText = 'text-align:center;font:12px system-ui;color:#6a6';
  container.append(canvas, hint, status);

  const ctx2d = canvas.getContext('2d')!;
  const abort = new AbortController();
  const renderer = new Canvas2DRenderer();
  const atlases = new TextureAtlasRegistry();
  const transitions = new SceneTransitionQueue();
  const pending: Action[] = [];
  const messages: string[] = [];
  const followCamera = makeFollowCameraSystem<{ dtMs: number; world: EcsWorld }>({
    cameraTag: CameraTag,
    positionDef: PositionDef,
    smoothing: 12,
    targetTag: PlayerTag,
  });

  let disposed = false;
  let raf = 0;
  let sheet: HTMLImageElement | null = null;
  let storage: SaveStorage | null = null;
  let game: Game | null = null;
  let cycler: TurnCycler | null = null;
  let baked: HTMLCanvasElement | null = null;
  let hud: Hud | null = null;
  let turn = 0;

  const log = (message: string): void => {
    messages.push(message);
    if (messages.length > LOG_LINES)
      messages.shift();
  };

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.ArrowDown, Key.ArrowLeft, Key.ArrowRight, Key.ArrowUp, Key.Space],
  });
  // Event mode, not polled state: one keypress is exactly one turn.
  const input = createEventInput<Action>({
    down: [Key.ArrowDown, Key.KeyS],
    left: [Key.ArrowLeft, Key.KeyA],
    load: [Key.KeyL],
    potion: [Key.KeyQ],
    restart: [Key.KeyR],
    right: [Key.ArrowRight, Key.KeyD],
    save: [Key.KeyK],
    up: [Key.ArrowUp, Key.KeyW],
    wait: [Key.Space, Key.Period],
  }, [keyboard]);
  input.subscribe((event) => {
    if (event.kind === 'down' && pending.length < 3)
      pending.push(event.action);
  });

  // ── World setup ────────────────────────────────────────────────────────────

  /** Adopt a populated world as the current game. */
  function adopt(world: EcsWorld, level: Level, playerId: EntityId): void {
    game = { level, log, motion: new Map(), over: false, playerId, world };
    cycler = new TurnCycler(world, { activeTurn: ActiveTurnTag, controlled: ActorTag });
    if (cycler.activeEntityId === undefined)
      world.getTag(ActiveTurnTag).add(playerId);
    baked = bakeLevel(level, sheet!);

    // Snap everything to its cell (animations aren't saved), and the camera to the player.
    const positions = world.getStore(PositionDef);
    for (const [id, cell] of world.getStore(GridPosDef))
      positions.set(id, { x: cellCenter(cell.x), y: cellCenter(cell.y) });
    const [cameraId] = world.getTag(CameraTag);
    const cam = world.getStore(CameraDef).get(cameraId!)!;
    const p = positions.get(playerId)!;
    cam.x = p.x;
    cam.y = p.y;
    clampCameraToLimits(cam);

    // HUD entities are rebuilt rather than restored.
    for (const id of [...world.getTag(HudTag)]) world.destroyEntity(id);
    hudBand(world, 0, 0, VIEW_W, 13);
    hudBand(world, 0, VIEW_H - 36, VIEW_W, 36);
    hud = {
      log: Array.from({ length: LOG_LINES }, (_, i) => hudText(world, 4, VIEW_H - 34 + i * 10, '#ddd')),
      status: hudText(world, 4, 3, '#fff'),
    };
    const cell = world.getStore(GridPosDef).get(playerId)!;
    updateFov(level, cell.x, cell.y);
  }

  function buildFloor(level: Level, carry: { playerId: EntityId; world: EcsWorld } | null): void {
    const world = makeWorld();
    const start = roomCenter(level.rooms[0]!);
    let playerId: EntityId;
    if (carry) {
      // Same EntityId on the new floor; tags are the game's to re-apply.
      transferEntities(world, carry.world, [carry.playerId], PLAYER_COMPONENTS);
      playerId = carry.playerId;
    }
    else {
      playerId = world.createEntity();
      world.getStore(PositionDef).set(playerId, { x: 0, y: 0 });
      world.getStore(FighterDef).set(playerId, { atk: 3, hp: 20, maxHp: 20 });
      world.getStore(InventoryDef).set(playerId, { potions: 1 });
      world.getStore(LabelDef).set(playerId, { name: 'you' });
      world.getStore(RenderableDef).set(playerId, sprite(97));
      world.getStore(RenderOrderDef).set(playerId, { value: 15 });
      world.getStore(OpacityDef).set(playerId, { value: 1 });
    }
    world.getStore(GridPosDef).set(playerId, start);
    // The player joins `actor` first, so each round of the cycler starts with them.
    world.getTag(PlayerTag).add(playerId);
    world.getTag(ActorTag).add(playerId);
    world.getTag(ActiveTurnTag).add(playerId);

    const rand = makeSeededRng(level.seed * 31 + level.depth);
    const at = (x: number, y: number): Record<string, unknown> => ({ gridPos: { x, y }, position: { x: 0, y: 0 } });
    const stairs = roomCenter(level.rooms.at(-1)!);
    world.spawn(STAIRS, at(stairs.x, stairs.y));

    const roster = [MONSTERS.rat, MONSTERS.rat, MONSTERS.goblin, MONSTERS.goblinArcher, MONSTERS.cultistArcher];
    for (const room of level.rooms.slice(1)) {
      const count = randomInt(2 + Math.min(level.depth, 3), rand);
      for (let i = 0; i < count; i++) {
        const x = room.x + randomInt(room.w, rand);
        const y = room.y + randomInt(room.h, rand);
        if (!isFloor(level, x, y) || occupied(world, x, y))
          continue;
        const elite = level.depth >= 2 && randomInt(8, rand) === 0;
        world.spawn(elite ? MONSTERS.goblinChief : roster[randomInt(roster.length, rand)]!, at(x, y));
      }
      if (randomInt(3, rand) === 0) {
        const x = room.x + randomInt(room.w, rand);
        const y = room.y + randomInt(room.h, rand);
        if (!occupied(world, x, y))
          world.spawn(POTION, at(x, y));
      }
    }

    const cameraId = world.createEntity();
    world.getTag(CameraTag).add(cameraId);
    world.getStore(CameraDef).set(cameraId, makeCamera({
      limitBottom: MAP_H * TILE,
      limitLeft: 0,
      limitRight: MAP_W * TILE,
      limitTop: 0,
      viewportH: VIEW_H,
      viewportW: VIEW_W,
      x: 0,
      y: 0,
    }));

    adopt(world, level, playerId);
    log(level.depth === 1 ? 'You enter the dungeon.' : `You descend to depth ${level.depth}.`);
  }

  function newRun(): void {
    turn = 0;
    messages.length = 0;
    buildFloor(generateLevel(randomInt(1_000_000), 1), null);
  }

  function applyLoad(data: SaveData): void {
    const world = makeWorld();
    world.loadJSON(data.world);
    const level = generateLevel(data.seed, data.depth);
    decodeMask(data.explored, level.explored);
    turn = data.turn ?? 0;
    const [playerId] = world.getTag(PlayerTag);
    adopt(world, level, playerId!);
    log(`Loaded depth ${data.depth}.`);
  }

  // ── Turns ──────────────────────────────────────────────────────────────────

  function playerAct(g: Game, action: Action): boolean {
    switch (action) {
      case 'up': return stepOrAttack(g, g.playerId, 0, -1);
      case 'down': return stepOrAttack(g, g.playerId, 0, 1);
      case 'left': return stepOrAttack(g, g.playerId, -1, 0);
      case 'right': return stepOrAttack(g, g.playerId, 1, 0);
      case 'potion': return drinkPotion(g);
      case 'wait': return true;
      default: return false;
    }
  }

  function handleMeta(action: Action): boolean {
    const g = game!;
    if (action === 'restart') {
      transitions.replace(newRun);
      return true;
    }
    if (action === 'save' && storage && !g.over) {
      const data: SaveData = {
        depth: g.level.depth,
        explored: encodeMask(g.level.explored),
        seed: g.level.seed,
        turn,
        version: SAVE_VERSION,
        world: g.world.toJSON(),
      };
      void writeSave(storage, data).then(() => {
        log('Game saved.');
        void refreshSaveStatus();
      });
      return true;
    }
    if (action === 'load' && storage) {
      void readSave(storage).then((data) => {
        if (data)
          transitions.replace(() => applyLoad(data));
        else
          log('No save to load.');
      });
      return true;
    }
    return false;
  }

  function runTurns(): void {
    const g = game!;
    const c = cycler!;
    // A pending transition swaps the world at the next frame boundary; nothing
    // on this floor acts in the meantime.
    for (let guard = 0; guard < 500 && !g.over && !transitions.hasPending(); guard++) {
      const active = c.activeEntityId;
      if (active !== g.playerId) {
        if (active !== undefined && g.world.getTag(MonsterTag).has(active))
          takeMonsterTurn(g, active);
        if (c.advance())
          turn++;
        continue;
      }
      const action = pending.shift();
      if (action === undefined)
        return;
      if (handleMeta(action) || !playerAct(g, action))
        continue;
      const cell = g.world.getStore(GridPosDef).get(g.playerId)!;
      updateFov(g.level, cell.x, cell.y);
      if (afterPlayerStep(g) === 'descend') {
        const next = generateLevel(g.level.seed, g.level.depth + 1);
        const carry = { playerId: g.playerId, world: g.world };
        transitions.replace(() => buildFloor(next, carry));
        return;
      }
      c.advance();
    }
    // Game over: only meta actions (restart, load) still apply.
    for (let action = pending.shift(); action !== undefined; action = pending.shift())
      handleMeta(action);
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  function updateOpacity(g: Game): void {
    const opacity = g.world.getStore(OpacityDef);
    for (const [id, cell] of g.world.getStore(GridPosDef)) {
      if (id === g.playerId)
        continue;
      const i = cell.y * MAP_W + cell.x;
      // Monsters exist only while seen; items and stairs are remembered.
      const remembered = !g.world.getTag(MonsterTag).has(id) && g.level.explored[i] === 1;
      opacity.set(id, { value: g.level.visible[i] ? 1 : remembered ? 0.5 : 0 });
    }
  }

  function updateHud(g: Game): void {
    const f = g.world.getStore(FighterDef).get(g.playerId)!;
    const inv = g.world.getStore(InventoryDef).get(g.playerId)!;
    setText(g.world, hud!.status, `HP ${Math.max(0, f.hp)}/${f.maxHp}   Potions ${inv.potions}   Depth ${g.level.depth}   Turn ${turn}`);
    hud!.log.forEach((id, i) => setText(g.world, id, messages[i] ?? ''));
  }

  function draw(g: Game): void {
    const [cameraId] = g.world.getTag(CameraTag);
    const cam = g.world.getStore(CameraDef).get(cameraId!)!;
    const view = cameraToView(cam);
    view.x = Math.round(view.x);
    view.y = Math.round(view.y);

    ctx2d.imageSmoothingEnabled = false;
    ctx2d.fillStyle = '#000';
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx2d.drawImage(baked!, view.x, view.y, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    // Fog of war over the map only; entities handle their own visibility.
    const rect = cameraViewRect(cam);
    const x0 = Math.max(0, Math.floor(rect.x / TILE));
    const y0 = Math.max(0, Math.floor(rect.y / TILE));
    const x1 = Math.min(MAP_W - 1, Math.floor((rect.x + rect.w) / TILE));
    const y1 = Math.min(MAP_H - 1, Math.floor((rect.y + rect.h) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * MAP_W + x;
        if (g.level.visible[i])
          continue;
        ctx2d.fillStyle = g.level.explored[i] ? 'rgba(0,0,0,0.6)' : '#000';
        ctx2d.fillRect(x * TILE - view.x, y * TILE - view.y, TILE, TILE);
      }
    }

    const renderCtx: Canvas2DRenderContext = { atlases, ctx2d, view, world: g.world };
    renderer.render(renderCtx);
  }

  let last = performance.now();
  function frame(now: number): void {
    if (disposed)
      return;
    const dtMs = Math.min(50, now - last);
    last = now;

    // Level changes and loads land here, between frames, never mid-turn.
    transitions.applyNext();
    const g = game!;
    runTurns();
    tickMotion(g, dtMs);
    followCamera.run({ dtMs, world: g.world });
    updateOpacity(g);
    updateHud(g);
    draw(g);
    raf = requestAnimationFrame(frame);
  }

  async function refreshSaveStatus(): Promise<void> {
    const header = storage ? await describeSave(storage) : null;
    if (!disposed) {
      status.textContent = header
        ? `Save slot: depth ${header.depth}, ${new Date(header.savedAt).toLocaleTimeString()}`
        : 'Save slot: empty';
    }
  }

  void (async () => {
    try {
      sheet = await new AssetLoader().load(imageAsset(sheetUrl), { signal: abort.signal });
      if (disposed)
        return;
      const frames: Record<string, { h: number; w: number; x: number; y: number }> = {};
      for (let i = 0; i < 132; i++)
        frames[String(i)] = { h: TILE, w: TILE, x: (i % 12) * TILE, y: Math.floor(i / 12) * TILE };
      atlases.add(ATLAS, sheet, frames);

      newRun();
      hint.textContent = 'Arrows/WASD move & attack · Space wait · Q drink potion · K save · L load · R new run';
      raf = requestAnimationFrame(frame);

      storage = await openSaveStorage().catch(() => null);
      void refreshSaveStatus();
    }
    catch (error) {
      if (disposed)
        return;
      hint.style.color = '#f76';
      hint.textContent = `Failed to load: ${error instanceof Error ? error.message : String(error)}`;
    }
  })();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    input.dispose();
    abort.abort();
    container.innerHTML = '';
  };
}

function occupied(world: EcsWorld, x: number, y: number): boolean {
  for (const [, c] of world.getStore(GridPosDef)) {
    if (c.x === x && c.y === y)
      return true;
  }
  return false;
}

function hudText(world: EcsWorld, x: number, y: number, fill: string): EntityId {
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getStore(RenderableDef).set(id, { baseline: 'top', fill, font: '8px monospace', kind: 'text', text: '' });
  world.getStore(RenderOrderDef).set(id, { value: 100 });
  world.getStore(ScreenSpaceDef).set(id, { value: true });
  world.getTag(HudTag).add(id);
  return id;
}

function hudBand(world: EcsWorld, x: number, y: number, w: number, h: number): void {
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getStore(RenderableDef).set(id, { fill: 'rgba(0,0,0,0.6)', h, kind: 'rect', w });
  world.getStore(RenderOrderDef).set(id, { value: 90 });
  world.getStore(ScreenSpaceDef).set(id, { value: true });
  world.getTag(HudTag).add(id);
}

function setText(world: EcsWorld, id: EntityId, text: string): void {
  const r = world.getStore(RenderableDef).get(id);
  if (r?.kind === 'text' && r.text !== text)
    world.getStore(RenderableDef).set(id, { ...r, text });
}
