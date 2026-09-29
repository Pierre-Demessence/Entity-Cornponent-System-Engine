import type { EntityId } from '@pierre/ecs';
import type { AudioQueue } from '@pierre/ecs/modules/audio';
import type { Fsm } from '@pierre/ecs/modules/fsm';
import type { RandomFn } from '@pierre/ecs/modules/rng';
import type { Timer } from '@pierre/ecs/modules/timer';

import type { Ghost, GhostState, Mode } from './components';
import type { GhostKind } from './ghosts';
import type { LevelParams } from './levels';
import type { Vec } from './maze';
import type { Heading } from './movement';

import { EcsWorld, EventBus } from '@pierre/ecs';
import { makeSpriteAnimator, SpriteAnimatorDef } from '@pierre/ecs/modules/animation';
import { AudioSourceDef } from '@pierre/ecs/modules/audio';
import { cameraToView, makeCamera } from '@pierre/ecs/modules/camera';
import { makeFsm } from '@pierre/ecs/modules/fsm';
import { LifetimeDef, makeLifetime } from '@pierre/ecs/modules/lifetime';
import { ParticleDef, ParticleTag } from '@pierre/ecs/modules/particles';
import { OpacityDef, RenderableDef, RenderOrderDef, ScreenSpaceDef } from '@pierre/ecs/modules/render-canvas2d';
import { SceneTransitionQueue } from '@pierre/ecs/modules/scene-transition';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { finished, makeTimer, tickTimer } from '@pierre/ecs/modules/timer';
import { PositionDef, RotationDef, ScaleDef, VelocityDef } from '@pierre/ecs/modules/transform';

import {
  BrainDef,
  DotTag,
  FruitTag,
  GhostDef,
  GhostTag,
  HeadingDef,
  PacTag,
  PopupTag,
  PowerTag,
  TileDef,
  WantDef,
} from './components';
import { GHOST_KINDS } from './ghosts';
import { EXTRA_LIFE_AT, fruitForLevel, levelParams, releaseDots } from './levels';
import { COLS, FRUIT_SPOT, HOUSE_EXIT, PAC_START, pellets, ROWS } from './maze';

export const TILE = 20;
export const HUD_TOP = 3;
export const HUD_BOTTOM = 2;
export const SCREEN_W = COLS * TILE;
export const SCREEN_H = (ROWS + HUD_TOP + HUD_BOTTOM) * TILE;

/**
 * The camera: world tile `(c, r)` centres at `(c, r)` and is drawn `TILE` px
 * wide, with `HUD_TOP` rows of score readout above the maze. `CameraDef`'s anchor
 * is the view's centre, so it sits half the viewport in from the top-left.
 */
export const CAMERA = makeCamera({
  viewportH: SCREEN_H,
  viewportW: SCREEN_W,
  x: -0.5 + SCREEN_W / TILE / 2,
  y: -0.5 - HUD_TOP + SCREEN_H / TILE / 2,
  zoom: TILE,
});
export const VIEW = cameraToView(CAMERA);

export const START_LIVES = 3;
export const READY_MS = 2200;
export const DEATH_MS = 2000;
export const CLEAR_MS = 2200;
export const FREEZE_MS = 900;
export const IDLE_RELEASE_MS = 4000;
export const FRUIT_MS = 9500;

/** World-space text is scaled by the camera, so these sizes are in tiles, not pixels. */
const WORLD_FONT = 'bold 0.9px "Courier New", monospace';
const SCREEN_FONT = 'bold 16px "Courier New", monospace';

export const ORDER = { dot: 1, fruit: 2, fx: 6, ghost: 4, hud: 10, pac: 5, popup: 7 } as const;

export type Phase = 'clear' | 'dying' | 'over' | 'play' | 'ready';

export type GameEvent
  = | { type: 'DotEaten'; power: boolean }
    | { type: 'ExtraLife' }
    | { type: 'FruitEaten'; points: number; x: number; y: number }
    | { type: 'GameOver' }
    | { type: 'GhostEaten'; kind: string; points: number; x: number; y: number }
    | { type: 'LevelCleared' }
    | { type: 'PacDied' };

