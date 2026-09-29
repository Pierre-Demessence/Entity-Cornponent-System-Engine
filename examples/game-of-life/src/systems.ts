import type { EntityId, EventBus, Query, SchedulableSystem } from '@pierre/ecs';
import type { Lifetime } from '@pierre/ecs/modules/lifetime';
import type { Position } from '@pierre/ecs/modules/transform';

import type { Age, LifeWorld } from './defs';
import type { Rule } from './rules';

import { Scheduler } from '@pierre/ecs';
import { easeInQuad } from '@pierre/ecs/modules/easing';
import { LifetimeDef, makeLifetime, makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { wrap } from '@pierre/ecs/modules/math';
import { OpacityDef, RenderableDef } from '@pierre/ecs/modules/render-canvas2d';
import { fraction } from '@pierre/ecs/modules/timer';
import { PositionDef } from '@pierre/ecs/modules/transform';

import { AGE_CAP, AgeDef, BOARD_H, BOARD_W, CELL, CellTag, GHOST_GENS, GHOST_OPACITY, GHOST_RENDERABLE, GhostTag } from './defs';

export type LifeEvent
  = | { type: 'Extinct'; generation: number }
    | { type: 'Settled'; generation: number; period: number };

/** State that outlives a tick: the rule in force and the step bookkeeping. */
export interface Sim {
  generation: number;
  /** Order-independent hashes of the last few generations, newest last. */
  history: number[];
  rule: Rule;
  /** Set once `Settled` has fired for the current cycle, so it fires once. */
  settled: boolean;
  /** Leave a fading ghost where each cell dies. */
  trails: boolean;
}

/**
 * One generation per tick. `dtMs` is a nominal 1 so `modules/lifetime` counts
 * ghost lifetimes in generations.
 */
export interface SimCtx {
  dtMs: number;
  events: EventBus<LifeEvent>;
  sim: Sim;
  world: LifeWorld;
}

const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

// Scratch for the birth scan: a dead cell next to several live ones is visited once.
const seen = new Uint32Array(BOARD_W * BOARD_H);
let stamp = 0;

function liveNeighbours(world: LifeWorld, x: number, y: number): number {
  let n = 0;
  for (const [dx, dy] of NEIGHBOURS) {
    if (world.hasCellAt(wrap(x + dx, 0, BOARD_W), wrap(y + dy, 0, BOARD_H)))
      n++;
  }
  return n;
}

function mix(x: number, y: number): number {
  return Math.imul(x + 1, 0x9E3779B1) ^ Math.imul(y + 1, 0x85EBCA77);
}

/**
 * A dying cell stays on as its own ghost: it swaps the `cell` tag for `ghost`,
 * trades its age for a lifetime and an opacity, and `modules/lifetime`
 * destroys it later. Cheaper than a destroy plus a spawn, and the entity's
 * archetype is its state.
 */
function becomeGhost(world: LifeWorld, id: EntityId): void {
  world.getStore(RenderableDef).set(id, GHOST_RENDERABLE);
  world.queueRemoveTag(CellTag, id);
  world.queueRemove(AgeDef, id);
  world.queueAdd(LifetimeDef, id, makeLifetime(GHOST_GENS));
  world.queueAdd(OpacityDef, id, { value: GHOST_OPACITY });
  world.queueAddTag(GhostTag, id);
}

/**
 * The whole rule. Every decision reads the current generation through the
 * spatial index and only *queues* its change, so nothing moves until
 * `TickRunner` flushes after the tick: the command buffer is the double buffer
 * synchronous update needs.
 */
export function makeRulesSystem(): SchedulableSystem<SimCtx> {
  let liveCells: Query<[Position]>;
  return {
    name: 'rules',
    phase: 'simulate',
    reads: [PositionDef],
    init({ world }) {
      liveCells = world.query(PositionDef).withTag(world.getTag(CellTag));
    },
    run({ events, sim, world }) {
      stamp++;
      const cells = world.getTag(CellTag);
      const births: number[] = [];
      let deaths = 0;
      let hash = 0;

      for (const [id, pos] of liveCells) {
        hash = (hash + mix(pos.x, pos.y)) | 0;
        let n = 0;
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = wrap(pos.x + dx, 0, BOARD_W);
          const ny = wrap(pos.y + dy, 0, BOARD_H);
          if (world.hasCellAt(nx, ny)) {
            n++;
            continue;
          }
          const key = ny * BOARD_W + nx;
          if (seen[key] === stamp)
            continue;
          seen[key] = stamp;
          if (sim.rule.birth.has(liveNeighbours(world, nx, ny)))
            births.push(nx, ny);
        }
        if (!sim.rule.survive.has(n)) {
          deaths++;
          if (sim.trails)
            becomeGhost(world, id);
          else
            world.queueDestroy(id);
        }
      }
      for (let i = 0; i < births.length; i += 2)
        world.queueSpawn(CELL, { position: { x: births[i], y: births[i + 1] } });

      sim.generation++;
      const population = cells.size - deaths + births.length / 2;
      if (population === 0 && cells.size > 0)
        events.emit({ generation: sim.generation, type: 'Extinct' });

      // Still lifes repeat after one generation, blinkers and friends after two.
      const seenAt = sim.history.lastIndexOf(hash);
      const period = seenAt === -1 ? Infinity : sim.history.length - seenAt;
      sim.history.push(hash);
      if (sim.history.length > 2)
        sim.history.shift();
      if (period <= 2 && cells.size > 0) {
        if (!sim.settled)
          events.emit({ generation: sim.generation, period, type: 'Settled' });
        sim.settled = true;
      }
      else {
        sim.settled = false;
      }
    },
  };
}

/** Survivors grow older until `AGE_CAP`; a capped cell stops changing, so the recolour query skips it. */
export function makeAgingSystem(): SchedulableSystem<SimCtx> {
  let aged: Query<[Age]>;
  return {
    name: 'aging',
    phase: 'simulate',
    runAfter: ['rules'],
    writes: [AgeDef],
    init({ world }) {
      aged = world.query(AgeDef);
    },
    run({ world }) {
      const ages = world.getStore(AgeDef);
      for (const [id, age] of aged) {
        if (age.gens < AGE_CAP)
          ages.set(id, { gens: age.gens + 1 });
      }
    },
  };
}

/** Ghosts fade out over their lifetime. */
export function makeGhostFadeSystem(): SchedulableSystem<SimCtx> {
  let ghosts: Query<[Lifetime]>;
  return {
    name: 'ghost-fade',
    phase: 'fade',
    runAfter: ['lifetime'],
    init({ world }) {
      ghosts = world.query(LifetimeDef).withTag(world.getTag(GhostTag));
    },
    run({ world }) {
      const opacity = world.getStore(OpacityDef);
      for (const [id, life] of ghosts)
        opacity.set(id, { value: GHOST_OPACITY * (1 - easeInQuad(fraction(life))) });
    },
  };
}

export function makeScheduler(): Scheduler<SimCtx> {
  const lifetime = makeLifetimeSystem<SimCtx>();
  return new Scheduler<SimCtx>({ phases: ['simulate', 'fade'] })
    .add(makeRulesSystem())
    .add(makeAgingSystem())
    .add({ ...lifetime, phase: 'fade' })
    .add(makeGhostFadeSystem());
}
