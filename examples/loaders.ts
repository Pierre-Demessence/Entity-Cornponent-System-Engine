import type { ExampleId } from './manifest';

/** Contract every prototype's `src/main.ts` satisfies: mount into `container`, return a teardown. */
export interface ExampleModule {
  start: (container: HTMLElement) => () => void;
}

/**
 * One literal `import()` per prototype, so the bundler can split each into its
 * own lazy chunk. Typed over the manifest's ids, so a prototype missing here is
 * a type error.
 */
export const LOADERS: Record<ExampleId, () => Promise<ExampleModule>> = {
  'asteroids': () => import('@pierre/ecs-example-asteroids/src/main.ts'),
  'boids': () => import('@pierre/ecs-example-boids/src/main.ts'),
  'breakout': () => import('@pierre/ecs-example-breakout/src/main.ts'),
  'card-battler': () => import('@pierre/ecs-example-card-battler/src/main.ts'),
  'critters': () => import('@pierre/ecs-example-critters/src/main.ts'),
  'doom': () => import('@pierre/ecs-example-doom/src/main.ts'),
  'flappy': () => import('@pierre/ecs-example-flappy/src/main.ts'),
  'frogger': () => import('@pierre/ecs-example-frogger/src/main.ts'),
  'game-of-life': () => import('@pierre/ecs-example-game-of-life/src/main.ts'),
  'jetpack': () => import('@pierre/ecs-example-jetpack/src/main.ts'),
  'local-pong': () => import('@pierre/ecs-example-local-pong/src/main.ts'),
  'pacman': () => import('@pierre/ecs-example-pacman/src/main.ts'),
  'parallel-kernel': () => import('@pierre/ecs-example-parallel-kernel/src/main.ts'),
  'platformer': () => import('@pierre/ecs-example-platformer/src/main.ts'),
  'platformer-3d': () => import('@pierre/ecs-example-platformer-3d/src/main.ts'),
  'portal': () => import('@pierre/ecs-example-portal/src/main.ts'),
  'rhythm': () => import('@pierre/ecs-example-rhythm/src/main.ts'),
  'river-raid': () => import('@pierre/ecs-example-river-raid/src/main.ts'),
  'roguelike': () => import('@pierre/ecs-example-roguelike/src/main.ts'),
  'rpg': () => import('@pierre/ecs-example-rpg/src/main.ts'),
  'snake': () => import('@pierre/ecs-example-snake/src/main.ts'),
  'solitaire': () => import('@pierre/ecs-example-solitaire/src/main.ts'),
  'space-invaders': () => import('@pierre/ecs-example-space-invaders/src/main.ts'),
  'spacewar': () => import('@pierre/ecs-example-spacewar/src/main.ts'),
  'starfighter': () => import('@pierre/ecs-example-starfighter/src/main.ts'),
  'stealth-guard': () => import('@pierre/ecs-example-stealth-guard/src/main.ts'),
  'stress-storage': () => import('@pierre/ecs-example-stress-storage/src/main.ts'),
  'tilemap': () => import('@pierre/ecs-example-tilemap/src/main.ts'),
  'top-down-shooter': () => import('@pierre/ecs-example-top-down-shooter/src/main.ts'),
  'woodcutter': () => import('@pierre/ecs-example-woodcutter/src/main.ts'),
  'worker-offload': () => import('@pierre/ecs-example-worker-offload/src/main.ts'),
};
