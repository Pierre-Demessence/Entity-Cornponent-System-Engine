import type { RandomFn } from '../rng';
import type { SearchGame } from './game';

import { randomInt } from '../rng';
import { assertBudget } from './game';

const DEFAULT_ITERATIONS = 1000;
const DEFAULT_ROLLOUT_DEPTH = 1000;

/** Options for {@link mctsSearch}. With neither `iterations` nor `timeMs` it runs 1 000 iterations. */
export interface MctsOptions<S, M, P = number> {
  /** The UCT constant: higher tries less-visited moves more. Default `Math.SQRT2`. */
  exploration?: number;
  /** Iterations to run; at least one always runs. Default 1 000 without `timeMs`, unlimited with it. */
  iterations?: number;
  /** Moves a random playout may make before it is cut short. Default 1 000. */
  maxRolloutDepth?: number;
  /** Source of randomness; pass a seeded one for repeatable play. Default `Math.random`. */
  random?: RandomFn;
  /** Stop after about this many milliseconds, or after `iterations`, whichever comes first. */
  timeMs?: number;
  /**
   * Scores a playout that was cut at `maxRolloutDepth` from `player`'s side, from
   * `-1` (loss) to `1` (win); results outside that range are clamped. Default: a draw.
   */
  evaluate?: (state: S, player: P) => number;
  /** Clock for `timeMs`, in milliseconds. Default `performance.now`. */
  now?: () => number;
  /**
   * Picks the move a playout plays in `state`, which has at least one legal move.
   * Default: a uniformly random legal move. A smarter policy (take a win, avoid
   * a blunder) makes each playout more informative.
   */
  rollout?: (state: S, random: RandomFn) => M;
}

/** What {@link mctsSearch} found. */
export interface MctsResult<M> {
  /** Iterations run; `0` when the state had no move or a single move. */
  iterations: number;
  /** The most visited move, or `undefined` when the state has no legal move. */
  move: M | undefined;
  /** The mean result of `move` for the player to move at the root, from `-1` to `1`. */
  value: number;
  /** How many iterations went through `move`. */
  visits: number;
}

interface Node<S, M, P> {
  children: Node<S, M, P>[];
  /** The move into this node; `undefined` at the root. */
  move: M | undefined;
  /** The player who made the move into this node. */
  mover: P;
  parent: Node<S, M, P> | undefined;
  state: S;
  /** Sum of the playout results for `mover`, each from -1 to 1. */
  total: number;
  /** Moves not yet expanded into children. */
  untried: M[];
  visits: number;
}

/**
 * Looks ahead with Monte Carlo tree search and returns the most promising move
 * for the player to move in `state`.
 *
 * Each iteration walks down the tree that has been built so far, favouring
 * moves that did well (UCT), adds one new position, plays it out with random
 * moves to the end of the game and credits the result to every move on the
 * way. A move is credited to the player who made it, so any number of players
 * and moves that leave the same player to move work. The tree lives for one call.
 *
 * Throws when a budget option or `exploration` is negative or not a number.
 */
export function mctsSearch<S, M, P = number>(
  game: SearchGame<S, M, P>,
  state: S,
  options: MctsOptions<S, M, P> = {},
): MctsResult<M> {
  const { evaluate, exploration = Math.SQRT2, maxRolloutDepth = DEFAULT_ROLLOUT_DEPTH, random = Math.random, rollout, timeMs } = options;
  assertBudget('iterations', options.iterations);
  assertBudget('timeMs', timeMs);
  assertBudget('maxRolloutDepth', options.maxRolloutDepth);
  assertBudget('exploration', options.exploration);

  const rootMoves = game.moves(state);
  if (rootMoves.length === 0)
    return { iterations: 0, move: undefined, value: 0, visits: 0 };
  if (rootMoves.length === 1)
    return { iterations: 0, move: rootMoves[0], value: 0, visits: 0 };

  const iterations = options.iterations ?? (timeMs === undefined ? DEFAULT_ITERATIONS : Infinity);
  const now = options.now ?? (() => performance.now());
  const start = timeMs === undefined ? 0 : now();

  const makeNode = (nodeState: S, parent: Node<S, M, P> | undefined, move: M | undefined, mover: P): Node<S, M, P> => ({
    children: [],
    move,
    mover,
    parent,
    state: nodeState,
    total: 0,
    untried: [...game.moves(nodeState)],
    visits: 0,
  });
  const root = makeNode(state, undefined, undefined, game.currentPlayer(state));

  const selectChild = (node: Node<S, M, P>): Node<S, M, P> => {
    const logVisits = Math.log(node.visits);
    let best = node.children[0]!;
    let bestScore = -Infinity;
    for (const child of node.children) {
      // Means are mapped from -1..1 to 0..1, the range the exploration constant is tuned for.
      const score = (child.total / child.visits + 1) / 2 + exploration * Math.sqrt(logVisits / child.visits);
      if (score > bestScore) {
        best = child;
        bestScore = score;
      }
    }
    return best;
  };

  const hasTime = () => timeMs === undefined || now() - start < timeMs;

  let done = 0;
  while (done < 1 || (done < iterations && hasTime())) {
    let node = root;
    while (node.untried.length === 0 && node.children.length > 0)
      node = selectChild(node);
    if (node.untried.length > 0) {
      const move = node.untried.splice(randomInt(node.untried.length, random), 1)[0]!;
      const child = makeNode(game.apply(node.state, move), node, move, game.currentPlayer(node.state));
      node.children.push(child);
      node = child;
    }

    let end = node.state;
    let final = false;
    for (let depth = 0; ; depth++) {
      const moves = game.moves(end);
      if (moves.length === 0) {
        final = true;
        break;
      }
      if (depth >= maxRolloutDepth)
        break;
      end = game.apply(end, rollout ? rollout(end, random) : moves[randomInt(moves.length, random)]!);
    }

    const results = new Map<P, number>();
    const resultFor = (player: P): number => {
      let result = results.get(player);
      if (result === undefined) {
        result = final ? game.outcome(end, player) : evaluate ? Math.max(-1, Math.min(1, evaluate(end, player))) : 0;
        results.set(player, result);
      }
      return result;
    };
    for (let up: Node<S, M, P> | undefined = node; up; up = up.parent) {
      up.visits++;
      if (up.parent)
        up.total += resultFor(up.mover);
    }
    done++;
  }

  let best = root.children[0]!;
  for (const child of root.children) {
    if (child.visits > best.visits || (child.visits === best.visits && child.total > best.total))
      best = child;
  }
  return { iterations: done, move: best.move, value: best.total / best.visits, visits: best.visits };
}
