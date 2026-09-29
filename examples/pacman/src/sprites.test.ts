import { describe, expect, it } from 'vitest';

import { buildClips, frameNames } from './sprites';

describe('sprite sheet', () => {
  it('names every frame once', () => {
    const names = frameNames();
    expect(new Set(names).size).toBe(names.length);
  });

  it('only animates frames that exist on the sheet', () => {
    const names = new Set(frameNames());
    const clips = buildClips();
    for (const clip of ['pac-move', 'pac-idle', 'pac-death', 'fright', 'fright-flash', 'blinky-left', 'eyes-up']) {
      for (const frame of clips.require(clip).frames)
        expect(names.has(frame), `${clip}: ${frame}`).toBe(true);
    }
  });

  it('has a walking clip for every ghost in every direction', () => {
    const clips = buildClips();
    for (const kind of ['blinky', 'pinky', 'inky', 'clyde']) {
      for (const dir of ['up', 'left', 'down', 'right'])
        expect(clips.has(`${kind}-${dir}`)).toBe(true);
    }
  });
});
