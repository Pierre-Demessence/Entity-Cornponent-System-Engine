import type { SchedulableSystem } from '@pierre/ecs';

import type { AiGoal } from './ai';
import type { Body } from './car';
import type { Car, Position } from './components';
import type { GameState } from './game';

import { circleVsCircle } from '@pierre/ecs/modules/collision';

import { AI_SPEED_FACTOR, aiDrive } from './ai';
import { bounceOffWalls, collideCars, MAX_SPEED, stepCar } from './car';
import { CarDef, PositionDef } from './components';
import {
  backToMenu,
  CRASH_GOAL,
  LAP_OPTIONS,
  menuRows,
  MODES,
  OPPONENTS,
  opponentsFor,
  randomTarget,
  startRace,
  TAG_BONUS,
  TAG_GOAL,
  TAG_IMMUNE_MS,
  TARGET_RADIUS,
} from './game';
import { arcDelta, locate, TRACKS } from './track';

const CAR_TOUCH = 2 * 9 + 2;

interface Entry { car: Car; pos: Position }

function entries(ctx: GameState): Entry[] {
  const cars = ctx.world.getStore(CarDef);
  const positions = ctx.world.getStore(PositionDef);
  return ctx.carIds.map(id => ({ car: cars.get(id)!, pos: positions.get(id)! }));
}

function toBody(e: Entry): Body {
  return { heading: e.car.heading, speed: e.car.speed, x: e.pos.x, y: e.pos.y };
}

function fromBody(e: Entry, b: Body): void {
  e.car.heading = b.heading;
  e.car.speed = b.speed;
  e.pos.x = b.x;
  e.pos.y = b.y;
}

function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/** Menu navigation and the game-over screen. */
export const menuSystem: SchedulableSystem<GameState> = {
  name: 'menu',
  run(ctx) {
    const input = ctx.menuInput;
    if (ctx.phase === 'finished') {
      if (input.justPressed('confirm'))
        startRace(ctx, Math.floor(ctx.rng() * 1e9) + 1);
      else if (input.justPressed('back'))
        backToMenu(ctx);
      return;
    }
    if (ctx.phase !== 'menu') {
      if (input.justPressed('back'))
        backToMenu(ctx);
      return;
    }

    const menu = ctx.menu;
    const mode = MODES[menu.mode]!;
    const rows = menuRows(mode);
    if (input.justPressed('up'))
      menu.row = wrapIndex(menu.row - 1, rows.length);
    if (input.justPressed('down'))
      menu.row = wrapIndex(menu.row + 1, rows.length);
    const step = (input.justPressed('right') ? 1 : 0) - (input.justPressed('left') ? 1 : 0);
    const row = rows[menu.row]!;
    if (step !== 0) {
      if (row === 'mode') {
        menu.mode = wrapIndex(menu.mode + step, MODES.length);
        menu.row = Math.min(menu.row, menuRows(MODES[menu.mode]!).length - 1);
        const allowed = opponentsFor(MODES[menu.mode]!);
        if (!allowed.includes(OPPONENTS[menu.opponent]!))
          menu.opponent = OPPONENTS.indexOf(allowed[0]!);
      }
      else if (row === 'track') {
        menu.track = wrapIndex(menu.track + step, TRACKS.length);
      }
      else if (row === 'opponent') {
        const allowed = opponentsFor(mode);
        const at = allowed.indexOf(OPPONENTS[menu.opponent]!);
        menu.opponent = OPPONENTS.indexOf(allowed[wrapIndex(at + step, allowed.length)]!);
      }
      else if (row === 'laps') {
        menu.laps = wrapIndex(menu.laps + step, LAP_OPTIONS.length);
      }
    }
    if (input.justPressed('confirm') && row === 'start')
      startRace(ctx, Math.floor(ctx.rng() * 1e9) + 1);
  },
};

/** Countdown and race clock; in tag the blinking car earns a point per second. */
export const clockSystem: SchedulableSystem<GameState> = {
  name: 'clock',
  runAfter: ['menu'],
  run(ctx) {
    if (ctx.phase === 'countdown') {
      ctx.countdownMs -= ctx.dtMs;
      if (ctx.countdownMs <= 0)
        ctx.phase = 'racing';
      return;
    }
    if (ctx.phase !== 'racing')
      return;
    const before = ctx.raceMs;
    ctx.raceMs += ctx.dtMs;
    ctx.immuneMs = Math.max(0, ctx.immuneMs - ctx.dtMs);
    if (ctx.mode === 'tag' && Math.floor(ctx.raceMs / 1000) > Math.floor(before / 1000)) {
      const it = entries(ctx)[ctx.itSlot];
      if (it)
        it.car.score += 1;
    }
  },
};

