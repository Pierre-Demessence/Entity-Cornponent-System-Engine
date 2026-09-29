import type { GameState, PortalAction, PortalEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { addLookDelta, makeCameraRigSystem } from '@pierre/ecs/modules/camera-3d';
import { createInput, Key, KeyboardProvider, MouseLookProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { CameraTag, PlayerTag, Position3DDef } from './components';
import {
  makeWorld,
  MOUSE_SENSITIVITY,
  playerLook,
  resetGame,
  RESPAWN_Y,
  respawnCube,
  respawnPlayer,
  VIEW_H,
  VIEW_W,
} from './game';
import { makeRenderer } from './render';
import {
  carrySystem,
  inputSystem,
  kinematics3dSystem,
  plateDoorSystem,
  portalGunSystem,
  teleportSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const renderer = makeRenderer(VIEW_W, VIEW_H);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'crosshair';

  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:6px;font:13px system-ui;color:#9aa6b2;';
  hint.textContent = 'Click to capture · WASD move · Space jump · E grab/drop · LMB/RMB portal · R restart · Esc release';
  container.append(renderer.domElement, hint);

  // Fixed crosshair over the canvas centre (you aim the gun with it).
  container.style.position = 'relative';
  const crosshair = document.createElement('div');
  crosshair.textContent = '+';
  crosshair.style.cssText
    = `position:absolute;left:50%;top:${VIEW_H / 2}px;transform:translate(-50%,-50%);color:#fff;opacity:0.65;font:18px/1 monospace;pointer-events:none;`;
  container.append(crosshair);

  // Win overlay (shown when the player reaches the exit).
  const winOverlay = document.createElement('div');
  winOverlay.style.cssText
    = 'position:absolute;left:0;top:0;width:100%;height:'
      + `${VIEW_H}px;display:none;place-items:center;background:rgba(8,12,16,0.55);`
      + 'color:#eaf6ff;font:600 26px system-ui;text-align:center;pointer-events:none;';
  winOverlay.innerHTML
    = 'Level complete<br><span style="font-size:15px;font-weight:400;color:#9fb2c0">Press R to restart</span>';
  container.append(winOverlay);

  const world = makeWorld();
  const events = new EventBus<PortalEvent>();

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.KeyW, Key.KeyA, Key.KeyS, Key.KeyD, Key.Space, Key.KeyE, Key.KeyR],
  });
  const input = createInput<PortalAction>(
    {
      back: [Key.KeyS],
      forward: [Key.KeyW],
      grab: [Key.KeyE],
      jump: [Key.Space],
      left: [Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.KeyD],
    },
    [keyboard],
  );

  const state: GameState = {
    cameraId: null,
    cubeId: null,
    doorId: null,
    dtMs: LOGIC_TICK_MS,
    events,
    input,
    pendingFire: null,
    platePressed: false,
    playerId: null,
    portals: { blue: null, orange: null },
    won: false,
    world,
  };

  resetGame(state);

  // Pointer lock: LMB captures the cursor as well as firing, then the mouse
  // drives the camera rig's yaw + pitch. RMB must not capture — it fires an orange portal.
  const look = new MouseLookProvider({
    sensitivity: MOUSE_SENSITIVITY,
    target: renderer.domElement,
  });
  look.subscribe(({ x, y }) => {
    const rig = playerLook(state);
    if (rig)
      addLookDelta(rig, x, y);
  });
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      state.pendingFire = 'blue';
      look.requestLock();
    }
    else if (e.button === 2) {
      state.pendingFire = 'orange';
    }
  };
  const onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('contextmenu', onContextMenu);

  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(portalGunSystem)
    .add(kinematics3dSystem)
    .add(teleportSystem)
    .add(carrySystem)
    .add(plateDoorSystem);

  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);
  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: tickSource,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    onTickComplete: () => input.clearEdges(),
    contextFactory: () => {
      if (state.input.justPressed('reset'))
        resetGame(state);
      return state;
    },
    onBeforeFlush: () => {
      const posStore = world.getStore(Position3DDef);
      if (state.playerId != null) {
        const p = posStore.get(state.playerId);
        if (p && p.y < RESPAWN_Y)
          respawnPlayer(state);
      }
      if (state.cubeId != null) {
        const c = posStore.get(state.cubeId);
        if (c && c.y < RESPAWN_Y)
          respawnCube(state);
      }
    },
  });
  tickRunner.start();

  // Posed per frame, not per logic tick, so mouse look shows on the next frame.
  const cameraRig = makeCameraRigSystem<GameState>({ cameraTag: CameraTag, targetTag: PlayerTag });
  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    cameraRig.run(state);
    renderer.render(state);
    winOverlay.style.display = state.won ? 'grid' : 'none';
  });
  renderTickSource.start();

  return (): void => {
    input.dispose();
    look.dispose();
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    renderer.domElement.removeEventListener('contextmenu', onContextMenu);
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    renderer.dispose();
    container.innerHTML = '';
  };
}
