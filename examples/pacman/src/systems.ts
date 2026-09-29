import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from './game';
import type { GhostKind } from './ghosts';
import type { Dir, Vec } from './maze';

import { playClip, SpriteAnimatorDef } from '@pierre/ecs/modules/animation';
import { circleVsCircle, makeTriggerSystem } from '@pierre/ecs/modules/collision';
import { easeInOutSine, easeInQuad } from '@pierre/ecs/modules/easing';
import { tickFsm } from '@pierre/ecs/modules/fsm';
import { LifetimeDef } from '@pierre/ecs/modules/lifetime';
import { lerp, pingPong, vec2MoveToward } from '@pierre/ecs/modules/math';
import { findPath } from '@pierre/ecs/modules/pathfinding';
import { finished, fraction, restart, tickTimer } from '@pierre/ecs/modules/timer';

import { ENTER_PATH, EXIT_PATH, GHOST_STATES, MODE_STATES, PHASE_STATES } from './brains';
import {
  BrainDef,
  DotTag,
  GhostDef,
  HeadingDef,
  OpacityDef,
  PopupTag,
  PositionDef,
  PowerTag,
  RenderableDef,
  RotationDef,
  ScaleDef,
  WantDef,
} from './components';
import {
  addScore,
  FREEZE_MS,
  isRunning,
  spawnFruit,
  startFright,
} from './game';
import { chaseTarget, chooseGhostDirection, SCATTER_CORNERS } from './ghosts';
import { BASE_SPEED, DOT_POINTS, fruitForLevel, ghostPoints, POWER_POINTS } from './levels';
import { HOUSE_CENTER, noUpTile, opposite, passable, TUNNEL_ROW } from './maze';
import { atCentre, stepMover } from './movement';

const FRIGHT_FLASH_MS = 2000;
const EATEN_SPEED = 1.6;

export function dirName(h: { dx: number; dy: number }): 'down' | 'left' | 'right' | 'up' {
  if (h.dx !== 0)
    return h.dx > 0 ? 'right' : 'left';
  return h.dy > 0 ? 'down' : h.dy < 0 ? 'up' : 'left';
}

/** Advances the shared clock and the game's own flow (ready → play → dying → …). */
export const phaseSystem: SchedulableSystem<GameState> = {
  name: 'phase',
  run(g) {
    g.clockMs += g.dtMs;
    tickFsm(g.phase, PHASE_STATES, g, g.dtMs);
  },
};

/** The timers that only run while the world does: the ghost-eaten pause, fright, the scatter/chase clock. */
export const timersSystem: SchedulableSystem<GameState> = {
  name: 'timers',
  runAfter: ['phase'],
  run(g) {
    if (g.phase.current !== 'play')
      return;
    if (!finished(g.freeze)) {
      tickTimer(g.freeze, g.dtMs);
      return;
    }
    tickTimer(g.idle, g.dtMs);
    if (g.frightActive) {
      tickTimer(g.fright, g.dtMs);
      g.frightActive = !finished(g.fright);
    }
    else {
      tickFsm(g.modeFsm, MODE_STATES, g, g.dtMs);
    }
  },
};

/** Steers Pac-Man: turns are buffered in `WantDef` and taken at the first intersection that allows them. */
export const pacSystem: SchedulableSystem<GameState> = {
  name: 'pac',
  runAfter: ['timers'],
  run(g) {
    if (!isRunning(g))
      return;
    const pos = g.world.getStore(PositionDef).get(g.pacId)!;
    const heading = g.world.getStore(HeadingDef).get(g.pacId)!;
    const want = g.world.getStore(WantDef).get(g.pacId)!;
    // Reversing is the one turn that needs no intersection.
    if (!atCentre(pos) && want.dx === -heading.dx && want.dy === -heading.dy && (want.dx !== 0 || want.dy !== 0)) {
      heading.dx = want.dx;
      heading.dy = want.dy;
    }
    const speed = BASE_SPEED * (g.frightActive ? g.params.pacFright : g.params.pacSpeed);
    const beforeX = pos.x;
    const beforeY = pos.y;
    stepMover(pos, heading, speed * g.dtMs / 1000, (c, r) => passable(c, r), (c, r, h) => {
      if ((want.dx !== 0 || want.dy !== 0) && passable(c + want.dx, r + want.dy))
        return { dx: want.dx, dy: want.dy } as Dir;
      return passable(c + h.dx, r + h.dy) ? { dx: h.dx, dy: h.dy } as Dir : null;
    });
    g.pacMoving = pos.x !== beforeX || pos.y !== beforeY;
  },
};

