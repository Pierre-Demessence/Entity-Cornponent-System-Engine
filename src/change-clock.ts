/**
 * Monotonic counter behind change detection. Stores stamp an entity's added /
 * changed tick with the clock's current `tick`; a query with an `added` /
 * `changed` filter remembers the tick of its previous pass and advances the
 * clock at the start of each pass, so it sees exactly the writes made since.
 *
 * A world owns one clock shared by all its stores. Starts at `1`, so a stamp of
 * `0` always means "absent".
 */
export class ChangeClock {
  tick = 1;
}
