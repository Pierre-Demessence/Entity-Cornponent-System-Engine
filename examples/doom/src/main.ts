import type { DoomAction, DoomEvent, GameState } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { HealthDef, Position3DDef } from './components';
import {
  HITSCAN_AMMO_START,
  makeWorld,
  MAX_PITCH,
  MOUSE_SENSITIVITY,
  resetGame,
  RESPAWN_Y,
  respawnPlayer,
  ROCKET_AMMO_START,
} from './game';
import { makeRenderer } from './render';
import { aiSystem, elevatorSystem, inputSystem, kinematics3dSystem, pickupSystem, projectileSystem, weaponSystem } from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const WIDTH = 800;
const HEIGHT = 640;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const renderer = makeRenderer(WIDTH, HEIGHT);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'crosshair';

  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:6px;font:13px system-ui;color:#9aa6b2;';
  hint.textContent = 'Click to capture · WASD move · Space jump · LMB fire · 1/2 weapon · R restart · Esc release';
  container.append(renderer.domElement, hint);

  // Fixed crosshair over the canvas centre.
  container.style.position = 'relative';
  const crosshair = document.createElement('div');
  crosshair.textContent = '+';
  crosshair.style.cssText
    = `position:absolute;left:50%;top:${HEIGHT / 2}px;transform:translate(-50%,-50%);color:#fff;opacity:0.6;font:20px/1 monospace;pointer-events:none;`;
  container.append(crosshair);

  // HUD: a health bar + the current weapon's ammo count, bottom-centre.
  const hud = document.createElement('div');
  hud.style.cssText
    = 'position:absolute;left:0;bottom:42px;width:100%;display:flex;justify-content:center;'
      + 'gap:24px;align-items:center;pointer-events:none;font:700 16px system-ui;'
      + 'color:#eaf6ff;text-shadow:0 1px 2px #000;';
  const healthBar = document.createElement('div');
  healthBar.style.cssText
    = 'width:220px;height:18px;border:2px solid #2a3340;background:#1a1f27;border-radius:3px;overflow:hidden;';
  const healthFill = document.createElement('div');
  healthFill.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#C24A3A,#E8C84A,#49D17A);';
  healthBar.append(healthFill);
  const ammoLabel = document.createElement('span');
  hud.append(healthBar, ammoLabel);
  container.append(hud);

  // Death overlay.
  const deathOverlay = document.createElement('div');
  deathOverlay.style.cssText
    = 'position:absolute;left:0;top:0;width:100%;height:'
      + `${HEIGHT}px;display:none;place-items:center;background:rgba(40,8,8,0.55);`
      + 'color:#ffd0d0;font:700 30px system-ui;text-align:center;pointer-events:none;';
  deathOverlay.innerHTML
    = 'You died<br><span style="font-size:15px;font-weight:400;color:#e0a0a0">Press R to restart</span>';
  container.append(deathOverlay);

  const world = makeWorld();
  const events = new EventBus<DoomEvent>();

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.KeyW, Key.KeyA, Key.KeyS, Key.KeyD, Key.Space, Key.KeyR, Key.Digit1, Key.Digit2],
  });
  const input = createInput<DoomAction>(
    {
      back: [Key.KeyS],
      forward: [Key.KeyW],
      jump: [Key.Space],
      left: [Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.KeyD],
      weapon1: [Key.Digit1],
      weapon2: [Key.Digit2],
    },
    [keyboard],
  );

  const state: GameState = {
    ammo: [HITSCAN_AMMO_START, ROCKET_AMMO_START],
    dead: false,
    dtMs: LOGIC_TICK_MS,
    events,
    fireTimer: 0,
    firing: false,
    input,
    pitch: 0,
    playerId: null,
    tracer: null,
    weapon: 0,
    world,
    yaw: 0,
  };

  resetGame(state);

  // Pointer lock: click to capture the cursor, then mouse drives yaw + pitch.
  const requestLock = (): void => {
    void Promise.resolve(renderer.domElement.requestPointerLock?.()).catch(() => undefined);
  };
  const onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== renderer.domElement)
      return;
    state.yaw -= e.movementX * MOUSE_SENSITIVITY;
    state.pitch -= e.movementY * MOUSE_SENSITIVITY;
    if (state.pitch > MAX_PITCH)
      state.pitch = MAX_PITCH;
    else if (state.pitch < -MAX_PITCH)
      state.pitch = -MAX_PITCH;
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0)
      return;
    // The click that captures the cursor shouldn't also fire a shot.
    if (document.pointerLockElement === renderer.domElement)
      state.firing = true;
    else
      requestLock();
  };
  const onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0)
      state.firing = false;
  };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);

  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(weaponSystem)
    .add(aiSystem)
    .add(elevatorSystem)
    .add(kinematics3dSystem)
    .add(projectileSystem)
    .add(pickupSystem);

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
      if (state.playerId == null)
        return;
      const p = world.getStore(Position3DDef).get(state.playerId);
      if (p && p.y < RESPAWN_Y)
        respawnPlayer(state);
    },
  });
  tickRunner.start();

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    renderer.render(state);
    const ph = state.playerId == null ? null : world.getStore(HealthDef).get(state.playerId);
    const hp = ph ? Math.max(0, ph.hp) : 0;
    const max = ph ? ph.max : 1;
    healthFill.style.width = `${(hp / max) * 100}%`;
    ammoLabel.textContent = `${state.weapon === 0 ? 'BULLETS' : 'ROCKETS'} ${state.ammo[state.weapon] ?? 0}`;
    deathOverlay.style.display = state.dead ? 'grid' : 'none';
  });
  renderTickSource.start();

  return (): void => {
    input.dispose();
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mousemove', onMouseMove);
    if (document.pointerLockElement === renderer.domElement)
      document.exitPointerLock?.();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    renderer.dispose();
    container.innerHTML = '';
  };
}
