/**
 * Whose turn it is, as plain data: an ordered list of seats, the active one,
 * and counters. Seats are any id (a number, a string, an `EntityId`), expected
 * distinct. The value is JSON-safe when the seat type is, so it can sit in a
 * saved game state as an ordinary field.
 *
 * Change it only through this module's operations, which keep `active` in
 * range.
 */
export interface TurnOrder<T> {
  /** Index into `seats` of the seat holding the turn (`0` when there are no seats). */
  active: number;
  /** Which way {@link advanceTurn} walks `seats`. */
  direction: 1 | -1;
  /** Completed rounds: how many times play passed the wrap point. */
  rounds: number;
  /** Seats in play order. */
  seats: T[];
  /** Completed turns. */
  turns: number;
}

/**
 * A fresh order over a copy of `seats`, with `first` (an index, default `0`)
 * active and both counters at 0. Throws when `first` is not a valid index of a
 * non-empty `seats`.
 */
export function makeTurnOrder<T>(seats: readonly T[], first = 0): TurnOrder<T> {
  if (seats.length > 0 && !(Number.isInteger(first) && first >= 0 && first < seats.length))
    throw new Error(`First seat index ${first} is outside 0..${seats.length - 1}.`);
  return { active: seats.length > 0 ? first : 0, direction: 1, rounds: 0, seats: [...seats], turns: 0 };
}

/** The seat holding the turn, or `undefined` when there are no seats. */
export function currentSeat<T>(order: TurnOrder<T>): T | undefined {
  return order.seats[order.active];
}

/** The seat that gets the turn after the current one, or `undefined` when there are no seats. */
export function nextSeat<T>(order: TurnOrder<T>): T | undefined {
  const count = order.seats.length;
  return count === 0 ? undefined : order.seats[wrapIndex(order.active + order.direction, count)];
}

/**
 * End the current turn and hand it to the next seat in `direction`, passing
 * over `skip` seats on the way (a "skip" card). `turns` goes up by one; every
 * pass over the wrap point (last to first going forward, first to last when
 * reversed) adds one to `rounds`, and `skip` can cross it more than once.
 *
 * Returns whether the advance wrapped at least once. With a single seat every
 * advance wraps. With no seats it does nothing and returns `false`.
 *
 * An extra turn (a Checkers multi-jump) needs no call: just do not advance.
 */
export function advanceTurn<T>(order: TurnOrder<T>, skip = 0): boolean {
  const count = order.seats.length;
  if (count === 0)
    return false;
  const steps = 1 + Math.max(0, Math.trunc(skip));
  const target = order.active + order.direction * steps;
  const wraps = target >= 0 ? Math.floor(target / count) : Math.ceil(-target / count);
  order.active = wrapIndex(target, count);
  order.turns += 1;
  order.rounds += wraps;
  return wraps > 0;
}

/**
 * Hand the turn to `seat` directly — the winner of a trick leads next. Counts
 * as a turn but not as a round. Throws, changing nothing, when `seat` is not
 * in the order.
 */
export function passTurnTo<T>(order: TurnOrder<T>, seat: T): void {
  const index = order.seats.indexOf(seat);
  if (index < 0)
    throw new Error('Cannot pass the turn to a seat that is not in the order.');
  order.active = index;
  order.turns += 1;
}

/** Flip `direction`; the active seat keeps the turn. */
export function reverseTurns<T>(order: TurnOrder<T>): void {
  order.direction = order.direction === 1 ? -1 : 1;
}

/**
 * Insert `seat` at `index` (default: last; clamped, fractions truncated). The
 * active seat keeps the turn, and the counters are untouched. Adding to an
 * empty order makes the new seat active.
 */
export function addSeat<T>(order: TurnOrder<T>, seat: T, index = order.seats.length): void {
  const at = Math.max(0, Math.min(Math.trunc(index), order.seats.length));
  if (order.seats.length > 0 && at <= order.active)
    order.active += 1;
  order.seats.splice(at, 0, seat);
}

/**
 * Take `seat` out of the order and return `true`, or return `false` when it is
 * absent. Another seat keeps the turn it had; if the removed seat held it, the
 * seat that would have come next in `direction` takes it. The counters are
 * untouched.
 */
export function removeSeat<T>(order: TurnOrder<T>, seat: T): boolean {
  const index = order.seats.indexOf(seat);
  if (index < 0)
    return false;
  order.seats.splice(index, 1);
  const count = order.seats.length;
  if (count === 0)
    order.active = 0;
  else if (index < order.active)
    order.active -= 1;
  else if (index === order.active)
    order.active = wrapIndex(order.direction === 1 ? index : index - 1, count);
  return true;
}

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}