/** Turns keys (humans) or steering forces (AI) into pedal and wheel input. */
export const controlSystem: SchedulableSystem<GameState> = {
  name: 'control',
  runAfter: ['clock'],
  run(ctx) {
    const all = entries(ctx);
    const driving = ctx.phase === 'racing';
    for (const e of all) {
      if (!driving) {
        e.car.throttle = 0;
        e.car.steer = 0;
        continue;
      }
      if (e.car.isAi) {
        const rival = all.find(o => o !== e)!;
        const others = all.filter(o => o !== e).map(toBody);
        const drive = aiDrive(toBody(e), aiGoal(ctx, e, toBody(rival)), others, ctx.track);
        e.car.throttle = drive.throttle;
        e.car.steer = drive.steer;
        continue;
      }
      const input = ctx.drive[e.car.slot]!;
      e.car.throttle = (input.isDown('throttle') ? 1 : 0) - (input.isDown('brake') ? 1 : 0);
      e.car.steer = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    }
  },
};

function aiGoal(ctx: GameState, e: Entry, rival: Body): AiGoal {
  if (ctx.mode === 'crash' && ctx.target)
    return { kind: 'reach', x: ctx.target.x, y: ctx.target.y };
  if (ctx.mode === 'tag')
    return { kind: ctx.itSlot === e.car.slot ? 'evade' : 'chase', target: rival };
  return { kind: 'lap' };
}

export const physicsSystem: SchedulableSystem<GameState> = {
  name: 'physics',
  runAfter: ['control'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    for (const e of entries(ctx)) {
      const b = toBody(e);
      stepCar(b, e.car.throttle, e.car.steer, dt, e.car.isAi ? MAX_SPEED * AI_SPEED_FACTOR : MAX_SPEED);
      fromBody(e, b);
    }
  },
};

export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  runAfter: ['physics'],
  run(ctx) {
    const all = entries(ctx);
    for (const e of all) {
      const b = toBody(e);
      bounceOffWalls(b, ctx.track);
      fromBody(e, b);
    }
    const [first, second] = all;
    if (first && second) {
      const a = toBody(first);
      const b = toBody(second);
      if (collideCars(a, b)) {
        fromBody(first, a);
        fromBody(second, b);
        // The push can shove a car into the wall; put it back.
        for (const e of all) {
          const wall = toBody(e);
          bounceOffWalls(wall, ctx.track);
          fromBody(e, wall);
        }
      }
    }
  },
};

function finish(ctx: GameState, winner: number): void {
  ctx.phase = 'finished';
  ctx.winner = winner;
}

/** Progress along the loop, lap counting and lap times. Driving backwards undoes progress. */
export const lapSystem: SchedulableSystem<GameState> = {
  name: 'laps',
  runAfter: ['collision'],
  run(ctx) {
    if (ctx.phase !== 'racing' && ctx.phase !== 'countdown')
      return;
    for (const e of entries(ctx)) {
      const loc = locate(ctx.track, e.pos.x, e.pos.y);
      const before = e.car.progress;
      e.car.progress += arcDelta(ctx.track, e.car.s, loc.s);
      e.car.s = loc.s;
      if (before < 0 && e.car.progress >= 0)
        e.car.lapStartMs = ctx.raceMs;
      const laps = Math.max(0, Math.floor(e.car.progress / ctx.track.length));
      if (laps > e.car.laps) {
        e.car.laps = laps;
        const lap = ctx.raceMs - e.car.lapStartMs;
        e.car.lapStartMs = ctx.raceMs;
        if (e.car.bestLapMs === 0 || lap < e.car.bestLapMs)
          e.car.bestLapMs = lap;
        if (ctx.mode === 'race' && laps >= ctx.lapTarget && ctx.phase === 'racing') {
          e.car.finished = true;
          finish(ctx, e.car.slot);
          return;
        }
      }
    }
  },
};

/** Crash & Score: the target square moves after every hit. */
export const crashSystem: SchedulableSystem<GameState> = {
  name: 'crash',
  runAfter: ['collision'],
  run(ctx) {
    if (ctx.mode !== 'crash' || ctx.phase !== 'racing' || !ctx.target)
      return;
    for (const e of entries(ctx)) {
      if (circleVsCircle(e.pos, 9, ctx.target, TARGET_RADIUS)) {
        e.car.score += 1;
        if (e.car.score >= CRASH_GOAL) {
          finish(ctx, e.car.slot);
          return;
        }
        ctx.target = randomTarget(ctx);
        return;
      }
    }
  },
};

/** Tag: touching the blinking car scores for the chaser, then the roles swap. */
export const tagSystem: SchedulableSystem<GameState> = {
  name: 'tag',
  runAfter: ['collision'],
  run(ctx) {
    if (ctx.mode !== 'tag' || ctx.phase !== 'racing')
      return;
    const all = entries(ctx);
    const [first, second] = all;
    if (first && second && ctx.immuneMs === 0 && circleVsCircle(first.pos, CAR_TOUCH / 2, second.pos, CAR_TOUCH / 2)) {
      const chaser = all[1 - ctx.itSlot]!;
      chaser.car.score += TAG_BONUS;
      ctx.itSlot = chaser.car.slot;
      ctx.immuneMs = TAG_IMMUNE_MS;
    }
    for (const e of all) {
      if (e.car.score >= TAG_GOAL) {
        finish(ctx, e.car.slot);
        return;
      }
    }
  },
};
