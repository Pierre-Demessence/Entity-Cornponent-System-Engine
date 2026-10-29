import { describe, expect, it } from 'vitest';

import { makeSeededRng } from '../rng';
import { mctsSearch } from './mcts';
import {
  extraTurnGame,
  loopGame,
  nimGame,
  threePlayerGame,
  ticTacToe,
  ticTacToeGame,
} from './test-games';

const empty = ticTacToe('.........');
const seeded = (seed: number) => ({ iterations: 2000, random: makeSeededRng(seed) });

describe('mctsSearch: choosing moves', () => {
  it('takes a win in one move', () => {
    for (let seed = 1; seed <= 5; seed++)
      expect(mctsSearch(ticTacToeGame, ticTacToe('XX.OO....'), seeded(seed)).move).toBe(2);
  });

  it('blocks a one-move threat', () => {
    for (let seed = 1; seed <= 5; seed++)
      expect(mctsSearch(ticTacToeGame, ticTacToe('X..OO.X..'), seeded(seed)).move).toBe(5);
  });

  it('reports a winning move as a high mean result', () => {
    const result = mctsSearch(ticTacToeGame, ticTacToe('XX.OO....'), seeded(1));
    expect(result.value).toBeGreaterThan(0.9);
    expect(result.visits).toBeGreaterThan(result.iterations / 2);
  });

  it('plays the winning Nim move', () => {
    // Pile 6: taking 2 leaves 4, a multiple of 4, which loses for the opponent.
    expect(mctsSearch(nimGame, { pile: 6, player: 0 }, seeded(3)).move).toBe(2);
  });
});

describe('mctsSearch: turn order', () => {
  it('credits an extra turn to the player who keeps moving', () => {
    const result = mctsSearch(extraTurnGame, { step: 0 }, seeded(1));
    expect(result.move).toBe('gamble');
    expect(result.value).toBeGreaterThan(0.5);
  });

  it('credits each move to the player who made it, with three players', () => {
    // Player 1 answers 'x' with 'a', which also wins for player 0; an
    // "everyone is against me" search would pick 'y' instead.
    for (let seed = 1; seed <= 5; seed++)
      expect(mctsSearch(threePlayerGame, { path: [] }, seeded(seed)).move).toBe('x');
  });
});

describe('mctsSearch: budgets', () => {
  it('runs 1 000 iterations by default', () => {
    expect(mctsSearch(ticTacToeGame, empty, { random: makeSeededRng(1) }).iterations).toBe(1000);
  });

  it('runs exactly the iterations asked for', () => {
    expect(mctsSearch(ticTacToeGame, empty, { iterations: 37, random: makeSeededRng(1) }).iterations).toBe(37);
  });

  it('runs one iteration even when asked for none, and still returns a legal move', () => {
    const result = mctsSearch(ticTacToeGame, empty, { iterations: 0, random: makeSeededRng(1) });
    expect(result.iterations).toBe(1);
    expect(result.move).toBeDefined();
  });

  it('stops when the injected clock passes timeMs', () => {
    let time = 0;
    const result = mctsSearch(ticTacToeGame, empty, {
      random: makeSeededRng(1),
      timeMs: 25,
      now: () => {
        time += 10;
        return time;
      },
    });
    expect(result.iterations).toBe(3);
  });

  it('stops at iterations when that comes before timeMs', () => {
    const result = mctsSearch(ticTacToeGame, empty, { iterations: 5, random: makeSeededRng(1), timeMs: 1000, now: () => 0 });
    expect(result.iterations).toBe(5);
  });
});

