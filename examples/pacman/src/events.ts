import type { GameState } from './game';
import type { GhostKind } from './ghosts';

import { burst } from '@pierre/ecs/modules/particles';

import { CLIP } from './audio';
import { ORDER, spawnPopup } from './game';
import { GHOST_COLORS } from './ghosts';

function sparkle(g: GameState, x: number, y: number, colors: string | readonly string[], count: number): void {
  burst(g.world, {
    colors,
    count,
    fadeOut: true,
    lifetimeMs: [300, 650],
    position: { x, y },
    renderOrder: ORDER.fx,
    rng: g.rand,
    shrink: true,
    size: [0.14, 0.26],
    speed: [2, 7],
  });
}

/**
 * Turns game events into their side effects — sound, score popups, sparks — so
 * the systems that raise them stay about rules. Returns the unsubscribe.
 */
export function wireEvents(g: GameState): () => void {
  let waka = false;
  const off = [
    g.events.on('DotEaten', (e) => {
      if (e.power) {
        g.audio.play(CLIP.power, { channel: 'sfx' });
      }
      else {
        waka = !waka;
        g.audio.play(waka ? CLIP.wakaA : CLIP.wakaB, { channel: 'sfx', volume: 0.6 });
      }
    }),
    g.events.on('GhostEaten', (e) => {
      g.audio.play(CLIP.ghost, { channel: 'sfx' });
      spawnPopup(g, e.x, e.y, String(e.points), '#5ff');
      sparkle(g, e.x, e.y, [GHOST_COLORS[e.kind as GhostKind], '#2121ff', '#fff'], 14);
    }),
    g.events.on('FruitEaten', (e) => {
      g.audio.play(CLIP.fruit, { channel: 'sfx' });
      spawnPopup(g, e.x, e.y, String(e.points), '#ffb8ff');
    }),
    g.events.on('PacDied', () => g.audio.play(CLIP.death, { channel: 'sfx' })),
    g.events.on('ExtraLife', () => g.audio.play(CLIP.extra, { channel: 'sfx' })),
    g.events.on('LevelCleared', () => g.audio.play(CLIP.win, { channel: 'sfx' })),
  ];
  return () => {
    for (const unsubscribe of off)
      unsubscribe();
  };
}