/** The ghost whose brain or body is being ticked right now (the FSM tables read it off the context). */
export interface ActiveGhost {
  id: EntityId;
  brain: Fsm<GhostState>;
  ghost: Ghost;
  heading: Heading;
  kind: GhostKind;
  pos: Vec;
}

export interface GameState {
  active: ActiveGhost | null;
  audio: AudioQueue;
  best: number;
  clockMs: number;
  /** Dots and power pellets eaten this level. */
  dotsEaten: number;
  /** Dots eaten since the last death, which is what releases ghosts from the house. */
  dotsLife: number;
  dtMs: number;
  /** Counts power pellets, so each one frightens each ghost at most once. */
  epoch: number;
  events: EventBus<GameEvent>;
  /** The pause after Pac-Man eats a ghost, while its points show. */
  freeze: Timer;
  fright: Timer;
  frightActive: boolean;
  fruitId: EntityId | null;
  ghostChain: number;
  ghostIds: EntityId[];
  hud: Hud;
  /** Restarts on every dot; running out sends the next waiting ghost out anyway. */
  idle: Timer;
  level: number;
  lives: number;
  modeFsm: Fsm<Mode>;
  /** Which entry of the level's scatter/chase schedule is running. */
  modeIndex: number;
  pacDead: boolean;
  pacId: EntityId;
  pacMoving: boolean;
  params: LevelParams;
  pelletsLeft: number;
  phase: Fsm<Phase>;
  rand: RandomFn;
  score: number;
  /** Applied between ticks; carries the rebuild that starts the next level. */
  transitions: SceneTransitionQueue;
  world: EcsWorld;
}

export interface Hud {
  best: EntityId;
  lives: EntityId[];
  message: EntityId;
  score: EntityId;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(RotationDef);
  w.registerComponent(ScaleDef);
  w.registerComponent(OpacityDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerComponent(ScreenSpaceDef);
  w.registerComponent(SpriteAnimatorDef);
  w.registerComponent(LifetimeDef);
  // The audio system reads this store each tick, even though every sound here is a one-shot.
  w.registerComponent(AudioSourceDef);
  w.registerComponent(ParticleDef);
  w.registerComponent(HeadingDef);
  w.registerComponent(TileDef);
  w.registerComponent(WantDef);
  w.registerComponent(GhostDef);
  w.registerComponent(BrainDef);
  for (const tag of [PacTag, GhostTag, DotTag, PowerTag, FruitTag, PopupTag, ParticleTag])
    w.registerTag(tag);
  // Pellets and fruit are found by the tile they sit on, not by a float position.
  w.enableSpatial(TileDef, new HashGrid2D());
  return w;
}

/** A once-timer that starts already finished, for "is this pause running?" flags. */
function spentTimer(ms: number): Timer {
  const t = makeTimer(ms);
  tickTimer(t, ms);
  return t;
}

export function addScore(g: GameState, points: number): void {
  const before = g.score;
  g.score += points;
  if (g.score > g.best)
    g.best = g.score;
  if (before < EXTRA_LIFE_AT && g.score >= EXTRA_LIFE_AT) {
    g.lives++;
    g.events.emit({ type: 'ExtraLife' });
  }
}

/** Whether the world is running: play phase and not in the brief pause after eating a ghost. */
export function isRunning(g: GameState): boolean {
  return g.phase.current === 'play' && finished(g.freeze);
}

export function startFright(g: GameState): void {
  g.epoch++;
  g.ghostChain = 0;
  if (g.params.frightMs > 0) {
    g.fright = makeTimer(g.params.frightMs);
    g.frightActive = true;
    return;
  }
  // No fright time on late levels: the ghosts only turn around.
  for (const id of g.ghostIds) {
    const state = g.world.getStore(BrainDef).get(id)?.current;
    if (state === 'scatter' || state === 'chase')
      g.world.getStore(GhostDef).get(id)!.reverse = true;
  }
}

function sprite(atlas: string, frame: string, size: number): { atlas: string; dh: number; dw: number; frame: string; kind: 'sprite' } {
  return { atlas, dh: size, dw: size, frame, kind: 'sprite' };
}

function spawnPellets(g: GameState): void {
  const { world } = g;
  for (const p of pellets()) {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: p.c, y: p.r });
    world.getStore(TileDef).set(id, { x: p.c, y: p.r });
    world.getStore(RenderableDef).set(id, { fill: '#ffb8ae', kind: 'circle', radius: p.power ? 0.4 : 0.12 });
    world.getStore(RenderOrderDef).set(id, { value: ORDER.dot });
    world.getTag(p.power ? PowerTag : DotTag).add(id);
    g.pelletsLeft++;
  }
}

