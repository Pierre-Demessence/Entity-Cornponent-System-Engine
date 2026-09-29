import { describe, expect, it } from 'vitest';

import { fruitForLevel, ghostPoints, levelParams, releaseDots } from './levels';

describe('levelParams', () => {
  it('ends every schedule in an endless chase', () => {
    for (const level of [1, 2, 5, 30])
      expect(levelParams(level).schedule.at(-1)).toBe(Infinity);
  });

  it('starts with scatter and alternates, so the schedule has an even length', () => {
    for (const level of [1, 2, 5])
      expect(levelParams(level).schedule.length % 2).toBe(0);
  });

  it('speeds the ghosts up and shortens fright as levels climb', () => {
    expect(levelParams(5).ghostSpeed).toBeGreaterThan(levelParams(1).ghostSpeed);
    expect(levelParams(5).frightMs).toBeLessThan(levelParams(1).frightMs);
    expect(levelParams(30).frightMs).toBe(0);
  });
});

describe('scoring and pacing', () => {
  it('doubles ghost points per ghost, capped at 1600', () => {
    expect([0, 1, 2, 3, 4].map(ghostPoints)).toEqual([200, 400, 800, 1600, 1600]);
  });

  it('caps the fruit at the last one', () => {
    expect(fruitForLevel(1).name).toBe('cherry');
    expect(fruitForLevel(99).name).toBe('melon');
  });

  it('releases every ghost immediately once past level two', () => {
    expect(releaseDots(1)).toEqual([0, 30, 60]);
    expect(releaseDots(3)).toEqual([0, 0, 0]);
  });
});
