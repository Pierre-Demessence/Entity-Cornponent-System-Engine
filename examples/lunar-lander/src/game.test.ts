import type { GameState, LanderAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { makeSpriteAnimationSystem } from '@pierre/ecs/modules/animation';
import { createInput } from '@pierre/ecs/modules/input';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { ManualTickSource } from '@pierre/ecs/modules/tick';
import { describe, expect, it } from 'vitest';

import { CameraDef, LanderDef, PositionDef, VelocityDef } from './components';
import { GRAVITY, LEG_DROP, makeWorld, newRun, startLevel } from './game';
import { FUEL_MAX } from './landing';
import { contactSystem, gravitySystem, inputSystem, settleSystem } from './systems';
import { generateTerrain, heightAt } from './terrain';

const DT = 1000 / 60;

/** Keys as a plain set the harness controls; no DOM providers. */
function harness(seed = 3): { held: Set<LanderAction>; state: GameState; tick: (n?: number) => void } {
  const held = new Set<LanderAction>();
  const input = createInput<LanderAction>(
    { left: [], next: [], right: [], thrust: [] },
    [],
  );
  const originalIsDown = input.isDown.bind(input);
  input.isDown = (a: LanderAction): boolean => held.has(a) || originalIsDown(a);

  const state: GameState = {
    cameraId: null,
    dtMs: DT,
    events: new EventBus<never>(),
    flameId: null,
    input,
    landerId: null,
    landings: 0,
    message: null,
    phase: 'flying',
    runRecorded: false,
    runs: [],
    score: 0,
    seed,
    terrain: generateTerrain(seed),
    world: makeWorld(),
  };
  newRun(state, seed);

  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(gravitySystem)
    .add(makeVelocityIntegrationSystem<GameState>({ runAfter: ['gravity'] }))
    .add(contactSystem)
    .add(settleSystem)
    .add(makeSpriteAnimationSystem<GameState>());
  const source = new ManualTickSource();
  const runner = new TickRunner<GameState>({
    scheduler,
    source,
    contextFactory: () => state,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
  });
  runner.start();
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++)
      source.tick();
  };
  return { held, state, tick };
}

const getLander = (s: GameState): { angle: number; fuel: number; spin: number; thrusting: boolean } => s.world.getStore(LanderDef).get(s.landerId!)!;
const getPos = (s: GameState): { x: number; y: number } => s.world.getStore(PositionDef).get(s.landerId!)!;
const getVel = (s: GameState): { vx: number; vy: number } => s.world.getStore(VelocityDef).get(s.landerId!)!;

function lander(state: GameState): { l: ReturnType<typeof getLander>; p: ReturnType<typeof getPos>; v: ReturnType<typeof getVel> } {
  return { l: getLander(state), p: getPos(state), v: getVel(state) };
}

/** Put the lander just above pad `i`, upright, at `vy`. */
function hoverOverPad(state: GameState, i: number, vy: number, angle = 0): void {
  const pad = state.terrain.pads[i]!;
  const { l, p, v } = lander(state);
  p.x = pad.x;
  p.y = pad.y - LEG_DROP - 2;
  v.vx = 0;
  v.vy = vy;
  l.angle = angle;
}

describe('lander physics', () => {
  it('falls under gravity when idle', () => {
    const { state, tick } = harness();
    const { v } = lander(state);
    v.vx = 0;
    tick(60);
    expect(v.vy).toBeCloseTo(GRAVITY, 0);
  });

  it('thrust burns fuel and pushes along the hull axis', () => {
    const { held, state, tick } = harness();
    const { l, v } = lander(state);
    v.vx = 0;
    held.add('thrust');
    tick(30);
    expect(l.fuel).toBeLessThan(FUEL_MAX);
    expect(v.vy).toBeLessThan(0);
    expect(Math.abs(v.vx)).toBeLessThan(1e-9);
  });

  it('rotating then thrusting drifts sideways', () => {
    const { held, state, tick } = harness();
    const { v } = lander(state);
    v.vx = 0;
    held.add('right');
    tick(20);
    held.delete('right');
    held.add('thrust');
    tick(20);
    expect(v.vx).toBeGreaterThan(0);
  });

  it('an empty tank gives no thrust', () => {
    const { held, state, tick } = harness();
    const { l, v } = lander(state);
    l.fuel = 0;
    v.vx = 0;
    held.add('thrust');
    tick(30);
    expect(l.thrusting).toBe(false);
    expect(v.vy).toBeGreaterThan(0);
  });
});

describe('touchdown', () => {
  it('a gentle upright pad landing scores and refuels', () => {
    const { state, tick } = harness();
    const { l } = lander(state);
    l.fuel = 20;
    hoverOverPad(state, 0, 8);
    tick(20);
    expect(state.phase).toBe('landed');
    expect(state.score).toBeGreaterThan(0);
    expect(state.landings).toBe(1);
    expect(l.fuel).toBeGreaterThan(20);
    expect(getPos(state).y).toBeCloseTo(state.terrain.pads[0]!.y - LEG_DROP, 3);
  });

  it('a fast pad landing crashes and scores nothing', () => {
    const { state, tick } = harness();
    hoverOverPad(state, 0, 90);
    tick(20);
    expect(state.phase).toBe('crashed');
    expect(state.score).toBe(0);
    expect(state.message?.text).toMatch(/too fast/);
  });

  it('a tilted landing crashes for the angle', () => {
    const { state, tick } = harness();
    hoverOverPad(state, 0, 8, 0.6);
    tick(20);
    expect(state.phase).toBe('crashed');
    expect(state.message?.text).toMatch(/tilted/);
  });

  it('hitting bare terrain crashes for the missing pad', () => {
    const { state, tick } = harness();
    const { p, v } = lander(state);
    // Search for a spot at least 200 units from every pad.
    let x = 40;
    while (state.terrain.pads.some(pad => Math.abs(pad.x - x) < 200))
      x += 20;
    p.x = x;
    p.y = heightAt(state.terrain, x) - LEG_DROP - 2;
    v.vx = 0;
    v.vy = 5;
    tick(20);
    expect(state.phase).toBe('crashed');
    expect(state.message?.text).toMatch(/missed the pad/);
  });

  it('the hull settles upright after landing', () => {
    const { state, tick } = harness();
    hoverOverPad(state, 0, 8, 0.15);
    tick(90);
    expect(state.phase).toBe('landed');
    expect(Math.abs(getLander(state).angle)).toBeLessThan(0.01);
  });

  it('startLevel carries the given fuel and a fresh terrain', () => {
    const { state } = harness();
    const before = state.terrain;
    startLevel(state, state.seed + 1, 55);
    expect(getLander(state).fuel).toBe(55);
    expect(state.terrain).not.toBe(before);
    expect(state.phase).toBe('flying');
    expect(state.world.getStore(CameraDef).get(state.cameraId!)!.zoom).toBe(1);
  });
});