const GHOST_HOME: Record<GhostKind, { state: GhostState; x: number; y: number }> = {
  blinky: { state: 'scatter', x: HOUSE_EXIT.x, y: HOUSE_EXIT.y },
  clyde: { state: 'house', x: 15.5, y: 14 },
  inky: { state: 'house', x: 11.5, y: 14 },
  pinky: { state: 'house', x: 13.5, y: 14 },
};

/** (Re)places Pac-Man and the four ghosts at their starting posts, leaving the pellets alone. */
export function placeActors(g: GameState): void {
  const { world } = g;
  for (const id of [g.pacId, ...g.ghostIds]) {
    if (world.isAlive(id))
      world.destroyEntity(id);
  }
  g.ghostIds = [];
  g.pacDead = false;
  g.dotsLife = 0;
  g.idle = makeTimer(IDLE_RELEASE_MS);

  const pac = world.createEntity();
  world.getStore(PositionDef).set(pac, { ...PAC_START });
  world.getStore(HeadingDef).set(pac, { dx: -1, dy: 0 });
  world.getStore(WantDef).set(pac, { dx: -1, dy: 0 });
  world.getStore(RotationDef).set(pac, { angle: Math.PI });
  world.getStore(RenderableDef).set(pac, sprite('sprites', 'pac-1', 2));
  world.getStore(SpriteAnimatorDef).set(pac, makeSpriteAnimator('pac-idle'));
  world.getStore(RenderOrderDef).set(pac, { value: ORDER.pac });
  world.getTag(PacTag).add(pac);
  g.pacId = pac;

  const limits = releaseDots(g.level);
  GHOST_KINDS.forEach((kind, i) => {
    const home = GHOST_HOME[kind];
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: home.x, y: home.y });
    world.getStore(HeadingDef).set(id, home.state === 'house' ? { dx: 0, dy: -1 } : { dx: -1, dy: 0 });
    world.getStore(GhostDef).set(id, {
      dotLimit: i === 0 ? 0 : limits[i - 1]!,
      eaten: false,
      epoch: g.epoch,
      kind,
      reverse: false,
      waypoint: 0,
    });
    world.getStore(BrainDef).set(id, makeFsm<GhostState>(home.state));
    world.getStore(RenderableDef).set(id, sprite('sprites', `ghost-${kind}-left-0`, 2));
    world.getStore(SpriteAnimatorDef).set(id, makeSpriteAnimator(`${kind}-left`));
    world.getStore(RenderOrderDef).set(id, { value: ORDER.ghost });
    world.getTag(GhostTag).add(id);
    g.ghostIds.push(id);
  });
}

export function spawnFruit(g: GameState): void {
  const { world } = g;
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { ...FRUIT_SPOT });
  world.getStore(RenderableDef).set(id, sprite('sprites', `fruit-${fruitForLevel(g.level).name}`, 2));
  world.getStore(RenderOrderDef).set(id, { value: ORDER.fruit });
  world.getStore(LifetimeDef).set(id, makeLifetime(FRUIT_MS));
  world.getTag(FruitTag).add(id);
  g.fruitId = id;
}

/** A score readout that drifts up and fades: text + velocity + lifetime, no system of its own for the motion. */
export function spawnPopup(g: GameState, x: number, y: number, text: string, fill: string): void {
  const { world } = g;
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getStore(VelocityDef).set(id, { vx: 0, vy: -1.6 });
  world.getStore(RenderableDef).set(id, { align: 'center', baseline: 'middle', fill, font: WORLD_FONT, kind: 'text', text });
  world.getStore(OpacityDef).set(id, { value: 1 });
  world.getStore(LifetimeDef).set(id, makeLifetime(900));
  world.getStore(RenderOrderDef).set(id, { value: ORDER.popup });
  world.getTag(PopupTag).add(id);
}