describe('mctsSearch: playouts', () => {
  it('cuts a playout of a game that never ends at maxRolloutDepth', () => {
    let calls = 0;
    const result = mctsSearch(loopGame, { player: 0 }, {
      iterations: 10,
      maxRolloutDepth: 3,
      random: makeSeededRng(1),
      rollout: (_state, random) => {
        calls++;
        return random() < 0.5 ? 'a' : 'b';
      },
    });
    expect(result.iterations).toBe(10);
    expect(calls).toBe(30);
  });

  it('scores a cut playout as a draw without evaluate', () => {
    // `outcome` would say a win; it must not be asked about a cut position.
    const winningLoop = { ...loopGame, outcome: () => 1 };
    const result = mctsSearch(winningLoop, { player: 0 }, { iterations: 50, maxRolloutDepth: 4, random: makeSeededRng(1) });
    expect(result.value).toBe(0);
  });

  it('scores a cut playout with evaluate, from each mover\'s side', () => {
    const favourPlayerZero = (_state: { player: number }, player: number) => (player === 0 ? 1 : -1);
    const result = mctsSearch(loopGame, { player: 0 }, { evaluate: favourPlayerZero, iterations: 50, maxRolloutDepth: 4, random: makeSeededRng(1) });
    expect(result.value).toBe(1);
  });

  it('clamps an evaluate result to the range -1 to 1', () => {
    const result = mctsSearch(loopGame, { player: 0 }, { iterations: 50, maxRolloutDepth: 4, random: makeSeededRng(1), evaluate: () => 50 });
    expect(result.value).toBe(1);
  });

  it('plays the rollout policy it is given', () => {
    // One iteration expands one random move, then the playout only plays the policy's moves.
    const played: number[] = [];
    const recording = {
      ...nimGame,
      apply: (...args: Parameters<typeof nimGame.apply>) => {
        played.push(args[1]);
        return nimGame.apply(...args);
      },
    };
    mctsSearch(recording, { pile: 20, player: 0 }, {
      iterations: 1,
      random: makeSeededRng(1),
      rollout: state => Math.min(3, state.pile),
    });
    expect(played.length).toBeGreaterThan(3);
    expect(played.slice(1).every((take, index) => take === Math.min(3, 20 - played[0]! - 3 * index))).toBe(true);
  });
});

describe('mctsSearch: edge cases', () => {
  it('returns no move for a final state', () => {
    const result = mctsSearch(nimGame, { pile: 0, player: 0 });
    expect(result).toEqual({ iterations: 0, move: undefined, value: 0, visits: 0 });
  });

  it('returns the only move without searching', () => {
    const result = mctsSearch(nimGame, { pile: 1, player: 0 });
    expect(result.move).toBe(1);
    expect(result.iterations).toBe(0);
  });

  it('does not change the state it is given', () => {
    const state = ticTacToe('XO.......');
    const before = structuredClone(state);
    mctsSearch(ticTacToeGame, state, seeded(1));
    expect(state).toEqual(before);
  });
});

describe('mctsSearch: random', () => {
  it('repeats the same result for the same seed', () => {
    const run = () => mctsSearch(ticTacToeGame, empty, { iterations: 300, random: makeSeededRng(42) });
    expect(run()).toEqual(run());
  });

  it('varies the choice among similar moves across seeds', () => {
    const moves = new Set<number | undefined>();
    for (let seed = 1; seed <= 20; seed++)
      moves.add(mctsSearch(ticTacToeGame, empty, { iterations: 100, random: makeSeededRng(seed) }).move);
    expect(moves.size).toBeGreaterThan(1);
  });
});

describe('mctsSearch: option validation', () => {
  it.each(['iterations', 'timeMs', 'maxRolloutDepth', 'exploration'] as const)('throws on a negative or NaN %s', (name) => {
    expect(() => mctsSearch(ticTacToeGame, empty, { [name]: -1 })).toThrow(name);
    expect(() => mctsSearch(ticTacToeGame, empty, { [name]: Number.NaN })).toThrow(name);
  });

  it('accepts an exploration of 0', () => {
    expect(mctsSearch(ticTacToeGame, empty, { exploration: 0, iterations: 50, random: makeSeededRng(1) }).move).toBeDefined();
  });
});
