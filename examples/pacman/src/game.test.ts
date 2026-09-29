import type { GameState } from './game';
import type { LEFT } from './maze';

import { Scheduler, TickRunner } from '@pierre/ecs';
import { AudioQueue } from '@pierre/ecs/modules/audio';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeSeededRng } from '@pierre/ecs/modules/rng';
import { ManualTickSource } from '@pierre/ecs/modules/tick';
import { describe, expect, it } from 'vitest';

import { BrainDef, GhostDef, HeadingDef, PositionDef, WantDef } from './components';
import { wireEvents } from './events';
import { makeState, READY_MS, startFright } from './game';
import { DOWN, RIGHT, UP } from './maze';
import { RULE_SYSTEMS } from './systems';

const DT = 1000 / 60;

/** The game with every rule system and no renderer, driven one tick at a time. */
function harness(seed = 1): { g: GameState; tick: (n?: number) => void } {
  const g = makeState(new AudioQueue(), 0, makeSeededRng(seed));
  wireEvents(g);
  const scheduler = new Scheduler<GameState>();
  for (const system of RULE_SYSTEMS)
    scheduler.add(system);
  scheduler.add(makeLifetimeSystem<GameState>({ runAfter: ['hud'] }));
  const source = new ManualTickSource();
  const runner = new TickRunner<GameState>({
    scheduler,
    source,
    getEvents: ctx => ctx.events,
    getWorld: () => g.world,
    onTickComplete: () => g.transitions.applyNext(),
    contextFactory: () => {
      g.dtMs = DT;
      return g;
    },
  });
  runner.start();
  return { g, tick: (n = 1) => {
    for (let i = 0; i < n; i++)
      source.tick();
  } };
}

function turn(g: GameState, dir: typeof LEFT): void {
  const want = g.world.getStore(WantDef).get(g.pacId)!;
  want.dx = dir.dx;
  want.dy = dir.dy;
}

function ready(t: ReturnType<typeof harness>): void {
  t.tick(Math.ceil(READY_MS / DT) + 2);
}

const brain = (g: GameState, i: number): string => g.world.getStore(BrainDef).get(g.ghostIds[i]!)!.current;
const pacPos = (g: GameState): { x: number; y: number } => g.world.getStore(PositionDef).get(g.pacId)!;

describe('a new game', () => {
  it('starts on READY with 244 pellets, Blinky outside and the other three in the house', () => {
    const { g } = harness();
    expect(g.phase.current).toBe('ready');
    expect(g.pelletsLeft).toBe(244);
    expect([0, 1, 2, 3].map(i => brain(g, i))).toEqual(['scatter', 'house', 'house', 'house']);
  });

  it('holds everything still until READY is over', () => {
    const t = harness();
    const start = { ...pacPos(t.g) };
    t.tick(30);
    expect(pacPos(t.g)).toEqual(start);
    ready(t);
    expect(t.g.phase.current).toBe('play');
  });
});

describe('playing', () => {
  it('eats dots along the corridor and scores them', () => {
    const t = harness();
    ready(t);
    // Pac-Man starts heading left on row 23; give it a moment to reach dots.
    t.tick(90);
    expect(t.g.score).toBeGreaterThan(0);
    expect(t.g.pelletsLeft).toBeLessThan(244);
    expect(t.g.score).toBe((244 - t.g.pelletsLeft) * 10);
  });

  it('buffers a turn and takes it at the next intersection that allows it', () => {
    const t = harness();
    ready(t);
    turn(t.g, UP);
    t.tick(120);
    const heading = t.g.world.getStore(HeadingDef).get(t.g.pacId)!;
    expect(heading).toEqual({ dx: 0, dy: -1 });
  });

  it('stops against a wall and waits for a legal turn', () => {
    const t = harness();
    ready(t);
    turn(t.g, DOWN);
    t.tick(240);
    const at = { ...pacPos(t.g) };
    t.tick(10);
    expect(pacPos(t.g)).toEqual(at);
    turn(t.g, RIGHT);
    t.tick(30);
    expect(pacPos(t.g)).not.toEqual(at);
  });

  it('lets Pinky out immediately and Clyde only after enough dots', () => {
    const t = harness();
    ready(t);
    t.tick(200);
    expect(brain(t.g, 1)).not.toBe('house');
    expect(brain(t.g, 3)).toBe('house');
  });

  it('releases a waiting ghost when no dot has been eaten for a while', () => {
    const t = harness();
    ready(t);
    // Wall Pac-Man off from any dot: it stays parked against the wall after its first stretch.
    turn(t.g, DOWN);
    t.tick(600);
    expect(brain(t.g, 2)).not.toBe('house');
  });
});

describe('power pellets', () => {
  it('turns roaming ghosts frightened, once, and back when it runs out', () => {
    const t = harness();
    ready(t);
    startFright(t.g);
    t.tick(2);
    expect(brain(t.g, 0)).toBe('frightened');
    // The frightened timer ends and Blinky returns to the mode clock.
    t.tick(Math.ceil(t.g.params.frightMs / DT) + 5);
    expect(brain(t.g, 0)).not.toBe('frightened');
    expect(t.g.frightActive).toBe(false);
  });

  it('eats a frightened ghost: points, a pause, and eyes heading home', () => {
    const t = harness();
    ready(t);
    startFright(t.g);
    t.tick(2);
    const blinky = t.g.ghostIds[0]!;
    const at = t.g.world.getStore(PositionDef).get(blinky)!;
    const pac = pacPos(t.g);
    pac.x = at.x;
    pac.y = at.y;
    const before = t.g.score;
    t.tick(1);
    expect(t.g.score - before).toBe(200);
    expect(t.g.world.getStore(GhostDef).get(blinky)!.eaten).toBe(true);
    t.tick(70);
    expect(['eaten', 'enter']).toContain(brain(t.g, 0));
  });
});

describe('dying', () => {
  it('costs a life and puts everyone back, or ends the game on the last one', () => {
    const t = harness();
    ready(t);
    const blinky = t.g.world.getStore(PositionDef).get(t.g.ghostIds[0]!)!;
    Object.assign(pacPos(t.g), { x: blinky.x, y: blinky.y });
    t.tick(2);
    expect(t.g.phase.current).toBe('dying');
    t.tick(Math.ceil(2000 / DT) + 3);
    expect(t.g.lives).toBe(2);
    expect(t.g.phase.current).toBe('ready');
    expect(pacPos(t.g)).toEqual({ x: 13.5, y: 23 });

    t.g.lives = 1;
    ready(t);
    const again = t.g.world.getStore(PositionDef).get(t.g.ghostIds[0]!)!;
    Object.assign(pacPos(t.g), { x: again.x, y: again.y });
    t.tick(Math.ceil(2100 / DT) + 3);
    expect(t.g.phase.current).toBe('over');
  });
});

describe('clearing the board', () => {
  it('rebuilds the maze for the next level, keeping the score', () => {
    const t = harness();
    ready(t);
    t.g.score = 1230;
    t.g.pelletsLeft = 0;
    t.tick(Math.ceil(2300 / DT) + 5);
    expect(t.g.level).toBe(2);
    expect(t.g.pelletsLeft).toBe(244);
    expect(t.g.score).toBe(1230);
    expect(t.g.phase.current).toBe('ready');
  });
});
