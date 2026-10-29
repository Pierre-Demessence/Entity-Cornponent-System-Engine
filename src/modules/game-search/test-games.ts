import type { SearchGame } from './game';

/** Rule fixtures shared by the search tests; not part of the public surface. */

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export interface TicTacToeState {
  /** `-1` empty, otherwise the player (0 = X, 1 = O) who marked it. */
  cells: number[];
  player: number;
}

export function ticTacToeWinner(cells: readonly number[]): number {
  for (const [a, b, c] of LINES) {
    const mark = cells[a!]!;
    if (mark !== -1 && mark === cells[b!] && mark === cells[c!])
      return mark;
  }
  return -1;
}

/** A position from nine characters of `X`, `O` and `.`; whoever has fewer marks moves. */
export function ticTacToe(board: string): TicTacToeState {
  const cells = [...board].map(ch => (ch === 'X' ? 0 : ch === 'O' ? 1 : -1));
  const x = cells.filter(cell => cell === 0).length;
  const o = cells.filter(cell => cell === 1).length;
  return { cells, player: x > o ? 1 : 0 };
}

export const ticTacToeGame: SearchGame<TicTacToeState, number> = {
  currentPlayer: state => state.player,
  apply: (state, move) => {
    const cells = [...state.cells];
    cells[move] = state.player;
    return { cells, player: 1 - state.player };
  },
  moves: (state) => {
    if (ticTacToeWinner(state.cells) !== -1)
      return [];
    const open: number[] = [];
    state.cells.forEach((cell, index) => {
      if (cell === -1)
        open.push(index);
    });
    return open;
  },
  outcome: (state, player) => {
    const winner = ticTacToeWinner(state.cells);
    return winner === -1 ? 0 : winner === player ? 1 : -1;
  },
};

export function ticTacToeKey(state: TicTacToeState): string {
  return state.cells.join(',');
}

/** Counts the open lines each side could still complete, from `player`'s side. */
export function ticTacToeEvaluate(state: TicTacToeState, player: number): number {
  let score = 0;
  for (const line of LINES) {
    const marks = line.map(index => state.cells[index]!);
    const mine = marks.filter(mark => mark === player).length;
    const theirs = marks.filter(mark => mark === 1 - player).length;
    if (theirs === 0)
      score += mine;
    else if (mine === 0)
      score -= theirs;
  }
  return score;
}

export interface NimState {
  pile: number;
  /** The player to move. */
  player: number;
}

/** Take 1 to 3 from a pile; whoever takes the last one wins. */
export const nimGame: SearchGame<NimState, number> = {
  apply: (state, take) => ({ pile: state.pile - take, player: 1 - state.player }),
  currentPlayer: state => state.player,
  moves: state => [1, 2, 3].filter(take => take <= state.pile),
  outcome: (state, player) => (player === state.player ? -1 : 1),
};

export interface BonusState {
  /** Result for player 0 once the game is over. */
  result?: number;
  step: number;
}

/**
 * Player 0 either takes a safe draw or gambles, which leaves player 0 to move
 * again (an extra turn) to pick a win or a loss.
 */
export const extraTurnGame: SearchGame<BonusState, string> = {
  currentPlayer: () => 0,
  moves: state => (state.result !== undefined ? [] : state.step === 0 ? ['gamble', 'safe'] : ['win', 'lose']),
  outcome: (state, player) => (player === 0 ? state.result! : -state.result!),
  apply: (_state, move) => {
    switch (move) {
      case 'gamble': return { step: 1 };
      case 'lose': return { result: -1, step: 2 };
      case 'safe': return { result: 0, step: 2 };
      default: return { result: 1, step: 2 };
    }
  },
};

export interface RoundState {
  /** Moves made so far: player 0's, player 1's, player 2's. */
  path: string[];
}

/** Final results per player, keyed by player 0's and player 1's picks. */
const ROUND_RESULTS: Record<string, readonly [number, number, number]> = {
  'x,a': [1, 1, -1],
  'x,b': [-1, 0, 0],
  'y,a': [0, 0, 0],
  'y,b': [0, 0, 0],
};

/**
 * Three players pick once each, in turn. Player 1 does best for itself with
 * `a` after `x`, which also gives player 0 a win, so a search that credits
 * each move to its own player picks `x`; one that assumes everyone plays
 * against player 0 picks `y`.
 */
export const threePlayerGame: SearchGame<RoundState, string> = {
  apply: (state, move) => ({ path: [...state.path, move] }),
  currentPlayer: state => state.path.length,
  moves: state => (state.path.length === 0 ? ['x', 'y'] : state.path.length === 1 ? ['a', 'b'] : state.path.length === 2 ? ['k', 'l'] : []),
  outcome: (state, player) => ROUND_RESULTS[state.path.slice(0, 2).join(',')]![player]!,
};

export interface LoopState {
  player: number;
}

/** Never ends: two moves, always available. */
export const loopGame: SearchGame<LoopState, string> = {
  apply: state => ({ player: 1 - state.player }),
  currentPlayer: state => state.player,
  moves: () => ['a', 'b'],
  outcome: () => 0,
};

export interface RaceState {
  done: boolean;
  remaining: number;
}

/**
 * One player ends the game at once with `quick`, or after two more forced
 * steps with `long`, with the same `result` (1 win, -1 loss) either way.
 * `order` is the order the two moves are listed in.
 */
export function raceGame(result: number, order: readonly ['long', 'quick'] | readonly ['quick', 'long']): SearchGame<RaceState, string> {
  return {
    currentPlayer: () => 0,
    moves: state => (state.done ? [] : state.remaining < 0 ? order : ['step']),
    outcome: (_state, player) => (player === 0 ? result : -result),
    apply: (state, move) => {
      if (move === 'quick')
        return { done: true, remaining: 0 };
      if (move === 'long')
        return { done: false, remaining: 2 };
      return { done: state.remaining === 1, remaining: state.remaining - 1 };
    },
  };
}

export const raceStart: RaceState = { done: false, remaining: -1 };
