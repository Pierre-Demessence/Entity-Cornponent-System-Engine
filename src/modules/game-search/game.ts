/**
 * The rules of a turn-based game as four functions over plain states, with no
 * world: all a search needs. `S` is the game state, `M` a move, `P` the
 * player id (default `number`).
 *
 * A state is final when `moves` returns an empty list; a game with forced
 * passes models the pass as a move. Chance (dice, shuffles) lives in the
 * state, for example a `SeededRng`'s `state` field, so `apply` stays
 * deterministic.
 */
export interface SearchGame<S, M, P = number> {
  /**
   * A new state with `move` played; never mutates `state`, and returns the
   * same result for the same arguments.
   */
  apply: (state: S, move: M) => S;
  /** Who moves in `state`, compared with `===`. Only called on non-final states. */
  currentPlayer: (state: S) => P;
  /**
   * The legal moves in `state`, or `[]` once the game is over. Returns the
   * same order for the same state; searches try moves in that order, so list
   * likely-good moves first.
   */
  moves: (state: S) => readonly M[];
  /** The result of a final `state` for `player`: `-1` a loss, `0` a draw, `1` a win. */
  outcome: (state: S, player: P) => number;
}

/** Throws unless an option that is set is a number that is not negative (`Infinity` is allowed). */
export function assertBudget(name: string, value: number | undefined): void {
  if (value !== undefined && !(typeof value === 'number' && value >= 0))
    throw new Error(`${name} must be a number that is not negative, got ${String(value)}.`);
}
