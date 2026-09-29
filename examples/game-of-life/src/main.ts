/**
 * Conway's Game of Life with every live cell as an entity. A tick is one
 * generation: the rules queue births and deaths, and `TickRunner`'s flush
 * applies them all at once. The render loop owns input, the step cadence, the
 * camera and drawing.
 */
import type { EntityId } from '@pierre/ecs';
import type { Point } from '@pierre/ecs/modules/grid-based';
import type { Renderable } from '@pierre/ecs/modules/render-canvas2d';

import type { Pattern } from './patterns';
import type { LifeEvent, Sim, SimCtx } from './systems';

import { EventBus, TickRunner } from '@pierre/ecs';
import { cameraToView, cameraViewRect, clampCameraToLimits, makeCamera, viewToWorld } from '@pierre/ecs/modules/camera';
import { bresenhamLine } from '@pierre/ecs/modules/grid-based';
import { createInput, Key, KeyboardProvider, Pointer, PointerProvider, projectPointer } from '@pierre/ecs/modules/input';
import { clamp } from '@pierre/ecs/modules/math';
import { Canvas2DRenderer, RenderableDef, RenderOrderDef, ScreenSpaceDef } from '@pierre/ecs/modules/render-canvas2d';
import { makeSeededRng, randomInt } from '@pierre/ecs/modules/rng';
import { LocalStorageBackend } from '@pierre/ecs/modules/save';
import { AnimationFrameTickSource, ManualTickSource } from '@pierre/ecs/modules/tick';
import { finished, justFinished, makeTimer, restart, tickTimer } from '@pierre/ecs/modules/timer';
import { PositionDef } from '@pierre/ecs/modules/transform';

import { AGE_PALETTE, AgeDef, BOARD_H, BOARD_W, CELL, CellTag, HudTag, LifeWorld } from './defs';
import { PRESETS } from './patterns';
import { RULES } from './rules';
import { makeScheduler } from './systems';

const VIEW_W = 800;
const VIEW_H = 500;
/** The whole board fills the view at the minimum zoom. */
const MIN_ZOOM = VIEW_W / BOARD_W;
const MAX_ZOOM = 48;
const PAN_PX_PER_S = 600;
const SPEEDS = [1, 2, 5, 10, 20, 30, 60];
const SOUP_DENSITY = 0.25;
const SAVE_KEY = 'pierre-ecs-game-of-life';
const SAVE_VERSION = 1;

const PRESET_ACTIONS = ['preset1', 'preset2', 'preset3', 'preset4', 'preset5', 'preset6'] as const;
type PresetAction = (typeof PRESET_ACTIONS)[number];
type Action
  = | 'clear' | 'down' | 'erase' | 'faster' | 'left' | 'load' | 'paint' | 'pause' | 'random' | 'right'
    | 'rule' | 'save' | 'slower' | 'step' | 'trails' | 'up' | 'zoomIn' | 'zoomOut' | PresetAction;

interface SaveData {
  generation: number;
  rule: string;
  version: number;
  world: Record<string, unknown>;
}