function brainOf(g: GameState, id: EntityId): string {
  return g.world.getStore(BrainDef).get(id)!.current;
}

function tileOf(pos: Vec): Vec {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

function ghostSpeed(g: GameState, kind: string, state: string, pos: Vec): number {
  if (state === 'eaten')
    return BASE_SPEED * g.params.ghostSpeed * EATEN_SPEED;
  if (state === 'frightened')
    return BASE_SPEED * g.params.ghostFright;
  if (pos.y === TUNNEL_ROW && (pos.x < 6 || pos.x > 21))
    return BASE_SPEED * g.params.ghostTunnel;
  // Blinky speeds up as the last dots run out.
  const rush = kind === 'blinky' ? (g.pelletsLeft <= 10 ? 0.1 : g.pelletsLeft <= 20 ? 0.05 : 0) : 0;
  return BASE_SPEED * (g.params.ghostSpeed + rush);
}

/** Walks a scripted path through the ghost-house door, one straight leg at a time. */
function follow(g: GameState, path: readonly Vec[], dist: number): void {
  const a = g.active!;
  const target = path[a.ghost.waypoint];
  if (!target)
    return;
  const next = vec2MoveToward(a.pos, target, dist);
  a.heading.dx = Math.sign(target.x - a.pos.x);
  a.heading.dy = a.heading.dx === 0 ? Math.sign(target.y - a.pos.y) : 0;
  a.pos.x = next.x;
  a.pos.y = next.y;
  if (next.x === target.x && next.y === target.y)
    a.ghost.waypoint++;
}

function ghostDecide(g: GameState, kind: GhostKind, state: string): (c: number, r: number, h: { dx: number; dy: number }) => Dir | null {
  const a = g.active!;
  return (c, r, h) => {
    const heading = { dx: h.dx, dy: h.dy } as Dir;
    if (a.ghost.reverse) {
      a.ghost.reverse = false;
      return opposite(heading);
    }
    if (state === 'eaten') {
      const path = findPath({
        from: { x: c, y: r },
        to: { x: 13, y: 11 },
        cost: () => 1,
        heuristic: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
        neighbors: (x, y) => [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }],
        traversable: (x, y) => passable(x, y),
      });
      const step = path?.[0];
      return step ? { dx: Math.sign(step.x - c), dy: Math.sign(step.y - r) } as Dir : null;
    }
    const opts = { noUp: state !== 'frightened' && noUpTile(c, r), passable: (x: number, y: number) => passable(x, y) };
    if (state === 'frightened')
      return chooseGhostDirection(c, r, heading, { x: c, y: r }, { ...opts, rand: g.rand });
    const pacPos = g.world.getStore(PositionDef).get(g.pacId)!;
    const pacDir = g.world.getStore(HeadingDef).get(g.pacId)!;
    const blinkyId = g.ghostIds[0]!;
    const elroy = kind === 'blinky' && g.pelletsLeft <= 20;
    const target = state === 'scatter' && !elroy
      ? SCATTER_CORNERS[kind]
      : chaseTarget(kind, {
          blinky: tileOf(g.world.getStore(PositionDef).get(blinkyId)!),
          ghost: { x: c, y: r },
          pac: tileOf(pacPos),
          pacDir: { dx: pacDir.dx, dy: pacDir.dy } as Dir,
        });
    return chooseGhostDirection(c, r, heading, target, opts);
  };
}

