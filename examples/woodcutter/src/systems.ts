import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState, Worker } from './game';

import { plan } from '@pierre/ecs/modules/goap';

import { buildActions, buildFacts, GOAL, RUNTIME } from './actions';
import { workerPos } from './game';

/**
 * The plan-runner: for each worker, (re)plan when idle, execute the
 * current action, and replan on failure. Replanning is game-side — GOAP
 * itself is just the pure `plan()` call over facts derived from reality.
 *
 * Two GOAP moments show here: after the first log a worker keeps its axe,
 * so the planner drops `GetAxe`; and because `ChopTree{i}` requires
 * `tree{i}Free`, workers plan toward free trees and **replan** if a tree
 * gets taken before they start chopping.
 */
export const workerSystem: SchedulableSystem<GameState> = {
  name: 'worker',
  run(ctx) {
    for (const w of ctx.workers) {
      ctx.activeWorker = w;
      runWorker(ctx, w);
      ctx.activeWorker = null;
    }
  },
};

function runWorker(ctx: GameState, w: Worker): void {
  if (!w.plan || w.planIndex >= w.plan.length) {
    releaseReservation(ctx, w);
    w.plan = plan(buildActions(workerPos(ctx, w)), buildFacts(ctx, w), GOAL);
    w.planIndex = 0;
    w.planLabel = w.plan ? w.plan.map(a => a.name).join(' ▸ ') : '(waiting for a free tree)';
  }
  if (!w.plan || w.plan.length === 0)
    return;

  const step = w.plan[w.planIndex];
  const status = RUNTIME[step.name](ctx);
  if (status === 'success') {
    w.planIndex++;
  }
  else if (status === 'failure') {
    releaseReservation(ctx, w);
    w.plan = null; // replan next tick from the updated world
  }
}

function releaseReservation(ctx: GameState, w: Worker): void {
  if (w.reservedTree !== null) {
    if (ctx.treeOccupant[w.reservedTree] === w.id)
      ctx.treeOccupant[w.reservedTree] = null;
    w.reservedTree = null;
  }
}
