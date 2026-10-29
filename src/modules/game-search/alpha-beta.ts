import type { RandomFn } from '../rng';
import type { SearchGame } from './game';

import { shuffle } from '../rng';
import { assertBudget } from './game';

/**
 * The score of a win at the root. A forced win in `n` moves scores
 * `WIN_SCORE - n`, a forced loss `-(WIN_SCORE - n)`, so `score > WIN_SCORE / 2`
 * means a forced win. Keep `evaluate` results within `±WIN_SCORE / 2`.
 */
export const WIN_SCORE = 1e9;

const FORCED = WIN_SCORE / 2;
const CLOCK_INTERVAL = 1024;
const DEFAULT_TABLE_ENTRIES = 2 ** 20;

/** Options for {@link alphaBetaSearch}. With no budget it searches to the end of the game. */
export interface AlphaBetaOptions<S, P = number> {
  /** Deepest look-ahead in moves. Depth 1 always completes, so `0` acts as `1`. */
  maxDepth?: number;
  /** Stop after about this many moves have been tried (`apply` calls). */
  maxNodes?: number;
  /** Entries the transposition table holds before it is cleared. Default `2 ** 20`. */
  maxTableEntries?: number;
  /** Shuffles the root moves once, so equally good moves are chosen differently per seed. */
  random?: RandomFn;
  /** Stop after about this many milliseconds. */
  timeMs?: number;
  /**
   * Scores a non-final `state` from `player`'s side: higher is better for them,
   * within `±WIN_SCORE / 2`. Called at the depth limit, always for the player to
   * move at the root.
   */
  evaluate: (state: S, player: P) => number;
  /**
   * Identifies a state: equal keys mean the same position. Turns on a
   * transposition table that skips positions reached by different move orders.
   */
  key?: (state: S) => number | string;
  /** Clock for `timeMs`, in milliseconds. Default `performance.now`. */
  now?: () => number;
}

/** What {@link alphaBetaSearch} found. */
export interface AlphaBetaResult<M> {
  /**
   * True when `score` is exact: the whole game tree was searched, or a forced
   * win or loss was proven. False when a budget stopped the search first, and
   * when the state had a single move, which is returned without searching.
   */
  complete: boolean;
  /** Deepest look-ahead, in moves, that finished; `0` when nothing was searched. */
  depth: number;
  /** The best move, or `undefined` when the state has no legal move. */
  move: M | undefined;
  /** Moves tried (`apply` calls), over all depths. */
  nodes: number;
  /** The value of `move` from the side of the player to move at the root; see {@link WIN_SCORE}. */
  score: number;
}

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

interface TableEntry {
  /** Index into `moves` of the best move found, tried first next time. */
  best: number;
  bound: typeof EXACT | typeof LOWER | typeof UPPER;
  depth: number;
  /** The searched part of the subtree reached no depth limit, so the entry holds at any depth. */
  solved: boolean;
  /** From the root player's side, with forced-result scores counted from this node. */
  value: number;
}

/** Thrown to unwind a search whose budget ran out. */
const OUT_OF_BUDGET = Symbol('out of budget');

function toTable(value: number, ply: number): number {
  return value > FORCED ? value + ply : value < -FORCED ? value - ply : value;
}

function fromTable(value: number, ply: number): number {
  return value > FORCED ? value - ply : value < -FORCED ? value + ply : value;
}

/**
 * Looks ahead with iterative-deepening minimax and alpha-beta pruning and
 * returns the best move for the player to move in `state`.
 *
 * It searches one move deeper each round until the budget runs out or the
 * game tree is exhausted, and returns the best move of the last finished round.
 * The first round always finishes, so a legal move comes back whenever one
 * exists. Every other player is assumed to play against the root player, which
 * also covers moves that leave the same player to move.
 *
 * Throws when a budget option is negative or not a number.
 */
