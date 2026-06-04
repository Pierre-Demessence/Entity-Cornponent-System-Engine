import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { Facing, GameState } from './game';

import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';

import {
  ObstacleDef,
  ObstacleTag,
  ParticleDef,
  ParticleTag,
  PositionDef,
  RenderableDef,
  SizeDef,
  VelocityDef,
} from './components';
import {
  FROG,
  GOAL_ROW,
  handleGoalLanding,
  killFrog,
  laneKindOf,
  resetGame,
  respawnFrog,
  SCORE_FORWARD,
  SCREEN_W,
  setFrogRow,
  START_ROW,
  TILE,
  TURTLE_FILL,
  TURTLE_FILL_SUBMERGED,
} from './game';

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

function boxOf(state: GameState, id: EntityId): Box {
  const pos = state.world.getStore(PositionDef).get(id)!;
  const size = state.world.getStore(SizeDef).get(id)!;
  return { h: size.h, w: size.w, x: pos.x, y: pos.y };
}

/** Apply a single hop. Vertical hops snap rows; the goal row is special-cased. */
function hop(ctx: GameState, dir: Facing): void {
  ctx.started = true;
  ctx.facing = dir;
  if (dir === 'up') {
    const newRow = ctx.frogRow - 1;
    if (newRow === GOAL_ROW) {
      setFrogRow(ctx, GOAL_ROW);
      handleGoalLanding(ctx);
      return;
    }
    setFrogRow(ctx, newRow);
    if (newRow < ctx.furthestRow) {
      ctx.score += SCORE_FORWARD;
      ctx.furthestRow = newRow;
    }
    return;
  }
  if (dir === 'down') {
    setFrogRow(ctx, Math.min(START_ROW, ctx.frogRow + 1));
    return;
  }
  const pos = ctx.world.getStore(PositionDef).get(ctx.frogId!)!;
  pos.x += dir === 'left' ? -TILE : TILE;
  pos.x = Math.max(0, Math.min(SCREEN_W - FROG, pos.x));
}

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.levelFlashMs > 0)
      ctx.levelFlashMs -= ctx.dtMs;

    if (ctx.dying) {
      ctx.deathTimerMs -= ctx.dtMs;
      if (ctx.deathTimerMs <= 0) {
        if (ctx.lives <= 0) {
          ctx.dying = false;
          ctx.dead = true;
          ctx.best = Math.max(ctx.best, ctx.score);
        }
        else {
          respawnFrog(ctx);
        }
      }
      return;
    }

    if (ctx.dead) {
      if (ctx.input.justPressed('reset'))
        resetGame(ctx);
      ctx.pendingHop = null;
      return;
    }

    let dir: Facing | null = null;
    if (ctx.input.justPressed('up'))
      dir = 'up';
    else if (ctx.input.justPressed('down'))
      dir = 'down';
    else if (ctx.input.justPressed('left'))
      dir = 'left';
    else if (ctx.input.justPressed('right'))
      dir = 'right';
    else if (ctx.pendingHop != null)
      dir = ctx.pendingHop;

    ctx.pendingHop = null;
    if (dir != null)
      hop(ctx, dir);
  },
};

export const motionSystem = makeVelocityIntegrationSystem<GameState>({
  name: 'motion',
  runAfter: ['input'],
});

/** Recycle lane traffic by ±span once it fully leaves the screen edge. */
export const wrapSystem: SchedulableSystem<GameState> = {
  name: 'wrap',
  runAfter: ['motion'],
  run(ctx) {
    const posStore = ctx.world.getStore(PositionDef);
    const sizeStore = ctx.world.getStore(SizeDef);
    const obStore = ctx.world.getStore(ObstacleDef);
    const velStore = ctx.world.getStore(VelocityDef);
    for (const id of ctx.world.getTag(ObstacleTag)) {
      const pos = posStore.get(id)!;
      const ob = obStore.get(id)!;
      const vx = velStore.get(id)!.vx;
      const w = sizeStore.get(id)!.w;
      if (vx > 0 && pos.x > SCREEN_W)
        pos.x -= ob.span;
      else if (vx < 0 && pos.x + w < 0)
        pos.x += ob.span;
    }
  },
};

