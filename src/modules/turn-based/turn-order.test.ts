import { describe, expect, it } from 'vitest';

import {
  addSeat,
  advanceTurn,
  currentSeat,
  makeTurnOrder,
  nextSeat,
  passTurnTo,
  removeSeat,
  reverseTurns,
} from './turn-order';

describe('makeTurnOrder', () => {
  it('starts at the first seat with zeroed counters', () => {
    const order = makeTurnOrder(['a', 'b', 'c']);
    expect(order).toEqual({ active: 0, direction: 1, rounds: 0, seats: ['a', 'b', 'c'], turns: 0 });
    expect(currentSeat(order)).toBe('a');
  });

  it('copies the seats and honours first', () => {
    const seats = [1, 2, 3];
    const order = makeTurnOrder(seats, 2);
    seats.push(4);
    expect(order.seats).toEqual([1, 2, 3]);
    expect(currentSeat(order)).toBe(3);
  });

  it('throws on an out-of-range or fractional first when seats exist', () => {
    expect(() => makeTurnOrder([1, 2], 2)).toThrow();
    expect(() => makeTurnOrder([1, 2], -1)).toThrow();
    expect(() => makeTurnOrder([1, 2], 0.5)).toThrow();
  });

  it('allows an empty order', () => {
    const order = makeTurnOrder<number>([]);
    expect(currentSeat(order)).toBeUndefined();
    expect(nextSeat(order)).toBeUndefined();
  });
});

describe('advanceTurn', () => {
  it('walks the seats, counting turns, and wraps once per lap', () => {
    const order = makeTurnOrder(['a', 'b', 'c']);
    expect(advanceTurn(order)).toBe(false);
    expect(advanceTurn(order)).toBe(false);
    expect(currentSeat(order)).toBe('c');
    expect(advanceTurn(order)).toBe(true);
    expect(currentSeat(order)).toBe('a');
    expect(order.turns).toBe(3);
    expect(order.rounds).toBe(1);
  });

  it('walks backwards when reversed, wrapping from first to last', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 1);
    reverseTurns(order);
    expect(advanceTurn(order)).toBe(false);
    expect(currentSeat(order)).toBe('a');
    expect(advanceTurn(order)).toBe(true);
    expect(currentSeat(order)).toBe('c');
    expect(order.rounds).toBe(1);
    expect(advanceTurn(order)).toBe(false);
    expect(currentSeat(order)).toBe('b');
  });

  it('skips seats, counting one turn', () => {
    const order = makeTurnOrder(['a', 'b', 'c', 'd']);
    expect(advanceTurn(order, 1)).toBe(false);
    expect(currentSeat(order)).toBe('c');
    expect(order.turns).toBe(1);
  });

  it('counts a wrap crossed by a skip', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 2);
    expect(advanceTurn(order, 1)).toBe(true);
    expect(currentSeat(order)).toBe('b');
    expect(order.rounds).toBe(1);
  });

  it('counts every lap when skip is at least the seat count', () => {
    const order = makeTurnOrder(['a', 'b', 'c']);
    expect(advanceTurn(order, 3)).toBe(true);
    expect(currentSeat(order)).toBe('b');
    expect(order.rounds).toBe(1);
    expect(advanceTurn(order, 5)).toBe(true);
    expect(currentSeat(order)).toBe('b');
    expect(order.rounds).toBe(3);
  });

  it('counts the same laps when reversed', () => {
    const order = makeTurnOrder(['a', 'b', 'c']);
    reverseTurns(order);
    expect(advanceTurn(order, 2)).toBe(true); // a -> c -> b -> a: one wrap
    expect(currentSeat(order)).toBe('a');
    expect(order.rounds).toBe(1);
    expect(advanceTurn(order, 3)).toBe(true); // 4 steps back from a: c, b, a, c
    expect(currentSeat(order)).toBe('c');
    expect(order.rounds).toBe(3);
  });

  it('treats a negative skip as none and truncates a fractional one', () => {
    const order = makeTurnOrder(['a', 'b', 'c', 'd']);
    advanceTurn(order, -3);
    expect(currentSeat(order)).toBe('b');
    advanceTurn(order, 1.9);
    expect(currentSeat(order)).toBe('d');
  });

  it('wraps on every advance with a single seat', () => {
    const order = makeTurnOrder(['solo']);
    expect(advanceTurn(order)).toBe(true);
    expect(advanceTurn(order)).toBe(true);
    reverseTurns(order);
    expect(advanceTurn(order)).toBe(true);
    expect(order).toMatchObject({ active: 0, rounds: 3, turns: 3 });
  });

  it('does nothing without seats', () => {
    const order = makeTurnOrder<number>([]);
    expect(advanceTurn(order)).toBe(false);
    expect(order).toEqual({ active: 0, direction: 1, rounds: 0, seats: [], turns: 0 });
  });
});

describe('nextSeat', () => {
  it('looks one seat ahead in the direction, wrapping', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 2);
    expect(nextSeat(order)).toBe('a');
    reverseTurns(order);
    expect(nextSeat(order)).toBe('b');
    order.active = 0;
    expect(nextSeat(order)).toBe('c');
  });
});

