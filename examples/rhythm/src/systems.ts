import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState, Judgement, Lane } from './game';

import {
  APPROACH_S,
  BEAT_S,
  chartNote,
  CULL_S,
  NoteDef,
  spawnNote,
  WINDOW,
} from './game';

/**
 * Keeps the chart feeding the world. Spawns any note whose `targetTime`
 * is within `APPROACH_S + BEAT_S` of the current audio time. Also queues
 * metronome clicks a short way ahead of the audio clock.
 */
export const spawnSystem: SchedulableSystem<GameState> = {
  name: 'spawn',
  run(ctx) {
    const horizon = ctx.audioTimeS + APPROACH_S + BEAT_S;
    while (true) {
      const next = chartNote(ctx.notesSpawned);
      if (next.targetTimeS > horizon)
        break;
      spawnNote(ctx, ctx.notesSpawned);
      ctx.notesSpawned += 1;
    }

    // Schedule click track up to ~0.5 s ahead of the audio clock.
    const clickHorizon = ctx.audioTimeS + 0.5;
    while (ctx.scheduledClickUntilS < clickHorizon) {
      const beatIndex = Math.round(ctx.scheduledClickUntilS / BEAT_S);
      const t = beatIndex * BEAT_S;
      if (t >= ctx.scheduledClickUntilS) {
        const accent = beatIndex % 4 === 0;
        ctx.audio.scheduleClick(t, accent);
      }
      ctx.scheduledClickUntilS += BEAT_S;
    }
  },
};

function judge(absOffsetS: number): Judgement | null {
  if (absOffsetS <= WINDOW.perfect)
    return 'perfect';
  if (absOffsetS <= WINDOW.good)
    return 'good';
  if (absOffsetS <= WINDOW.ok)
    return 'ok';
  return null;
}

/**
 * Drains the press queue. For each press, finds the closest unhit note
 * in the same lane and judges the timing against `audioCtx.currentTime`
 * (already stamped on the press). Ghost presses (outside any window)
 * are silently discarded.
 */
export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  runAfter: ['spawn'],
  run(ctx) {
    const store = ctx.world.getStore(NoteDef);
    while (ctx.pressQueue.length > 0) {
      const press = ctx.pressQueue.shift()!;
      let bestId = -1;
      let bestAbs = Infinity;
      let bestOffset = 0;
      for (const [id, note] of store.entries()) {
        if (note.hit !== 0 || note.lane !== press.lane)
          continue;
        const offset = press.timeS - note.targetTimeS;
        const abs = Math.abs(offset);
        if (abs > WINDOW.ok)
          continue;
        if (abs < bestAbs) {
          bestAbs = abs;
          bestId = id;
          bestOffset = offset;
        }
      }
      if (bestId < 0)
        continue;
      const hitKind = judge(bestAbs);
      if (!hitKind)
        continue;
      const note = store.get(bestId)!;
      store.set(bestId, { ...note, hit: 1 });
      ctx.scores[hitKind] += 1;
      ctx.audio.playHitBlip();
      ctx.events.emit({
        hit: hitKind,
        lane: press.lane as Lane,
        offsetMs: bestOffset * 1000,
        type: 'NoteJudged',
      });
    }
  },
};

/**
 * Removes notes that have passed the hit line. Any un-hit note whose
 * target is more than `WINDOW.ok` in the past counts as a miss exactly
 * once; visible cull happens `CULL_S` after the hit line so the note
 * can linger briefly to show the miss.
 */
export const cullSystem: SchedulableSystem<GameState> = {
  name: 'cull',
  runAfter: ['input'],
  run(ctx) {
    const store = ctx.world.getStore(NoteDef);
    for (const [id, note] of store.entries()) {
      const dt = ctx.audioTimeS - note.targetTimeS;
      if (note.hit === 0 && dt > WINDOW.ok) {
        store.set(id, { ...note, hit: 2 });
        ctx.scores.miss += 1;
        ctx.events.emit({
          hit: 'miss',
          lane: note.lane as Lane,
          offsetMs: dt * 1000,
          type: 'NoteJudged',
        });
      }
      if (dt > CULL_S)
        ctx.world.queueDestroy(id);
    }
  },
};
