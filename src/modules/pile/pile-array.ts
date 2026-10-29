/**
 * Move the top `count` items of `from` onto `to`, keeping their order — a
 * draw, or a run of cards moved as one. Moves fewer when `from` holds fewer;
 * `count` is truncated and clamped at 0. Both arrays change in place (index
 * `0` is the bottom). Returns the moved items, bottom first.
 *
 * With `from === to` the items are taken off and put back on, so the array is
 * unchanged.
 */
export function moveTop<T>(from: T[], to: T[], count = 1): T[] {
  const take = Math.max(0, Math.min(Math.trunc(count), from.length));
  const moved = from.splice(from.length - take, take);
  to.push(...moved);
  return moved;
}

/** Options for {@link moveAll}. */
export interface MoveAllOptions {
  /** Flip the order on the way, as when a face-up waste pile is turned back into the stock. */
  reverse?: boolean;
}

/**
 * Move every item of `from` onto the top of `to`, keeping their order unless
 * `reverse` is set. Both arrays change in place. Returns the moved items in the
 * order they were added.
 *
 * With `from === to`, `reverse` flips the array in place.
 */
export function moveAll<T>(from: T[], to: T[], options: MoveAllOptions = {}): T[] {
  const moved = from.splice(0);
  if (options.reverse)
    moved.reverse();
  to.push(...moved);
  return moved;
}

/**
 * Move one `item` from `from` into `to` at `index` (default: on top). The
 * first `===` match in `from` is removed first, so with `from === to` `index`
 * counts positions after that removal, which is how you reorder an array. An
 * out-of-range `index` is clamped and a fractional one truncated.
 *
 * Returns `false` — changing neither array — when `item` is not in `from`.
 */
export function moveItem<T>(from: T[], to: T[], item: T, index?: number): boolean {
  const at = from.indexOf(item);
  if (at < 0)
    return false;
  from.splice(at, 1);
  const target = index === undefined
    ? to.length
    : Math.max(0, Math.min(Math.trunc(index), to.length));
  to.splice(target, 0, item);
  return true;
}