describe('passTurnTo', () => {
  it('makes the seat active, counting a turn but not a round', () => {
    const order = makeTurnOrder(['a', 'b', 'c']);
    passTurnTo(order, 'c');
    expect(currentSeat(order)).toBe('c');
    expect(order).toMatchObject({ rounds: 0, turns: 1 });
    passTurnTo(order, 'a');
    expect(order).toMatchObject({ active: 0, rounds: 0, turns: 2 });
  });

  it('throws on an absent seat and leaves the order unchanged', () => {
    const order = makeTurnOrder(['a', 'b'], 1);
    const before = structuredClone(order);
    expect(() => passTurnTo(order, 'z')).toThrow();
    expect(order).toEqual(before);
  });
});

describe('reverseTurns', () => {
  it('flips the direction and keeps the active seat', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 1);
    reverseTurns(order);
    expect(order.direction).toBe(-1);
    expect(currentSeat(order)).toBe('b');
    reverseTurns(order);
    expect(order.direction).toBe(1);
  });
});

describe('addSeat', () => {
  it('appends by default and keeps the active seat', () => {
    const order = makeTurnOrder(['a', 'b'], 1);
    addSeat(order, 'c');
    expect(order.seats).toEqual(['a', 'b', 'c']);
    expect(currentSeat(order)).toBe('b');
  });

  it('keeps the active seat when inserting before or at it', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 1);
    addSeat(order, 'x', 0);
    expect(currentSeat(order)).toBe('b');
    addSeat(order, 'y', 2); // at the active seat's index: goes before it
    expect(order.seats).toEqual(['x', 'a', 'y', 'b', 'c']);
    expect(currentSeat(order)).toBe('b');
  });

  it('keeps the active seat when inserting after it, and clamps the index', () => {
    const order = makeTurnOrder(['a', 'b'], 0);
    addSeat(order, 'x', 1);
    addSeat(order, 'y', 99);
    addSeat(order, 'z', -5);
    expect(order.seats).toEqual(['z', 'a', 'x', 'b', 'y']);
    expect(currentSeat(order)).toBe('a');
  });

  it('makes the first seat of an empty order active', () => {
    const order = makeTurnOrder<string>([]);
    addSeat(order, 'a');
    expect(currentSeat(order)).toBe('a');
  });

  it('leaves the counters alone', () => {
    const order = makeTurnOrder(['a', 'b']);
    advanceTurn(order);
    addSeat(order, 'c', 0);
    expect(order).toMatchObject({ rounds: 0, turns: 1 });
  });
});

describe('removeSeat', () => {
  it('returns false for an absent seat and changes nothing', () => {
    const order = makeTurnOrder(['a', 'b']);
    const before = structuredClone(order);
    expect(removeSeat(order, 'z')).toBe(false);
    expect(order).toEqual(before);
  });

  it('keeps the active seat when removing before or after it', () => {
    const order = makeTurnOrder(['a', 'b', 'c', 'd'], 2);
    expect(removeSeat(order, 'a')).toBe(true);
    expect(currentSeat(order)).toBe('c');
    expect(removeSeat(order, 'd')).toBe(true);
    expect(currentSeat(order)).toBe('c');
    expect(order.seats).toEqual(['b', 'c']);
  });

  it('hands the turn to the next seat forward when the active one is removed', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 1);
    removeSeat(order, 'b');
    expect(currentSeat(order)).toBe('c');
  });

  it('wraps to the first seat when the last active seat is removed going forward', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 2);
    removeSeat(order, 'c');
    expect(currentSeat(order)).toBe('a');
  });

  it('hands the turn to the previous seat when reversed, wrapping to the last', () => {
    const order = makeTurnOrder(['a', 'b', 'c'], 1);
    reverseTurns(order);
    removeSeat(order, 'b');
    expect(currentSeat(order)).toBe('a');
    removeSeat(order, 'a');
    expect(currentSeat(order)).toBe('c');
  });

  it('empties the order cleanly', () => {
    const order = makeTurnOrder(['a']);
    removeSeat(order, 'a');
    expect(order.seats).toEqual([]);
    expect(currentSeat(order)).toBeUndefined();
    expect(advanceTurn(order)).toBe(false);
  });

  it('leaves the counters alone', () => {
    const order = makeTurnOrder(['a', 'b', 'c']);
    advanceTurn(order);
    removeSeat(order, 'b');
    expect(order).toMatchObject({ rounds: 0, turns: 1 });
  });
});

describe('jSON round trip', () => {
  it('survives stringify and parse unchanged', () => {
    const order = makeTurnOrder(['a', 'b', 'c']);
    advanceTurn(order, 1);
    reverseTurns(order);
    advanceTurn(order);
    addSeat(order, 'd', 1);
    passTurnTo(order, 'c');
    const copy = JSON.parse(JSON.stringify(order)) as typeof order;
    expect(copy).toEqual(order);
    advanceTurn(copy);
    advanceTurn(order);
    expect(copy).toEqual(order);
  });
});