/** Ticks every ghost's brain, then moves its body the way its current state says. */
export const ghostSystem: SchedulableSystem<GameState> = {
  name: 'ghosts',
  runAfter: ['pac'],
  run(g) {
    if (!isRunning(g))
      return;
    const { world } = g;
    for (const id of g.ghostIds) {
      const ghost = world.getStore(GhostDef).get(id)!;
      const brain = world.getStore(BrainDef).get(id)!;
      const pos = world.getStore(PositionDef).get(id)!;
      const heading = world.getStore(HeadingDef).get(id)!;
      const kind = ghost.kind as GhostKind;
      g.active = { id, brain, ghost, heading, kind, pos };
      tickFsm(brain, GHOST_STATES, g, g.dtMs);

      const dist = ghostSpeed(g, kind, brain.current, pos) * g.dtMs / 1000;
      switch (brain.current) {
        case 'house':
          break;
        case 'exit':
          follow(g, EXIT_PATH, BASE_SPEED * 0.5 * g.dtMs / 1000);
          break;
        case 'enter':
          follow(g, ENTER_PATH, BASE_SPEED * g.params.ghostSpeed * EATEN_SPEED * g.dtMs / 1000);
          break;
        default:
          stepMover(pos, heading, dist, (c, r) => passable(c, r), ghostDecide(g, kind, brain.current));
      }
      // Leaving the house, a ghost steps out heading left, as it does in the original.
      if (brain.current === 'exit' && ghost.waypoint >= EXIT_PATH.length) {
        heading.dx = -1;
        heading.dy = 0;
      }
    }
    g.active = null;
  },
};

/** Pac-Man eats what shares his tile: dots, power pellets, and (by distance) the bonus fruit. */
export const eatSystem: SchedulableSystem<GameState> = {
  name: 'eat',
  runAfter: ['ghosts'],
  run(g) {
    if (!isRunning(g))
      return;
    const { world } = g;
    const pos = world.getStore(PositionDef).get(g.pacId)!;
    const tile = tileOf(pos);
    for (const id of world.tiles.queryAt(tile)) {
      const power = world.getTag(PowerTag).has(id);
      if (!power && !world.getTag(DotTag).has(id))
        continue;
      world.queueDestroy(id);
      g.pelletsLeft--;
      g.dotsEaten++;
      g.dotsLife++;
      restart(g.idle);
      addScore(g, power ? POWER_POINTS : DOT_POINTS);
      g.events.emit({ power, type: 'DotEaten' });
      if (power)
        startFright(g);
      if (g.dotsEaten === 70 || g.dotsEaten === 170)
        spawnFruit(g);
    }
    if (g.fruitId !== null && world.isAlive(g.fruitId)) {
      const fruit = world.getStore(PositionDef).get(g.fruitId)!;
      if (Math.hypot(fruit.x - pos.x, fruit.y - pos.y) < 0.8) {
        const { points } = fruitForLevel(g.level);
        world.queueDestroy(g.fruitId);
        g.fruitId = null;
        addScore(g, points);
        g.events.emit({ points, type: 'FruitEaten', x: fruit.x, y: fruit.y });
      }
    }
  },
};

/** Pac-Man against each ghost: a frightened one is eaten, a roaming one is fatal. */
export const catchSystem: SchedulableSystem<GameState> = makeTriggerSystem<GameState>({
  name: 'catch',
  runAfter: ['eat'],
  * broadphase(g) {
    if (!isRunning(g))
      return;
    for (const id of g.ghostIds)
      yield [g.pacId, id] as const;
  },
  onOverlap(g, _pac, ghostId) {
    const state = brainOf(g, ghostId);
    const pos = g.world.getStore(PositionDef).get(ghostId)!;
    if (state === 'frightened') {
      const ghost = g.world.getStore(GhostDef).get(ghostId)!;
      const points = ghostPoints(g.ghostChain++);
      ghost.eaten = true;
      g.world.getStore(OpacityDef).set(ghostId, { value: 0 });
      restart(g.freeze, FREEZE_MS);
      addScore(g, points);
      g.events.emit({ kind: ghost.kind, points, type: 'GhostEaten', x: pos.x, y: pos.y });
    }
    else if (state === 'scatter' || state === 'chase') {
      g.pacDead = true;
    }
  },
  overlaps(g, pac, ghost) {
    const a = g.world.getStore(PositionDef).get(pac)!;
    const b = g.world.getStore(PositionDef).get(ghost)!;
    return circleVsCircle(a, 0.5, b, 0.5);
  },
});

