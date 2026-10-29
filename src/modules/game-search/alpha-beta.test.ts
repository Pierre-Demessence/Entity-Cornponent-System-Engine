import type { TicTacToeState } from './test-games';

import { describe, expect, it } from 'vitest';

import { makeSeededRng } from '../rng';
import { alphaBetaSearch, WIN_SCORE } from './alpha-beta';
import {
  extraTurnGame,
  loopGame,
  nimGame,
  raceGame,
  raceStart,
  threePlayerGame,
  ticTacToe,
  ticTacToeEvaluate,
  ticTacToeGame,
  ticTacToeKey,
  ticTacToeWinner,
} from './test-games';

const zero = () => 0;
const empty = ticTacToe('.........');

describe('alphaBetaSearch: solving a game', () => {
  it('finds the empty tic-tac-toe board is a draw and says the search is complete', () => {
    const result = alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero });
    expect(result.score).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.move).toBeDefined();
  });

  it('never loses tic-tac-toe against any reply', () => {
    const options = { evaluate: zero, key: ticTacToeKey };
    const visit = (state: TicTacToeState): void => {
      const moves = ticTacToeGame.moves(state);
      if (moves.length === 0) {
        expect(ticTacToeWinner(state.cells)).not.toBe(1);
        return;
      }
      if (state.player === 0)
        visit(ticTacToeGame.apply(state, alphaBetaSearch(ticTacToeGame, state, options).move!));
      else
        moves.forEach(move => visit(ticTacToeGame.apply(state, move)));
    };
    visit(empty);
  });

  it('plays a win in one move, with the score of a win after one move', () => {
    const result = alphaBetaSearch(ticTacToeGame, ticTacToe('XX.OO....'), { evaluate: zero });
    expect(result.move).toBe(2);
    expect(result.score).toBe(WIN_SCORE - 1);
  });

  it('blocks a one-move threat', () => {
    const state = ticTacToe('X..OO.X..');
    expect(alphaBetaSearch(ticTacToeGame, state, { evaluate: zero }).move).toBe(5);
    expect(alphaBetaSearch(ticTacToeGame, state, { evaluate: zero, maxDepth: 2 }).move).toBe(5);
  });

  it('ranks a faster forced win above a slower one', () => {
    // Pile 5: take 1 wins on the third move, whatever the opponent does.
    const result = alphaBetaSearch(nimGame, { pile: 5, player: 0 }, { evaluate: zero });
    expect(result.move).toBe(1);
    expect(result.score).toBe(WIN_SCORE - 3);
    expect(result.complete).toBe(true);
  });

  it('picks the faster of two forced wins even when it is listed second', () => {
    const result = alphaBetaSearch(raceGame(1, ['long', 'quick']), raceStart, { evaluate: zero });
    expect(result.move).toBe('quick');
    expect(result.score).toBe(WIN_SCORE - 1);
  });

  it('picks the slower of two forced losses even when it is listed second', () => {
    const result = alphaBetaSearch(raceGame(-1, ['quick', 'long']), raceStart, { evaluate: zero });
    expect(result.move).toBe('long');
    expect(result.score).toBe(-(WIN_SCORE - 3));
  });

  it('reports a forced loss with a negative score', () => {
    const result = alphaBetaSearch(nimGame, { pile: 4, player: 0 }, { evaluate: zero });
    expect(result.score).toBeLessThan(-WIN_SCORE / 2);
  });
});

describe('alphaBetaSearch: budgets', () => {
  it('stops at maxDepth and returns the best move of that depth', () => {
    const result = alphaBetaSearch(ticTacToeGame, empty, { evaluate: ticTacToeEvaluate, maxDepth: 3 });
    expect(result.depth).toBe(3);
    expect(result.complete).toBe(false);
  });

  it('always finishes depth 1, even with maxDepth 0 or no nodes', () => {
    const noDepth = alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, maxDepth: 0 });
    const noNodes = alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, maxNodes: 0 });
    expect(noDepth.depth).toBe(1);
    expect(noNodes.depth).toBe(1);
    expect(noNodes.move).toBeDefined();
  });

  it('returns the last finished depth when maxNodes runs out mid-round', () => {
    const result = alphaBetaSearch(ticTacToeGame, empty, { evaluate: ticTacToeEvaluate, maxNodes: 20 });
    expect(result.depth).toBe(1);
    expect(result.nodes).toBeLessThanOrEqual(20);
    const depthOne = alphaBetaSearch(ticTacToeGame, empty, { evaluate: ticTacToeEvaluate, maxDepth: 1 });
    expect(result.move).toBe(depthOne.move);
  });

  it('stops when the injected clock passes timeMs', () => {
    let time = 0;
    const result = alphaBetaSearch(ticTacToeGame, empty, {
      evaluate: ticTacToeEvaluate,
      timeMs: 5,
      now: () => {
        time += 10;
        return time;
      },
    });
    expect(result.depth).toBe(1);
    expect(result.complete).toBe(false);
  });

  it('checks the clock every 1024 moves inside a round', () => {
    let applied = 0;
    const counting = {
      ...ticTacToeGame,
      apply: (...args: Parameters<typeof ticTacToeGame.apply>) => {
        applied++;
        return ticTacToeGame.apply(...args);
      },
    };
    const result = alphaBetaSearch(counting, empty, {
      evaluate: ticTacToeEvaluate,
      timeMs: 50,
      now: () => (applied >= 1024 ? 100 : 0),
    });
    expect(result.complete).toBe(false);
    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(result.nodes).toBe(1024);
  });

  it('searches to the end when the clock never advances', () => {
    const result = alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, now: zero, timeMs: 1000 });
    expect(result.complete).toBe(true);
  });
});