const DIVE_CYCLE_MS = 3600;
const SUBMERGE_MS = 1000;

/** Cycle diving turtles between floating and submerged (no carry support). */
export const diveSystem: SchedulableSystem<GameState> = {
  name: 'dive',
  runAfter: ['motion'],
  run(ctx) {
    const obStore = ctx.world.getStore(ObstacleDef);
    const renderStore = ctx.world.getStore(RenderableDef);
    for (const id of ctx.world.getTag(ObstacleTag)) {
      const ob = obStore.get(id)!;
      if (!ob.diving)
        continue;
      ob.diveTimerMs = (ob.diveTimerMs + ctx.dtMs) % DIVE_CYCLE_MS;
      const submerged = ob.diveTimerMs >= DIVE_CYCLE_MS - SUBMERGE_MS;
      if (submerged !== ob.submerged) {
        ob.submerged = submerged;
        const r = renderStore.get(id);
        if (r && r.kind === 'rect')
          r.fill = submerged ? TURTLE_FILL_SUBMERGED : TURTLE_FILL;
      }
    }
  },
};

/** Front-tile death zone of a crocodile, on whichever side leads its motion. */
function inCrocMouth(cx: number, x: number, w: number, vx: number): boolean {
  return vx > 0 ? cx >= x + w - TILE : cx <= x + TILE;
}

/**
 * The heart of the game: decide what the frog's current tile does to it.
 * Roads squash, water drowns unless a platform carries the frog, crocodile
 * mouths and a carried-off-screen ride are fatal.
 */
export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  runAfter: ['wrap', 'dive'],
  run(ctx) {
    if (ctx.dying || ctx.dead || ctx.frogId == null)
      return;
    const row = ctx.frogRow;
    const lane = laneKindOf(row);
    if (lane !== 'road' && lane !== 'water')
      return;

    const frog = boxOf(ctx, ctx.frogId);
    const cx = frog.x + FROG / 2;
    const obStore = ctx.world.getStore(ObstacleDef);

    if (lane === 'road') {
      for (const id of ctx.world.getTag(ObstacleTag)) {
        const ob = obStore.get(id)!;
        if (ob.row !== row)
          continue;
        if (overlaps(frog, boxOf(ctx, id))) {
          killFrog(ctx, 'squash');
          return;
        }
      }
      return;
    }

    let support: EntityId | null = null;
    let eaten = false;
    for (const id of ctx.world.getTag(ObstacleTag)) {
      const ob = obStore.get(id)!;
      if (ob.row !== row || ob.submerged)
        continue;
      const box = boxOf(ctx, id);
      if (cx < box.x || cx > box.x + box.w)
        continue;
      const vx = ctx.world.getStore(VelocityDef).get(id)!.vx;
      if (ob.kind === 'croc' && inCrocMouth(cx, box.x, box.w, vx))
        eaten = true;
      else
        support = id;
    }

    if (eaten) {
      killFrog(ctx, 'eaten');
      return;
    }
    if (support == null) {
      killFrog(ctx, 'drown');
      return;
    }

    const vx = ctx.world.getStore(VelocityDef).get(support)!.vx;
    const pos = ctx.world.getStore(PositionDef).get(ctx.frogId)!;
    pos.x += vx * (ctx.dtMs / 1000);
    const ncx = pos.x + FROG / 2;
    if (ncx < 0 || ncx > SCREEN_W)
      killFrog(ctx, 'offscreen');
  },
};

/** Age particles and despawn them once their lifetime elapses. */
export const particleSystem: SchedulableSystem<GameState> = {
  name: 'particle',
  runAfter: ['motion'],
  run(ctx) {
    const store = ctx.world.getStore(ParticleDef);
    for (const id of ctx.world.getTag(ParticleTag)) {
      const p = store.get(id)!;
      p.ageMs += ctx.dtMs;
      if (p.ageMs >= p.lifeMs)
        ctx.world.queueDestroy(id);
    }
  },
};
