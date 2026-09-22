import type { GameState, StarfighterAction, StarfighterEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { QUAT_IDENTITY } from '@pierre/ecs/modules/math-3d';
import { makeSeededRng } from '@pierre/ecs/modules/rng';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { AIM_DEADZONE, makeWorld, resetGame } from './game';
import { makeRenderer } from './render';
import { bulletSystem, shipSystem, targetSystem, weaponSystem } from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.style.background = '#05070d';

  const sizeOf = (): { h: number; w: number } => ({
    h: container.clientHeight || window.innerHeight,
    w: container.clientWidth || window.innerWidth,
  });
  let { h, w } = sizeOf();

  const renderer = makeRenderer(w, h);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;display:block;cursor:none;';
  container.append(renderer.domElement);

  // Top HUD bar (score + controls hint), overlaid on the scene.
  const hud = document.createElement('div');
  hud.style.cssText
    = 'position:absolute;left:0;top:0;width:100%;display:flex;justify-content:space-between;'
      + 'padding:8px 14px;font:13px system-ui;color:#9fb4d6;text-shadow:0 1px 2px #000;'
      + 'pointer-events:none;box-sizing:border-box;';
  const scoreLabel = document.createElement('span');
  scoreLabel.textContent = 'Score: 0';
  const hint = document.createElement('span');
  hint.textContent = 'W/S throttle · A/D roll · move reticle to steer · LMB/Space fire · R reset';
  hud.append(scoreLabel, hint);
  container.append(hud);

  // Steering HUD: a fixed reference ring (with a faint inner deadzone) plus a
  // free-floating reticle. Where the reticle sits relative to the ring sets
  // the continuous turn rate — recentre it to fly straight.
  const ring = document.createElement('div');
  ring.style.cssText
    = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:1px solid rgba(120,160,210,0.35);'
      + 'border-radius:50%;pointer-events:none;box-sizing:border-box;';
  const deadzone = document.createElement('div');
  deadzone.style.cssText
    = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:1px dashed rgba(120,160,210,0.22);'
      + 'border-radius:50%;pointer-events:none;box-sizing:border-box;';
  const reticle = document.createElement('div');
  reticle.style.cssText
    = 'position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;'
      + 'border:2px solid #9cf6ff;border-radius:50%;pointer-events:none;box-shadow:0 0 6px #37e0ff;';
  const crosshair = document.createElement('div');
  crosshair.textContent = '+';
  crosshair.style.cssText
    = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#9cf6ff;opacity:0.85;'
      + 'font:22px/1 monospace;pointer-events:none;';
  container.append(ring, deadzone, reticle, crosshair);

  let ringRadius = Math.min(w, h) * 0.16;
  const layoutRing = (): void => {
    const d = ringRadius * 2;
    ring.style.width = `${d}px`;
    ring.style.height = `${d}px`;
    const dz = ringRadius * AIM_DEADZONE * 2;
    deadzone.style.width = `${dz}px`;
    deadzone.style.height = `${dz}px`;
  };
  layoutRing();

  const world = makeWorld();
  const events = new EventBus<StarfighterEvent>();

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.KeyW, Key.KeyA, Key.KeyS, Key.KeyD, Key.KeyR, Key.Space],
  });
  const input = createInput<StarfighterAction>(
    {
      fire: [Key.Space],
      reset: [Key.KeyR],
      rollLeft: [Key.KeyA],
      rollRight: [Key.KeyD],
      throttleDown: [Key.KeyS],
      throttleUp: [Key.KeyW],
    },
    [keyboard],
  );

  const state: GameState = {
    aimX: 0,
    aimY: 0,
    angVel: { x: 0, y: 0, z: 0 },
    dtMs: LOGIC_TICK_MS,
    events,
    fireTimer: 0,
    firing: false,
    input,
    orientation: { ...QUAT_IDENTITY },
    playerId: null,
    rng: makeSeededRng(0x5EED),
    score: 0,
    spawnTimer: 0,
    speed: 0,
    world,
  };

  resetGame(state);

  // Free-cursor steering: the reticle follows the mouse (clamped to the ring)
  // and stays where you leave it — the ship keeps turning until you bring it
  // back to the deadzone. No pointer lock.
  const onMouseMove = (e: MouseEvent): void => {
    const rect = renderer.domElement.getBoundingClientRect();
    let dx = e.clientX - rect.left - rect.width / 2;
    let dy = e.clientY - rect.top - rect.height / 2;
    const len = Math.hypot(dx, dy);
    if (len > ringRadius && len > 0) {
      dx *= ringRadius / len;
      dy *= ringRadius / len;
    }
    state.aimX = dx / ringRadius;
    state.aimY = -dy / ringRadius; // screen-down is +Y; invert so up = +
    reticle.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0)
      state.firing = true;
  };
  const onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0)
      state.firing = false;
  };
  const onResize = (): void => {
    ({ h, w } = sizeOf());
    renderer.resize(w, h);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;display:block;cursor:none;';
    ringRadius = Math.min(w, h) * 0.16;
    layoutRing();
  };
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', onResize);

  const scheduler = new Scheduler<GameState>()
    .add(shipSystem)
    .add(weaponSystem)
    .add(bulletSystem)
    .add(targetSystem);

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
  });
  tickRunner.start();

  const refreshScore = (): void => {
    scoreLabel.textContent = `Score: ${state.score}`;
  };
  const unsubScore = events.on('TargetDestroyed', refreshScore);

  const renderTickSource = new AnimationFrameTickSource();
  const unsubRender = renderTickSource.subscribe(() => {
    renderer.render(state);
  });
  renderTickSource.start();

  return (): void => {
    renderer.domElement.removeEventListener('mousemove', onMouseMove);
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', onResize);
    unsubScore();
    unsubRender();
    renderTickSource.stop();
    tickRunner.stop();
    input.dispose();
    renderer.dispose();
    container.innerHTML = '';
  };
}