describe('alphaBetaSearch: transposition table', () => {
  it('gives the same score with fewer nodes', () => {
    const plain = alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero });
    const keyed = alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, key: ticTacToeKey });
    expect(keyed.score).toBe(plain.score);
    expect(keyed.nodes).toBeLessThan(plain.nodes);
  });

  it('keeps full-depth scores exact on positions with a heuristic evaluation', () => {
    for (const board of ['X........', 'XO.......', 'X...O....', 'XO..X....', '.X..O...X']) {
      const state = ticTacToe(board);
      const plain = alphaBetaSearch(ticTacToeGame, state, { evaluate: ticTacToeEvaluate });
      const keyed = alphaBetaSearch(ticTacToeGame, state, { evaluate: ticTacToeEvaluate, key: ticTacToeKey });
      expect(keyed.score).toBe(plain.score);
    }
  });

  it('keeps forced-win distances right through the table', () => {
    const state = { pile: 9, player: 0 };
    const plain = alphaBetaSearch(nimGame, state, { evaluate: zero });
    const keyed = alphaBetaSearch(nimGame, state, { evaluate: zero, key: s => `${s.pile},${s.player}` });
    expect(keyed.score).toBe(plain.score);
    expect(keyed.move).toBe(plain.move);
  });

  it('still searches when the table is tiny', () => {
    const result = alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, key: ticTacToeKey, maxTableEntries: 3 });
    expect(result.score).toBe(0);
  });
});

describe('alphaBetaSearch: turn order', () => {
  it('scores an extra turn from the same player\'s side', () => {
    const result = alphaBetaSearch(extraTurnGame, { step: 0 }, { evaluate: zero });
    expect(result.move).toBe('gamble');
    expect(result.score).toBe(WIN_SCORE - 2);
  });

  it('assumes every other player plays against the root player', () => {
    const result = alphaBetaSearch(threePlayerGame, { path: [] }, { evaluate: zero });
    expect(result.move).toBe('y');
  });

  it('searches a game that never ends down to maxDepth', () => {
    const result = alphaBetaSearch(loopGame, { player: 0 }, { evaluate: zero, maxDepth: 5 });
    expect(result.depth).toBe(5);
    expect(result.complete).toBe(false);
  });
});

describe('alphaBetaSearch: edge cases', () => {
  it('returns no move for a final state', () => {
    const result = alphaBetaSearch(nimGame, { pile: 0, player: 0 }, { evaluate: zero });
    expect(result.move).toBeUndefined();
    expect(result.nodes).toBe(0);
  });

  it('returns the only move without searching', () => {
    const result = alphaBetaSearch(nimGame, { pile: 1, player: 0 }, { evaluate: zero });
    expect(result.move).toBe(1);
    expect(result.nodes).toBe(0);
  });
});

describe('alphaBetaSearch: random', () => {
  it('repeats the same move for the same seed', () => {
    const run = () => alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, maxNodes: 500, random: makeSeededRng(42) });
    expect(run()).toEqual(run());
  });

  it('varies the choice among equally good moves across seeds', () => {
    const moves = new Set<number | undefined>();
    for (let seed = 1; seed <= 20; seed++)
      moves.add(alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, maxDepth: 1, random: makeSeededRng(seed) }).move);
    expect(moves.size).toBeGreaterThan(1);
  });

  it('takes the first listed of equal moves without a rng', () => {
    expect(alphaBetaSearch(ticTacToeGame, empty, { evaluate: zero, maxDepth: 1 }).move).toBe(0);
  });
});

describe('alphaBetaSearch: option validation', () => {
  it.each(['maxDepth', 'maxNodes', 'maxTableEntries', 'timeMs'] as const)('throws on a negative or NaN %s', (name) => {
    expect(() => alphaBetaSearch(ticTacToeGame, empty, { [name]: -1, evaluate: zero })).toThrow(name);
    expect(() => alphaBetaSearch(ticTacToeGame, empty, { [name]: Number.NaN, evaluate: zero })).toThrow(name);
  });
});
