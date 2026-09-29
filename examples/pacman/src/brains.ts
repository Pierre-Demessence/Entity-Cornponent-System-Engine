import type { FsmStates } from '@pierre/ecs/modules/fsm';

import type { GhostState, Mode } from './components';
import type { GameState, Phase } from './game';
import type { Vec } from './maze';

import { finished, restart } from '@pierre/ecs/modules/timer';

import { BrainDef, GhostDef, OpacityDef } from './components';
import {
  CLEAR_MS,
  DEATH_MS,
  placeActors,
  READY_MS,
  startLevel,
} from './game';
import { HOUSE_EXIT } from './maze';

/** Scripted routes through the ghost-house door; everything else follows the maze grid. */
export const EXIT_PATH: readonly Vec[] = [{ x: 13.5, y: 14 }, HOUSE_EXIT];
export const ENTER_PATH: readonly Vec[] = [{ x: 13.5, y: 11 }, { x: 13.5, y: 14 }];

/** The state a ghost settles into when it is neither leaving, fleeing nor eaten: the current scatter/chase mode. */
function roaming(g: GameState): GhostState {
  const a = g.active!;
  return g.frightActive && a.ghost.epoch !== g.epoch ? 'frightened' : g.modeFsm.current;
}

function shouldRelease(g: GameState): boolean {
  const a = g.active!;
  if (g.dotsLife >= a.ghost.dotLimit)
    return true;
  if (!finished(g.idle))
    return false;
  // Nobody has eaten a dot for a while: the first ghost still waiting goes.
  const brains = g.world.getStore(BrainDef);
  const first = g.ghostIds.find(id => brains.get(id)?.current === 'house');
  if (first !== a.id)
    return false;
  restart(g.idle);
  return true;
}

/** One roaming state, parameterised by which mode it stands for; the two differ only in the target they steer at. */
function roamState(mode: Mode): FsmStates<GameState, GhostState>[GhostState] {
  return {
    update(g) {
      const a = g.active!;
      if (g.frightActive && a.ghost.epoch !== g.epoch)
        return 'frightened';
      return g.modeFsm.current === mode ? null : g.modeFsm.current;
    },
  };
}

export const GHOST_STATES: FsmStates<GameState, GhostState> = {
  chase: roamState('chase'),
  scatter: roamState('scatter'),
  eaten: {
    onEnter(g) {
      const a = g.active!;
      a.ghost.eaten = false;
      g.world.getStore(OpacityDef).set(a.id, { value: 1 });
    },
    update(g) {
      const { pos } = g.active!;
      return pos.x === 13 && pos.y === 11 ? 'enter' : null;
    },
  },
  enter: {
    onEnter(g) {
      g.active!.ghost.waypoint = 0;
    },
    update(g) {
      return g.active!.ghost.waypoint >= ENTER_PATH.length ? 'exit' : null;
    },
  },
  exit: {
    onEnter(g) {
      g.active!.ghost.waypoint = 0;
    },
    update(g) {
      return g.active!.ghost.waypoint >= EXIT_PATH.length ? roaming(g) : null;
    },
  },
  frightened: {
    onEnter(g) {
      const { ghost } = g.active!;
      ghost.epoch = g.epoch;
      ghost.reverse = true;
    },
    update(g) {
      const a = g.active!;
      if (a.ghost.eaten)
        return 'eaten';
      return g.frightActive ? null : g.modeFsm.current;
    },
  },
  house: {
    update: g => (shouldRelease(g) ? 'exit' : null),
  },
};

/** The global scatter/chase clock: each state lasts its slot in the level's schedule, then flips and turns every roaming ghost around. */
export const MODE_STATES: FsmStates<GameState, Mode> = {
  chase: modeState('scatter'),
  scatter: modeState('chase'),
};

function modeState(next: Mode): FsmStates<GameState, Mode>[Mode] {
  return {
    onEnter(g) {
      for (const id of g.ghostIds) {
        const state = g.world.getStore(BrainDef).get(id)?.current;
        if (state === 'scatter' || state === 'chase')
          g.world.getStore(GhostDef).get(id)!.reverse = true;
      }
    },
    update(g, self) {
      if (self.elapsedMs < g.params.schedule[g.modeIndex]!)
        return null;
      g.modeIndex++;
      return next;
    },
  };
}

/** The game's own flow: ready → play → (dying → ready | over) or clear → ready of the next level. */
export const PHASE_STATES: FsmStates<GameState, Phase> = {
  over: { update: () => null },
  clear: {
    onEnter(g) {
      g.events.emit({ type: 'LevelCleared' });
      for (const id of g.ghostIds)
        g.world.getStore(OpacityDef).set(id, { value: 0 });
    },
    update(g, self) {
      if (self.elapsedMs < CLEAR_MS)
        return null;
      // The world is rebuilt between ticks, once every system has finished with it.
      g.transitions.replace(() => startLevel(g, g.level + 1));
      return 'ready';
    },
  },
  dying: {
    onEnter(g) {
      g.events.emit({ type: 'PacDied' });
      for (const id of g.ghostIds)
        g.world.getStore(OpacityDef).set(id, { value: 0 });
    },
    update(g, self) {
      if (self.elapsedMs < DEATH_MS)
        return null;
      g.lives--;
      if (g.lives <= 0) {
        g.events.emit({ type: 'GameOver' });
        return 'over';
      }
      return 'ready';
    },
  },
  play: {
    update(g) {
      if (g.pacDead)
        return 'dying';
      return g.pelletsLeft === 0 ? 'clear' : null;
    },
  },
  ready: {
    update: (_g, self) => (self.elapsedMs >= READY_MS ? 'play' : null),
    onEnter(g) {
      if (g.pacDead)
        placeActors(g);
    },
  },
};
