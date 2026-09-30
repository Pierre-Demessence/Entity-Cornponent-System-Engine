import type { DriveAction, GameState, MenuAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeSeededRng } from '@pierre/ecs/modules/rng';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { initialMenu, makeWorld } from './game';
import { render, VIEW_H, VIEW_W } from './render';
import { clockSystem, collisionSystem, controlSystem, crashSystem, lapSystem, menuSystem, physicsSystem, tagSystem } from './systems';
import { TRACKS } from './track';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.display = 'block';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9fb';
  hint.textContent = 'P1: W throttle, S brake/reverse, A/D steer  ·  P2: ↑ ↓ ← →  ·  Esc menu';
  container.append(canvas, hint);
  const ctx2d = canvas.getContext('2d')!;

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.ArrowUp,
      Key.ArrowDown,
      Key.KeyA,
      Key.KeyD,
      Key.KeyW,
      Key.KeyS,
      Key.Enter,
      Key.Space,
      Key.Escape,
    ],
  });
  const p1 = createInput<DriveAction>(
    { brake: [Key.KeyS], left: [Key.KeyA], right: [Key.KeyD], throttle: [Key.KeyW] },
    [keyboard],
  );
  const p2 = createInput<DriveAction>(
    { brake: [Key.ArrowDown], left: [Key.ArrowLeft], right: [Key.ArrowRight], throttle: [Key.ArrowUp] },
    [keyboard],
  );
  const menuInput = createInput<MenuAction>(
    {
      back: [Key.Escape],
      confirm: [Key.Enter, Key.Space],
      down: [Key.ArrowDown, Key.KeyS],
      left: [Key.ArrowLeft, Key.KeyA],
      right: [Key.ArrowRight, Key.KeyD],
      up: [Key.ArrowUp, Key.KeyW],
    },
    [keyboard],
  );

  const state: GameState = {
    carIds: [],
    countdownMs: 0,
    drive: [p1, p2],
    dtMs: LOGIC_TICK_MS,
    events: new EventBus<never>(),
    immuneMs: 0,
    itSlot: 0,
    lapTarget: 3,
    menu: initialMenu(),
    menuInput,
    mode: 'race',
    opponent: 'ai',
    phase: 'menu',
    raceMs: 0,
    rng: makeSeededRng(Math.floor(Math.random() * 1e9) + 1),
    target: null,
    track: TRACKS[0]!,
    winner: null,
    world: makeWorld(),
  };

  const scheduler = new Scheduler<GameState>()
    .add(menuSystem)
    .add(clockSystem)
    .add(controlSystem)
    .add(physicsSystem)
    .add(collisionSystem)
    .add(lapSystem)
    .add(crashSystem)
    .add(tagSystem);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    contextFactory: () => state,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    onTickComplete: () => {
      p1.clearEdges();
      p2.clearEdges();
      menuInput.clearEdges();
    },
  });
  tickRunner.start();

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state, performance.now());
  });
  renderTickSource.start();

  return (): void => {
    p1.dispose();
    p2.dispose();
    menuInput.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