export function alphaBetaSearch<S, M, P = number>(
  game: SearchGame<S, M, P>,
  state: S,
  options: AlphaBetaOptions<S, P>,
): AlphaBetaResult<M> {
  const { evaluate, key, maxDepth = Infinity, maxNodes = Infinity, maxTableEntries = DEFAULT_TABLE_ENTRIES, random, timeMs } = options;
  assertBudget('maxDepth', options.maxDepth);
  assertBudget('maxNodes', options.maxNodes);
  assertBudget('maxTableEntries', options.maxTableEntries);
  assertBudget('timeMs', timeMs);

  const rootMoves = game.moves(state);
  if (rootMoves.length === 0)
    return { complete: true, depth: 0, move: undefined, nodes: 0, score: 0 };
  if (rootMoves.length === 1)
    return { complete: false, depth: 0, move: rootMoves[0], nodes: 0, score: 0 };

  const rootPlayer = game.currentPlayer(state);
  const now = options.now ?? (() => performance.now());
  const start = timeMs === undefined ? 0 : now();
  const table = key ? new Map<number | string, TableEntry>() : undefined;

  let nodes = 0;
  let depthLimits = 0;
  let limited = false;

  const overTime = () => timeMs !== undefined && now() - start >= timeMs;

  const step = (from: S, move: M): S => {
    if (limited && (nodes >= maxNodes || (nodes % CLOCK_INTERVAL === 0 && overTime())))
      throw OUT_OF_BUDGET;
    nodes++;
    return game.apply(from, move);
  };

  const search = (node: S, depthLeft: number, ply: number, alphaIn: number, betaIn: number): number => {
    const moves = game.moves(node);
    if (moves.length === 0)
      return game.outcome(node, rootPlayer) * (WIN_SCORE - ply);
    if (depthLeft === 0) {
      depthLimits++;
      return evaluate(node, rootPlayer);
    }

    let alpha = alphaIn;
    let beta = betaIn;
    const id = key ? key(node) : undefined;
    let tableBest = -1;
    if (table && id !== undefined) {
      const entry = table.get(id);
      if (entry) {
        tableBest = entry.best;
        if (entry.solved || entry.depth >= depthLeft) {
          if (!entry.solved)
            depthLimits++;
          const value = fromTable(entry.value, ply);
          if (entry.bound === EXACT)
            return value;
          if (entry.bound === LOWER)
            alpha = Math.max(alpha, value);
          else
            beta = Math.min(beta, value);
          if (alpha >= beta)
            return value;
        }
      }
    }

    const maximizing = game.currentPlayer(node) === rootPlayer;
    const limitsBefore = depthLimits;
    const windowLow = alpha;
    const windowHigh = beta;
    let best = maximizing ? -Infinity : Infinity;
    let bestIndex = -1;
    // The table's best move goes first (n = -1), then the rest in `moves` order.
    for (let n = tableBest >= 0 ? -1 : 0; n < moves.length; n++) {
      const index = n === -1 ? tableBest : n;
      if (n >= 0 && index === tableBest)
        continue;
      const value = search(step(node, moves[index]!), depthLeft - 1, ply + 1, alpha, beta);
      if (maximizing ? value > best : value < best) {
        best = value;
        bestIndex = index;
      }
      if (maximizing)
        alpha = Math.max(alpha, best);
      else
        beta = Math.min(beta, best);
      if (alpha >= beta)
        break;
    }

    if (table && id !== undefined) {
      if (table.size >= maxTableEntries)
        table.clear();
      table.set(id, {
        best: bestIndex,
        bound: best <= windowLow ? UPPER : best >= windowHigh ? LOWER : EXACT,
        depth: depthLeft,
        solved: depthLimits === limitsBefore,
        value: toTable(best, ply),
      });
    }
    return best;
  };

  const order = rootMoves.map((_, index) => index);
  if (random)
    shuffle(order, random);

  let bestIndex = order[0]!;
  let bestScore = 0;
  let depth = 0;
  let complete = false;
  for (let iteration = 1; iteration <= Math.max(1, maxDepth); iteration++) {
    limited = iteration > 1;
    if (limited && (nodes >= maxNodes || overTime()))
      break;
    depthLimits = 0;
    // The previous best root move goes first, so the window tightens early.
    const roundOrder = iteration === 1 ? order : [bestIndex, ...order.filter(index => index !== bestIndex)];
    let roundBest = -1;
    let roundScore = -Infinity;
    try {
      for (const index of roundOrder) {
        const value = search(step(state, rootMoves[index]!), iteration - 1, 1, roundScore, Infinity);
        if (value > roundScore) {
          roundScore = value;
          roundBest = index;
        }
      }
    }
    catch (error) {
      if (error === OUT_OF_BUDGET)
        break;
      throw error;
    }
    bestIndex = roundBest;
    bestScore = roundScore;
    depth = iteration;
    if (depthLimits === 0 || Math.abs(roundScore) > FORCED) {
      complete = true;
      break;
    }
  }

  return { complete, depth, move: rootMoves[bestIndex], nodes, score: bestScore };
}
