import type { DriveAction, GameState, MenuAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput } from '@pierre/ecs/modules/input';
import { makeSeededRng } from '@pierre/ecs/modules/rng';
import { ManualTickSource } from '@pierre/ecs/modules/tick';
import { describe, expect, it } from 'vitest';

import { CAR_RADIUS } from './car';
import { CarDef, PositionDef } from './components';
import { CRASH_GOAL, initialMenu, makeWorld, startRace, TAG_BONUS } from './game';
import { clockSystem, collisionSystem, controlSystem, crashSystem, lapSystem, menuSystem, physicsSystem, tagSystem } from './systems';
import { locate, pointAt, TRACKS } from './track';

const DT = 1000 / 60;

function harness(): {
  drive: Set<DriveAction>;
  menuKeys: Set<MenuAction>;
  state: GameState;
  tick: (n?: number) => void;
} {
  const drive = new Set<DriveAction>();
  const menuKeys = new Set<MenuAction>();
  const p1 = createInput<DriveAction>({ brake: [], left: [], right: [], throttle: [] }, []);
  const p2 = createInput<DriveAction>({ brake: [], left: [], right: [], throttle: [] }, []);
  p1.isDown = a => drive.has(a);
  const menuInput = createInput<MenuAction>({ back: [], confirm: [], down: [], left: [], right: [], up: [] }, []);
  menuInput.justPressed = a => menuKeys.has(a);

  const state: GameState = {
    carIds: [],
    countdownMs: 0,
    drive: [p1, p2],
    dtMs: DT,
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
    rng: makeSeededRng(1),
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
  const source = new ManualTickSource();
  new TickRunner<GameState>({
    scheduler,
    source,
    contextFactory: () => state,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
  }).start();
  return {
    drive,
    menuKeys,
    state,
    tick: (n = 1) => {
      for (let i = 0; i < n; i++)
        source.tick();
    },
  };
}

const carOf = (s: GameState, slot: number) => s.world.getStore(CarDef).get(s.carIds[slot]!)!;
const posOf = (s: GameState, slot: number) => s.world.getStore(PositionDef).get(s.carIds[slot]!)!;

/** Let the countdown run out so the cars can move. */
function go(h: ReturnType<typeof harness>): void {
  h.tick(200);
  expect(h.state.phase).toBe('racing');
}

describe('menu', () => {
  it('starts a race from the chosen options', () => {
    const h = harness();
    h.state.menu.track = 1;
    h.state.menu.opponent = 0;
    h.state.menu.laps = 1;
    h.menuKeys.add('confirm');
    h.tick();
    h.menuKeys.clear();
    expect(h.state.phase).toBe('countdown');
    expect(h.state.track.name).toBe('Clover');
    expect(h.state.opponent).toBe('clock');
    expect(h.state.lapTarget).toBe(5);
    expect(h.state.carIds).toHaveLength(1);
  });

  it('cycles the game mode and drops the clock opponent outside racing', () => {
    const h = harness();
    h.state.menu.opponent = 0;
    h.state.menu.row = 0;
    h.menuKeys.add('right');
    h.tick();
    h.menuKeys.clear();
    expect(h.state.menu.mode).toBe(1);
    expect(h.state.menu.opponent).toBe(1);
  });

  it('returns to the menu on back', () => {
    const h = harness();
    startRace(h.state, 1);
    h.menuKeys.add('back');
    h.tick();
    expect(h.state.phase).toBe('menu');
    expect(h.state.carIds).toHaveLength(0);
  });
});

describe('racing', () => {
  it('holds the cars on the grid until the countdown ends', () => {
    const h = harness();
    h.state.menu.opponent = 2;
    startRace(h.state, 1);
    h.drive.add('throttle');
    h.tick(30);
    expect(carOf(h.state, 0).speed).toBe(0);
    go(h);
    h.tick(30);
    expect(carOf(h.state, 0).speed).toBeGreaterThan(0);
  });

  it('counts laps only for forward progress', () => {
    const h = harness();
    h.state.menu.opponent = 0;
    startRace(h.state, 1);
    go(h);
    const car = carOf(h.state, 0);
    const pos = posOf(h.state, 0);
    // Put the car just past the line, then drive it backwards across: no lap.
    const back = pointAt(h.state.track, h.state.track.length - 10);
    pos.x = back.x;
    pos.y = back.y;
    car.heading = Math.atan2(back.ty, back.tx);
    car.speed = 0;
    car.s = h.state.track.length - 10;
    car.progress = -10;
    h.tick();
    expect(car.laps).toBe(0);
    const fwd = pointAt(h.state.track, 10);
    pos.x = fwd.x;
    pos.y = fwd.y;
    h.tick();
    expect(car.laps).toBe(0);
    expect(car.progress).toBeGreaterThan(-15);
  });

  it('counts a lap and records its time when a car crosses the line', () => {
    const h = harness();
    h.state.menu.opponent = 0;
    startRace(h.state, 1);
    go(h);
    const car = carOf(h.state, 0);
    const pos = posOf(h.state, 0);
    const len = h.state.track.length;
    car.progress = len - 3;
    car.s = len - 3;
    const p = pointAt(h.state.track, len - 3);
    pos.x = p.x;
    pos.y = p.y;
    car.heading = Math.atan2(p.ty, p.tx);
    car.speed = 200;
    h.tick(10);
    expect(car.laps).toBe(1);
    expect(car.bestLapMs).toBeGreaterThan(0);
  });

  it('ends the race when the lap target is reached', () => {
    const h = harness();
    h.state.menu.opponent = 0;
    startRace(h.state, 1);
    h.state.lapTarget = 1;
    go(h);
    const car = carOf(h.state, 0);
    const pos = posOf(h.state, 0);
    const len = h.state.track.length;
    const p = pointAt(h.state.track, len - 3);
    pos.x = p.x;
    pos.y = p.y;
    car.heading = Math.atan2(p.ty, p.tx);
    car.speed = 200;
    car.s = len - 3;
    car.progress = len - 3;
    h.tick(10);
    expect(h.state.phase).toBe('finished');
    expect(h.state.winner).toBe(0);
  });

  it.each(TRACKS.map((t, i) => [t.name, i] as const))('the AI drives clean laps on %s', (_name, trackIndex) => {
    const h = harness();
    h.state.menu.track = trackIndex;
    h.state.menu.opponent = 1;
    startRace(h.state, 7);
    h.state.lapTarget = 3;
    // The human car idles on the grid; the AI must lap without leaving the corridor.
    let worst = 0;
    for (let i = 0; i < 60 * 240 && h.state.phase !== 'finished'; i++) {
      h.tick();
      const p = posOf(h.state, 1);
      worst = Math.max(worst, locate(h.state.track, p.x, p.y).dist);
    }
    expect(h.state.phase).toBe('finished');
    expect(h.state.winner).toBe(1);
    expect(worst).toBeLessThanOrEqual(h.state.track.halfWidth);
  });

  it('keeps cars off each other', () => {
    const h = harness();
    h.state.menu.opponent = 2;
    startRace(h.state, 1);
    go(h);
    const a = posOf(h.state, 0);
    const b = posOf(h.state, 1);
    b.x = a.x + 3;
    b.y = a.y;
    h.tick();
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(2 * CAR_RADIUS - 0.01);
  });
});

describe('crash and score', () => {
  it('scores a hit and moves the target', () => {
    const h = harness();
    h.state.menu.mode = 1;
    h.state.menu.opponent = 2;
    startRace(h.state, 3);
    go(h);
    const before = { ...h.state.target! };
    const pos = posOf(h.state, 0);
    pos.x = before.x;
    pos.y = before.y;
    h.tick();
    expect(carOf(h.state, 0).score).toBe(1);
    expect(h.state.target).not.toEqual(before);
    const t = h.state.target!;
    expect(locate(h.state.track, t.x, t.y).dist).toBeLessThan(h.state.track.halfWidth);
  });

  it('ends the game at the goal', () => {
    const h = harness();
    h.state.menu.mode = 1;
    h.state.menu.opponent = 2;
    startRace(h.state, 3);
    go(h);
    carOf(h.state, 1).score = CRASH_GOAL - 1;
    const pos = posOf(h.state, 1);
    pos.x = h.state.target!.x;
    pos.y = h.state.target!.y;
    h.tick();
    expect(h.state.phase).toBe('finished');
    expect(h.state.winner).toBe(1);
  });
});

describe('tag', () => {
  it('awards the chaser and swaps roles, with a grace period', () => {
    const h = harness();
    h.state.menu.mode = 2;
    h.state.menu.opponent = 2;
    startRace(h.state, 3);
    go(h);
    expect(h.state.itSlot).toBe(0);
    const a = posOf(h.state, 0);
    const b = posOf(h.state, 1);
    b.x = a.x + 15;
    b.y = a.y;
    h.tick();
    expect(carOf(h.state, 1).score).toBe(TAG_BONUS);
    expect(h.state.itSlot).toBe(1);
    // Still overlapping: the grace period stops an instant re-tag.
    h.tick();
    expect(h.state.itSlot).toBe(1);
    expect(carOf(h.state, 0).score).toBe(0);
  });

  it('pays the blinking car one point per second', () => {
    const h = harness();
    h.state.menu.mode = 2;
    h.state.menu.opponent = 2;
    startRace(h.state, 3);
    go(h);
    const before = carOf(h.state, 0).score;
    h.tick(120);
    expect(carOf(h.state, 0).score).toBeGreaterThan(before);
  });
});