const HINT = 'LMB paint · RMB erase · Space pause · N step · +/− speed · T rule · G trails · '
  + 'R random · C clear · 1–6 presets · WASD/arrows pan · wheel or Q/E zoom · K save · L load';

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.cssText = 'display:block;margin:0 auto;background:#07080c;touch-action:none;cursor:crosshair';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = HINT;
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const abort = new AbortController();
  const renderer = new Canvas2DRenderer();
  const storage = new LocalStorageBackend();
  const world = new LifeWorld();
  const events = new EventBus<LifeEvent>();
  const sim: Sim = { generation: 0, history: [], rule: RULES[0]!, settled: false, trails: true };
  const camera = makeCamera({
    limitBottom: BOARD_H,
    limitLeft: 0,
    limitRight: BOARD_W,
    limitTop: 0,
    viewportH: VIEW_H,
    viewportW: VIEW_W,
    x: BOARD_W / 2,
    y: BOARD_H / 2,
    zoom: MIN_ZOOM,
  });

  let running = true;
  let speed = 3;
  let seed = 0;
  let births = 0;
  let deaths = 0;
  let message = '';
  let hud: { message: EntityId; status: EntityId } | null = null;
  let lastBrush: Point | null = null;
  const stepTimer = makeTimer(1000 / SPEEDS[speed]!, 'repeating');
  const messageTimer = makeTimer(0, 'once');

  const flash = (text: string): void => {
    message = text;
    restart(messageTimer, 2500);
  };

  // ── Simulation ─────────────────────────────────────────────────────────────

  // Births and deaths are observed, not reported: painting, erasing and the
  // rules all go through the same `cell` tag.
  world.lifecycle.on('TagAdded', (e) => {
    if (e.tag === CellTag.name)
      births++;
  });
  world.lifecycle.on('TagRemoved', (e) => {
    if (e.tag === CellTag.name)
      deaths++;
  });

  events.on('Extinct', (e) => {
    running = false;
    flash(`Extinct at generation ${e.generation}`);
  });
  events.on('Settled', (e) => {
    flash(e.period === 1 ? 'Settled: still life' : `Settled: period ${e.period}`);
  });

  const source = new ManualTickSource();
  const runner = new TickRunner<SimCtx>({
    scheduler: makeScheduler(),
    source,
    getEvents: ctx => ctx.events,
    getWorld: () => world,
    contextFactory: () => {
      births = 0;
      deaths = 0;
      return { dtMs: 1, events, sim, world };
    },
  });
  runner.start();

  // ── Board edits ────────────────────────────────────────────────────────────

  /** Forget the cycle detector's history: the board no longer follows from it. */
  function edited(): void {
    sim.history.length = 0;
    sim.settled = false;
  }

  /** After a wholesale change, drop its lifecycle events from the per-generation counters. */
  function quiet(): void {
    world.lifecycle.flush();
    births = 0;
    deaths = 0;
  }

  function reset(): void {
    world.clearAll();
    buildHud();
    sim.generation = 0;
    edited();
    quiet();
  }

  function randomSoup(): void {
    reset();
    seed = randomInt(1_000_000);
    const rand = makeSeededRng(seed);
    const entries = [];
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        if (rand() < SOUP_DENSITY)
          entries.push({ overrides: { position: { x, y } }, template: CELL });
      }
    }
    world.spawnBatch(entries);
    quiet();
    flash(`Random soup, seed ${seed}`);
  }

  function stamp(pattern: Pattern): void {
    reset();
    const ox = Math.floor((BOARD_W - pattern.w) / 2);
    const oy = Math.floor((BOARD_H - pattern.h) / 2);
    world.spawnBatch(pattern.cells.map(c => ({ overrides: { position: { x: ox + c.x, y: oy + c.y } }, template: CELL })));
    quiet();
    camera.zoom = clamp(Math.min(VIEW_W / (pattern.w + 40), VIEW_H / (pattern.h + 30)), MIN_ZOOM, 16);
    camera.x = BOARD_W / 2;
    camera.y = BOARD_H / 2;
    clampCameraToLimits(camera);
    flash(pattern.name);
  }

  function brush(x: number, y: number, alive: boolean): void {
    if (x < 0 || y < 0 || x >= BOARD_W || y >= BOARD_H)
      return;
    if (alive && !world.hasCellAt(x, y)) {
      world.spawn(CELL, { position: { x, y } });
    }
    else if (!alive) {
      const id = world.cellAt(x, y);
      if (id !== undefined)
        world.destroyEntity(id);
    }
  }

  // ── Save / load ────────────────────────────────────────────────────────────

  async function save(): Promise<void> {
    const data: SaveData = { generation: sim.generation, rule: sim.rule.notation, version: SAVE_VERSION, world: world.toJSON() };
    await storage.save(SAVE_KEY, JSON.stringify(data), { population: world.getTag(CellTag).size });
    flash(`Saved generation ${sim.generation}`);
  }

  async function load(): Promise<void> {
    const raw = await storage.load(SAVE_KEY);
    if (raw === null) {
      flash('No save to load');
      return;
    }
    const data = JSON.parse(raw) as SaveData;
    world.loadJSON(data.world);
    // The HUD went into the save with everything else; rebuild it fresh.
    for (const id of [...world.getTag(HudTag)]) world.destroyEntity(id);
    buildHud();
    sim.rule = RULES.find(r => r.notation === data.rule) ?? RULES[0]!;
    sim.generation = data.generation;
    edited();
    quiet();
    flash(`Loaded generation ${data.generation}`);
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  const pointer = new PointerProvider({ buttons: [0, 2], target: canvas });
  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.ArrowDown, Key.ArrowLeft, Key.ArrowRight, Key.ArrowUp, Key.Space],
  });
  const input = createInput<Action>({
    clear: [Key.KeyC],
    down: [Key.ArrowDown, Key.KeyS],
    erase: [Pointer.RightButton],
    faster: [Key.Equal, Key.NumpadAdd],
    left: [Key.ArrowLeft, Key.KeyA],
    load: [Key.KeyL],
    paint: [Pointer.LeftButton],
    pause: [Key.Space],
    preset1: [Key.Digit1],
    preset2: [Key.Digit2],
    preset3: [Key.Digit3],
    preset4: [Key.Digit4],
    preset5: [Key.Digit5],
    preset6: [Key.Digit6],
    random: [Key.KeyR],
    right: [Key.ArrowRight, Key.KeyD],
    rule: [Key.KeyT],
    save: [Key.KeyK],
    slower: [Key.Minus, Key.NumpadSubtract],
    step: [Key.KeyN, Key.Period],
    trails: [Key.KeyG],
    up: [Key.ArrowUp, Key.KeyW],
    zoomIn: [Key.KeyE],
    zoomOut: [Key.KeyQ],
  }, [keyboard, pointer]);

  /** Zoom by `factor`, keeping the world point under view pixel `(vx, vy)` fixed. */
  function zoomAt(vx: number, vy: number, factor: number): void {
    const before = viewToWorld(vx, vy, camera);
    camera.zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = viewToWorld(vx, vy, camera);
    camera.x += before.wx - after.wx;
    camera.y += before.wy - after.wy;
    clampCameraToLimits(camera);
  }

  // The input module has no wheel delta, so the wheel is a plain listener.
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const p = projectPointer(event, canvas);
    zoomAt(p.x, p.y, Math.exp(-event.deltaY * 0.0015));
  }, { passive: false, signal: abort.signal });

  function handleInput(dtMs: number): void {
    if (input.justPressed('pause')) {
      running = !running;
      if (running)
        restart(stepTimer);
    }
    if (input.justPressed('step')) {
      running = false;
      source.tick();
    }
    if (input.justPressed('faster') || input.justPressed('slower')) {
      speed = clamp(speed + (input.justPressed('faster') ? 1 : -1), 0, SPEEDS.length - 1);
      restart(stepTimer, 1000 / SPEEDS[speed]!);
    }
    if (input.justPressed('rule')) {
      sim.rule = RULES[(RULES.indexOf(sim.rule) + 1) % RULES.length]!;
      edited();
      flash(`${sim.rule.name} (${sim.rule.notation})`);
    }
    if (input.justPressed('trails')) {
      sim.trails = !sim.trails;
      flash(sim.trails ? 'Trails on' : 'Trails off');
    }
    if (input.justPressed('random'))
      randomSoup();
    if (input.justPressed('clear')) {
      reset();
      flash('Cleared');
    }
    PRESET_ACTIONS.forEach((action, i) => {
      if (input.justPressed(action))
        stamp(PRESETS[i]!);
    });
    if (input.justPressed('save'))
      void save().catch(() => flash('Save failed'));
    if (input.justPressed('load'))
      void load().catch(() => flash('Load failed'));

    const px = PAN_PX_PER_S * dtMs / 1000 / camera.zoom;
    camera.x += ((input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0)) * px;
    camera.y += ((input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0)) * px;
    const zoomDir = (input.isDown('zoomIn') ? 1 : 0) - (input.isDown('zoomOut') ? 1 : 0);
    if (zoomDir !== 0)
      zoomAt(VIEW_W / 2, VIEW_H / 2, Math.exp(zoomDir * dtMs * 0.003));
    clampCameraToLimits(camera);

    // Paint along the segment since the last sample, so a fast drag leaves no gaps.
    const painting = input.isDown('paint');
    if (painting || input.isDown('erase')) {
      const { wx, wy } = viewToWorld(pointer.state.x, pointer.state.y, camera);
      const cell = { x: Math.floor(wx), y: Math.floor(wy) };
      const from = lastBrush ?? cell;
      for (const p of bresenhamLine(from.x, from.y, cell.x, cell.y))
        brush(p.x, p.y, painting);
      lastBrush = cell;
      edited();
    }
    else {
      lastBrush = null;
    }
    input.clearEdges();
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  function hudEntity(x: number, y: number, renderable: Renderable): EntityId {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x, y });
    world.getStore(RenderableDef).set(id, renderable);
    world.getStore(RenderOrderDef).set(id, { value: 100 });
    world.getStore(ScreenSpaceDef).set(id, { value: true });
    world.getTag(HudTag).add(id);
    return id;
  }

  function buildHud(): void {
    hudEntity(0, 0, { fill: 'rgba(0,0,0,0.6)', h: 22, kind: 'rect', w: VIEW_W });
    const text = { baseline: 'top', fill: '#ddd', font: '12px monospace', kind: 'text', text: '' } as const;
    hud = {
      message: hudEntity(VIEW_W - 8, 5, { ...text, align: 'right', fill: '#fc6' }),
      status: hudEntity(8, 5, text),
    };
  }

  function setText(id: EntityId, text: string): void {
    const store = world.getStore(RenderableDef);
    const r = store.get(id);
    if (r?.kind === 'text' && r.text !== text)
      store.set(id, { ...r, text });
  }

  function updateHud(dtMs: number): void {
    tickTimer(messageTimer, dtMs);
    const pop = world.getTag(CellTag).size;
    setText(hud!.status, `Gen ${sim.generation}  Pop ${pop} (+${births} −${deaths})  `
    + `${sim.rule.name} ${sim.rule.notation}  ${SPEEDS[speed]} gen/s`);
    setText(hud!.message, !finished(messageTimer) ? message : running ? '' : 'PAUSED');
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  // Only cells whose age moved since the last frame are recoloured; capped
  // cells stop changing and drop out.
  const aged = world.query(AgeDef).changed(world.getStore(AgeDef));
  function recolour(): void {
    const renderables = world.getStore(RenderableDef);
    for (const [id, age] of aged)
      renderables.set(id, AGE_PALETTE[age.gens]!);
  }

  function draw(): void {
    const view = cameraToView(camera);
    const z = view.zoom;
    ctx2d.fillStyle = '#07080c';
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx2d.fillStyle = '#10141d';
    ctx2d.fillRect(-view.x * z, -view.y * z, BOARD_W * z, BOARD_H * z);

    if (z >= 8) {
      const rect = cameraViewRect(camera);
      ctx2d.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      for (let x = Math.max(0, Math.ceil(rect.x)); x <= Math.min(BOARD_W, rect.x + rect.w); x++) {
        const sx = Math.round((x - view.x) * z) + 0.5;
        ctx2d.moveTo(sx, 0);
        ctx2d.lineTo(sx, VIEW_H);
      }
      for (let y = Math.max(0, Math.ceil(rect.y)); y <= Math.min(BOARD_H, rect.y + rect.h); y++) {
        const sy = Math.round((y - view.y) * z) + 0.5;
        ctx2d.moveTo(0, sy);
        ctx2d.lineTo(VIEW_W, sy);
      }
      ctx2d.stroke();
    }
    renderer.render({ ctx2d, view, world });
  }

  const frames = new AnimationFrameTickSource();
  const unsubscribeFrames = frames.subscribe((info) => {
    const dtMs = Math.min(info.deltaMs ?? 0, 250);
    handleInput(dtMs);
    if (running) {
      tickTimer(stepTimer, dtMs);
      if (justFinished(stepTimer))
        source.tick();
    }
    // Brush edits land between ticks; deliver them to the counters now.
    world.lifecycle.flush();
    recolour();
    updateHud(dtMs);
    draw();
  });

  randomSoup();
  frames.start();

  return () => {
    unsubscribeFrames();
    frames.stop();
    runner.stop();
    input.dispose();
    abort.abort();
    container.innerHTML = '';
  };
}