function textEntity(g: GameState, x: number, y: number, fill: string, align: CanvasTextAlign, screen: boolean, text = ''): EntityId {
  const { world } = g;
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getStore(RenderableDef).set(id, { align, baseline: 'middle', fill, font: screen ? SCREEN_FONT : WORLD_FONT, kind: 'text', text });
  world.getStore(RenderOrderDef).set(id, { value: ORDER.hud });
  if (screen)
    world.getStore(ScreenSpaceDef).set(id, { value: true });
  return id;
}

function spawnHud(g: GameState): void {
  textEntity(g, TILE * 3, TILE * 0.6, '#fff', 'center', true, '1UP');
  textEntity(g, SCREEN_W / 2, TILE * 0.6, '#fff', 'center', true, 'HIGH SCORE');
  const lives: EntityId[] = [];
  for (let i = 0; i < 5; i++) {
    const id = g.world.createEntity();
    g.world.getStore(PositionDef).set(id, { x: TILE * (2 + i * 2.1), y: (ROWS + HUD_TOP + 1.2) * TILE });
    g.world.getStore(RenderableDef).set(id, sprite('sprites', 'pac-1', TILE * 1.6));
    g.world.getStore(RotationDef).set(id, { angle: Math.PI });
    g.world.getStore(ScreenSpaceDef).set(id, { value: true });
    g.world.getStore(RenderOrderDef).set(id, { value: ORDER.hud });
    lives.push(id);
  }
  g.hud = {
    best: textEntity(g, SCREEN_W / 2, TILE * 1.7, '#fff', 'center', true),
    lives,
    message: textEntity(g, FRUIT_SPOT.x, FRUIT_SPOT.y, '#ffe600', 'center', false),
    score: textEntity(g, TILE * 3, TILE * 1.7, '#fff', 'center', true),
  };
}

/** Builds level `level` from scratch: pellets, actors, HUD, and the schedule at its start. */
export function startLevel(g: GameState, level: number): void {
  g.world.clearAll();
  g.level = level;
  g.params = levelParams(level);
  g.pelletsLeft = 0;
  g.dotsEaten = 0;
  g.epoch = 0;
  g.fruitId = null;
  g.frightActive = false;
  g.freeze = spentTimer(FREEZE_MS);
  g.pacId = -1 as EntityId;
  g.modeFsm = makeFsm<Mode>('scatter');
  g.modeIndex = 0;
  g.ghostIds = [];
  g.phase = makeFsm<Phase>('ready');
  spawnPellets(g);
  placeActors(g);
  spawnHud(g);
}

export function newGame(g: GameState): void {
  g.score = 0;
  g.lives = START_LIVES;
  startLevel(g, 1);
}

export function makeState(audio: AudioQueue, best: number, rand: RandomFn): GameState {
  const g: GameState = {
    active: null,
    audio,
    best,
    clockMs: 0,
    dotsEaten: 0,
    dotsLife: 0,
    dtMs: 0,
    epoch: 0,
    events: new EventBus<GameEvent>(),
    freeze: spentTimer(FREEZE_MS),
    fright: makeTimer(1),
    frightActive: false,
    fruitId: null,
    ghostChain: 0,
    ghostIds: [],
    hud: { best: 0 as EntityId, lives: [], message: 0 as EntityId, score: 0 as EntityId },
    idle: makeTimer(IDLE_RELEASE_MS),
    level: 1,
    lives: START_LIVES,
    modeFsm: makeFsm<Mode>('scatter'),
    modeIndex: 0,
    pacDead: false,
    pacId: 0 as EntityId,
    pacMoving: false,
    params: levelParams(1),
    pelletsLeft: 0,
    phase: makeFsm<Phase>('ready'),
    rand,
    score: 0,
    transitions: new SceneTransitionQueue(),
    world: makeWorld(),
  };
  newGame(g);
  return g;
}
