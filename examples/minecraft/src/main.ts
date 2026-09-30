import type { GameState, MinecraftAction, MinecraftEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { addLookDelta, makeCameraRigSystem } from '@pierre/ecs/modules/camera-3d';
import { makeCooldownSystem } from '@pierre/ecs/modules/cooldown';
import { createInput, Key, KeyboardProvider, MouseLookProvider, Pointer, PointerProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { BLOCK_COLOR, BLOCK_NAME, HOTBAR } from './blocks';
import { CameraTag, PlayerTag, Position3DDef } from './components';
import { projectPoint, updateView } from './frame';
import { CHUNKS, makeWorld, MOUSE_SENSITIVITY, playerLook, resetGame, RESPAWN_Y, spawnPoint, VIEW_H, VIEW_W } from './game';
import { makeRenderer } from './render';
import { inputSystem, interactSystem, movementSystem } from './systems';

const LOGIC_TICK_MS = 1000 / 60;

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  container.style.position = 'relative';

  const renderer = makeRenderer(VIEW_W, VIEW_H);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'crosshair';
  container.append(renderer.domElement);

  const overlay = (css: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;pointer-events:none;${css}`;
    container.append(el);
    return el;
  };

  overlay('left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;mix-blend-mode:difference;font:22px/1 monospace;').textContent = '+';
  const stats = overlay('left:8px;top:6px;font:12px monospace;color:#fff;text-shadow:0 1px 2px #000;');
  const hint = overlay('left:0;top:24px;width:100%;text-align:center;font:13px system-ui;color:#fff;text-shadow:0 1px 3px #000;');
  const beacon = overlay('display:none;transform:translate(-50%,-50%);font:12px monospace;color:#ffe27a;text-shadow:0 1px 2px #000;');
  beacon.textContent = '◆ home';

  const hotbar = overlay('left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:6px;');
  const slots = HOTBAR.map((block, i) => {
    const slot = document.createElement('div');
    slot.style.cssText
      = 'width:44px;height:44px;border:3px solid #333;box-sizing:border-box;display:grid;place-items:end start;'
        + `padding:2px 4px;font:700 12px system-ui;color:#fff;text-shadow:0 1px 2px #000;background:${hex(BLOCK_COLOR[block] ?? 0)};`;
    slot.textContent = String(i + 1);
    slot.title = BLOCK_NAME[block] ?? '';
    hotbar.append(slot);
    return slot;
  });

  const world = makeWorld();
  const events = new EventBus<MinecraftEvent>();

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.KeyW,
      Key.KeyA,
      Key.KeyS,
      Key.KeyD,
      Key.Space,
      Key.ShiftLeft,
      Key.Digit1,
      Key.Digit2,
      Key.Digit3,
      Key.Digit4,
      Key.Digit5,
    ],
  });
  const look = new MouseLookProvider({ sensitivity: MOUSE_SENSITIVITY, target: renderer.domElement });
  const pointer = new PointerProvider({ buttons: [0, 2], target: renderer.domElement });
  const input = createInput<MinecraftAction>(
    {
      back: [Key.KeyS],
      break: [Pointer.LeftButton],
      forward: [Key.KeyW],
      jump: [Key.Space],
      left: [Key.KeyA],
      place: [Pointer.RightButton],
      reset: [Key.KeyR],
      right: [Key.KeyD],
      slot1: [Key.Digit1],
      slot2: [Key.Digit2],
      slot3: [Key.Digit3],
      slot4: [Key.Digit4],
      slot5: [Key.Digit5],
      sprint: [Key.ShiftLeft],
    },
    [keyboard, pointer],
  );

  const state: GameState = {
    cameraId: null,
    dtMs: LOGIC_TICK_MS,
    events,
    input,
    look: look.state,
    playerId: null,
    selected: 0,
    target: null,
    world,
  };
  resetGame(state);
  const home = { ...spawnPoint(world) };
  home.y += 6;

  look.subscribe(({ x, y }) => {
    const rig = playerLook(state);
    if (rig)
      addLookDelta(rig, x, y);
  });
  // The lock request needs the click's own user gesture, so it stays a DOM handler.
  const onMouseDown = (): void => {
    if (!look.state.locked)
      look.requestLock();
  };
  renderer.domElement.addEventListener('mousedown', onMouseDown);

  const scheduler = new Scheduler<GameState>()
    .add(makeCooldownSystem<GameState>())
    .add(inputSystem)
    .add(movementSystem)
    .add(interactSystem);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    onTickComplete: () => input.clearEdges(),
    contextFactory: () => {
      if (state.input.justPressed('reset')) {
        resetGame(state);
        renderer.reset();
      }
      return state;
    },
    onBeforeFlush: () => {
      if (state.playerId == null)
        return;
      const p = world.getStore(Position3DDef).get(state.playerId);
      if (p && p.y < RESPAWN_Y)
        Object.assign(p, spawnPoint(world));
    },
  });
  tickRunner.start();

  let broken = 0;
  let placed = 0;
  const unsubBroken = events.on('BlockBroken', () => {
    broken += 1;
  });
  const unsubPlaced = events.on('BlockPlaced', () => {
    placed += 1;
  });

  const cameraRig = makeCameraRigSystem<GameState>({ cameraTag: CameraTag, targetTag: PlayerTag });
  const renderTickSource = new AnimationFrameTickSource();
  const unsubRender = renderTickSource.subscribe(() => {
    cameraRig.run(state);
    const visible = updateView(state);
    renderer.render(state);

    stats.textContent = `chunks ${visible}/${CHUNKS * CHUNKS} drawn · broken ${broken} · placed ${placed}`;
    hint.textContent = look.state.locked ? '' : 'Click to capture · WASD move · Shift sprint · Space jump · LMB break · RMB place · 1–5 block · R new world';
    slots.forEach((slot, i) => {
      slot.style.borderColor = i === state.selected ? '#fff' : '#333';
    });
    const screen = projectPoint(state, home);
    const onScreen = screen && screen.x >= 0 && screen.x <= VIEW_W && screen.y >= 0 && screen.y <= VIEW_H;
    beacon.style.display = onScreen ? 'block' : 'none';
    if (onScreen) {
      beacon.style.left = `${screen.x}px`;
      beacon.style.top = `${screen.y}px`;
    }
  });
  renderTickSource.start();

  return (): void => {
    input.dispose();
    look.dispose();
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    unsubBroken();
    unsubPlaced();
    unsubRender();
    renderTickSource.stop();
    tickRunner.stop();
    renderer.dispose();
    container.innerHTML = '';
  };
}
