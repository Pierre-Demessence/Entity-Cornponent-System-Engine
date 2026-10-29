import { describe, expect, it } from 'vitest';

import { moveAll, moveItem, moveTop } from './pile-array';

describe('moveTop', () => {
  it('moves the top run in order and returns it bottom first', () => {
    const from = [1, 2, 3, 4];
    const to = [9];
    expect(moveTop(from, to, 2)).toEqual([3, 4]);
    expect(from).toEqual([1, 2]);
    expect(to).toEqual([9, 3, 4]);
  });

  it('defaults to one item', () => {
    const from = [1, 2];
    const to: number[] = [];
    expect(moveTop(from, to)).toEqual([2]);
    expect(from).toEqual([1]);
    expect(to).toEqual([2]);
  });

  it('moves only what is there', () => {
    const from = [1, 2];
    const to: number[] = [];
    expect(moveTop(from, to, 10)).toEqual([1, 2]);
    expect(moveTop(from, to, 3)).toEqual([]);
    expect(from).toEqual([]);
    expect(to).toEqual([1, 2]);
  });

  it('truncates a fractional count and clamps a negative one at 0', () => {
    const from = [1, 2, 3];
    const to: number[] = [];
    expect(moveTop(from, to, 1.9)).toEqual([3]);
    expect(moveTop(from, to, -2)).toEqual([]);
    expect(moveTop(from, to, 0)).toEqual([]);
    expect(from).toEqual([1, 2]);
    expect(to).toEqual([3]);
  });

  it('leaves the array unchanged when from and to are the same', () => {
    const pile = [1, 2, 3];
    expect(moveTop(pile, pile, 2)).toEqual([2, 3]);
    expect(pile).toEqual([1, 2, 3]);
  });

  it('moves object items by reference', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const from = [a, b];
    const to: typeof a[] = [];
    const [moved] = moveTop(from, to);
    expect(moved).toBe(b);
    expect(to[0]).toBe(b);
  });
});

describe('moveAll', () => {
  it('empties from onto to, keeping order', () => {
    const from = [1, 2, 3];
    const to = [9];
    expect(moveAll(from, to)).toEqual([1, 2, 3]);
    expect(from).toEqual([]);
    expect(to).toEqual([9, 1, 2, 3]);
  });

  it('reverses on the way', () => {
    const from = [1, 2, 3];
    const to: number[] = [];
    expect(moveAll(from, to, { reverse: true })).toEqual([3, 2, 1]);
    expect(to).toEqual([3, 2, 1]);
    expect(from).toEqual([]);
  });

  it('on the same array is a no-op, or a flip with reverse', () => {
    const pile = [1, 2, 3];
    moveAll(pile, pile);
    expect(pile).toEqual([1, 2, 3]);
    moveAll(pile, pile, { reverse: true });
    expect(pile).toEqual([3, 2, 1]);
  });

  it('handles an empty source', () => {
    const to = [1];
    expect(moveAll([], to)).toEqual([]);
    expect(to).toEqual([1]);
  });
});

describe('moveItem', () => {
  it('moves one item from the middle onto the top by default', () => {
    const from = [1, 2, 3];
    const to = [9];
    expect(moveItem(from, to, 2)).toBe(true);
    expect(from).toEqual([1, 3]);
    expect(to).toEqual([9, 2]);
  });

  it('inserts at an index, clamped and truncated', () => {
    const to = [7, 8, 9];
    moveItem([1], to, 1, 1.5);
    expect(to).toEqual([7, 1, 8, 9]);
    moveItem([2], to, 2, -4);
    expect(to).toEqual([2, 7, 1, 8, 9]);
    moveItem([3], to, 3, 99);
    expect(to).toEqual([2, 7, 1, 8, 9, 3]);
  });

  it('moves only the first match', () => {
    const from = [1, 2, 1];
    const to: number[] = [];
    moveItem(from, to, 1);
    expect(from).toEqual([2, 1]);
    expect(to).toEqual([1]);
  });

  it('reorders within one array, counting the index after the removal', () => {
    const pile = [1, 2, 3, 4];
    expect(moveItem(pile, pile, 1, 2)).toBe(true);
    expect(pile).toEqual([2, 3, 1, 4]);
    moveItem(pile, pile, 4, 0);
    expect(pile).toEqual([4, 2, 3, 1]);
    moveItem(pile, pile, 4);
    expect(pile).toEqual([2, 3, 1, 4]);
  });

  it('returns false and changes nothing when the item is absent', () => {
    const from = [1, 2];
    const to = [3];
    expect(moveItem(from, to, 5)).toBe(false);
    expect(from).toEqual([1, 2]);
    expect(to).toEqual([3]);
  });

  it('matches objects by reference', () => {
    const a = { id: 1 };
    const from = [a];
    const to: typeof a[] = [];
    expect(moveItem(from, to, { id: 1 })).toBe(false);
    expect(moveItem(from, to, a)).toBe(true);
    expect(to[0]).toBe(a);
  });
});