/** Chooses each actor's sprite clip and facing from what it is doing this tick. */
export const animSystem: SchedulableSystem<GameState> = {
  name: 'anim',
  runAfter: ['catch'],
  run(g) {
    const { world } = g;
    const animators = world.getStore(SpriteAnimatorDef);

    const pacAnim = animators.get(g.pacId)!;
    const pacHeading = world.getStore(HeadingDef).get(g.pacId)!;
    const phase = g.phase.current;
    if (phase === 'dying' || phase === 'over') {
      playClip(pacAnim, 'pac-death');
      world.getStore(RotationDef).set(g.pacId, { angle: -Math.PI / 2 });
    }
    else {
      playClip(pacAnim, g.pacMoving && phase === 'play' ? 'pac-move' : 'pac-idle');
      world.getStore(RotationDef).set(g.pacId, { angle: Math.atan2(pacHeading.dy, pacHeading.dx) });
    }

    for (const id of g.ghostIds) {
      const state = brainOf(g, id);
      const heading = world.getStore(HeadingDef).get(id)!;
      const dir = dirName(heading);
      let clip: string;
      if (state === 'eaten' || state === 'enter')
        clip = `eyes-${dir}`;
      else if (state === 'frightened')
        clip = g.fright.remainingMs < FRIGHT_FLASH_MS ? 'fright-flash' : 'fright';
      else
        clip = `${world.getStore(GhostDef).get(id)!.kind}-${dir}`;
      playClip(animators.get(id)!, clip);
      // Ghosts bob up and down while they wait in the house.
      if (state === 'house') {
        const pos = world.getStore(PositionDef).get(id)!;
        pos.y = HOUSE_CENTER.y - 0.3 + pingPong(g.clockMs / 260 + id * 0.7, 0.6);
      }
    }

    const pulse = lerp(0.65, 1.05, easeInOutSine(pingPong(g.clockMs / 380, 1)));
    for (const id of world.getTag(PowerTag))
      world.getStore(ScaleDef).set(id, { x: pulse, y: pulse });
  },
};

/** Fades score popups out over their lifetime; the drift is plain velocity. */
export const popupSystem: SchedulableSystem<GameState> = {
  name: 'popups',
  run(g) {
    const lifetimes = g.world.getStore(LifetimeDef);
    for (const id of g.world.getTag(PopupTag))
      g.world.getStore(OpacityDef).set(id, { value: 1 - easeInQuad(fraction(lifetimes.get(id)!)) });
  },
};

/** Writes the score readouts, the spare-life icons and the centre message. */
export const hudSystem: SchedulableSystem<GameState> = {
  name: 'hud',
  run(g) {
    const { hud, world } = g;
    const renderables = world.getStore(RenderableDef);
    const setText = (id: EntityId, text: string, fill?: string): void => {
      const r = renderables.get(id);
      if (r?.kind === 'text')
        renderables.set(id, { ...r, fill: fill ?? r.fill, text });
    };
    setText(hud.score, String(g.score));
    setText(hud.best, String(g.best));
    hud.lives.forEach((id, i) => {
      world.getStore(OpacityDef).set(id, { value: i < g.lives - 1 ? 1 : 0 });
    });
    const message = g.phase.current === 'ready' ? 'READY!' : g.phase.current === 'over' ? 'GAME  OVER' : '';
    setText(hud.message, message, g.phase.current === 'over' ? '#ff2a2a' : '#ffe600');
  },
};

/** Every rule of the game, in the order they run (each also declares its own `runAfter`). */
export const RULE_SYSTEMS: readonly SchedulableSystem<GameState>[] = [
  phaseSystem,
  timersSystem,
  pacSystem,
  ghostSystem,
  eatSystem,
  catchSystem,
  animSystem,
  popupSystem,
  hudSystem,
];
