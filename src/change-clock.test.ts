import { describe, expect, it } from 'vitest';

import { ChangeClock } from '#change-clock';

describe('changeClock', () => {
  it('starts at tick 1 so a zero stamp always means absent', () => {
    expect(new ChangeClock().tick).toBe(1);
  });
});
