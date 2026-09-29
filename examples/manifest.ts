/**
 * The catalogue of runnable prototypes under `examples/`: one entry per
 * prototype, and the only place their titles, summaries and groupings are
 * written down. The hub app and the documentation site's Examples section both
 * read it; `examples/loaders.ts` holds the matching `import()` per id.
 *
 * Adding a prototype: add an entry here, a loader in `loaders.ts`, and the
 * workspace to `examples/hub/package.json`. `scripts/examples.test.ts` fails
 * until all three agree with the `examples/` directory.
 */

/** Groups in the order the site's sidebar lists them. */
export const EXAMPLE_GROUPS = [
  {
    id: 'early',
    blurb: 'Built roughly in order, each to prove something the ones before it could not.',
    title: 'The early rungs',
  },
  {
    id: 'challenge',
    blurb: 'One game per rung of the 20 Games Challenge, in challenge order.',
    title: '20 Games Challenge',
  },
  {
    id: 'subsystem',
    blurb: 'Playgrounds where one module, or one rig, is the whole point.',
    title: 'Proving a subsystem',
  },
  {
    id: 'harness',
    blurb: 'Not games: these measure the engine, or stress one part of it.',
    title: 'Harnesses',
  },
] as const;

export type ExampleGroupId = (typeof EXAMPLE_GROUPS)[number]['id'];

export interface ExampleEntry {
  /** Directory name under `examples/`; the package is `@pierre/ecs-example-<id>`. */
  readonly id: string;
  /** Rung number in the 20 Games Challenge, for the games built to it. */
  readonly challenge?: number;
  /** Input the prototype responds to, as a short human-readable line. */
  readonly controls: string;
  readonly group: ExampleGroupId;
  /** Set when the prototype's headline feature needs cross-origin isolation. */
  readonly isolation?: string;
  /** Engine modules the prototype imports, by name under `src/modules/`. */
  readonly modules: readonly string[];
  /** One plain-text sentence (or two) on what the prototype demonstrates. */
  readonly summary: string;
  readonly title: string;
}

export const EXAMPLES = [
  {
    id: 'snake',
    controls: 'Arrows/WASD move, R restart after death',
    group: 'early',
    modules: ['input', 'rng', 'spatial', 'tick', 'transform'],
    summary: 'Arcade grid movement with event-driven growth and restart flow.',
    title: 'Snake',
  },
  {
    id: 'asteroids',
    controls: 'Left/Right rotate, Up thrust, Space fire, R reset',
    group: 'early',
    modules: ['attach', 'collision', 'cooldown', 'input', 'lifetime', 'motion', 'particles', 'render-canvas2d', 'spatial', 'tick', 'transform'],
    summary: 'Continuous motion, thrust + rotation, bullets, rock splitting.',
    title: 'Asteroids',
  },
  {
    id: 'platformer',
    controls: 'Left/Right move, Space/Up jump',
    group: 'early',
    modules: ['collision', 'input', 'kinematics', 'render-canvas2d', 'spatial', 'tick', 'transform'],
    summary: 'Side-view gravity + AABB kinematics, pickups, and respawn.',
    title: 'Platformer',
  },
  {
    id: 'top-down-shooter',
    controls: 'WASD move, mouse aim, LMB/Space fire, R restart',
    group: 'early',
    modules: ['asset-loader', 'audio', 'collision', 'cooldown', 'input', 'lifetime', 'math', 'motion', 'render-canvas2d', 'spatial', 'spawner', 'tick', 'transform'],
    summary: 'Twin-stick arena: continuous mouse aim, held-fire bullets, enemy swarms at scale.',
    title: 'Top-Down Shooter',
  },
  {
    id: 'card-battler',
    controls: 'LMB drag cards onto enemy, End Turn to resolve',
    group: 'early',
    modules: ['drag-drop', 'input', 'pile', 'render-dom', 'tick', 'transform'],
    summary: 'Turn-based card combat: DOM renderer, manual tick, drag-to-play — proves the renderer interface is not canvas-coupled.',
    title: 'Card Battler',
  },
  {
    id: 'rhythm',
    controls: 'Click to start audio, D/F/J/K hit lanes, R reset',
    group: 'early',
    modules: ['easing', 'input', 'math'],
    summary: 'Four-lane rhythm: tick source driven by AudioContext.currentTime, not performance.now — first external-clock test.',
    title: 'Rhythm',
  },
  {
    id: 'platformer-3d',
    controls: 'WASD move, Space jump, click to capture mouse for camera (Esc to release)',
    group: 'early',
    modules: ['camera-3d', 'collision', 'collision-3d', 'input', 'kinematics-3d', 'math', 'render-scene3d', 'tick', 'transform-3d'],
    summary: '3D platformer via three.js with custom 3D AABB kinematics — the defining test that @pierre/ecs is not secretly 2D.',
    title: '3D Platformer',
  },
  {
    id: 'local-pong',
    controls: 'Player 1 W/S, Player 2 Arrow Up/Down, R restart',
    group: 'early',
    modules: ['collision', 'input', 'math', 'render-canvas2d', 'tick', 'transform'],
    summary: 'Local multiplayer Pong with player-scoped keyboard input and score kept as game state, not entity data.',
    title: 'Local Pong',
  },
  {
    id: 'tilemap',
    controls: 'Scroll = zoom · drag = pan',
    group: 'early',
    modules: ['asset-loader', 'camera', 'math', 'render-canvas2d', 'texture-atlas', 'tilemap', 'tmx', 'transform'],
    summary: 'First sprite/texture-atlas consumer: parses a Tiled TMX map (base64+zlib) and renders every tile as a sprite entity, layered via RenderOrderDef.',
    title: 'Tilemap (Tiled TMX)',
  },
  {
    id: 'solitaire',
    controls: 'Click stock to deal · drag to move · double-click to send to a foundation · New deal to reshuffle',
    group: 'early',
    modules: ['asset-loader', 'audio', 'collision', 'drag-drop', 'input', 'pile', 'render-canvas2d', 'rng', 'texture-atlas', 'transform'],
    summary: 'First interactive canvas scene: draw-1 Klondike with per-frame card dragging, dynamic z-order via RenderOrderDef, and world-space hit-testing over a texture atlas.',
    title: 'Solitaire (Klondike)',
  },
  {
    id: 'rpg',
    controls: 'WASD/arrows move · Space/E talk to nearby NPCs',
    group: 'early',
    modules: ['animation', 'asset-loader', 'camera', 'input', 'render-canvas2d', 'texture-atlas', 'tilemap', 'tmx', 'transform'],
    summary: 'First camera-follow and first NPC dialogue scene: walks a Tiled dungeon (CSV + external .tsx + flipped tiles) with a follow camera, wall collision, and a nine-slice dialogue box.',
    title: 'Top-down RPG',
  },
  {
    id: 'flappy',
    challenge: 2,
    controls: 'Click / Space / Up to flap, R to restart',
    group: 'challenge',
    modules: ['collision', 'input', 'motion', 'render-canvas2d', 'spawner', 'tick', 'transform'],
    summary: 'Gravity + flap impulse, scrolling recycled pipe pairs, circle-vs-AABB collision, and score-on-pass.',
    title: 'Flappy Bird',
  },
  {
    id: 'breakout',
    challenge: 3,
    controls: 'Arrows/A D or mouse move paddle, Space/Click launch, R restart',
    group: 'challenge',
    modules: ['collision', 'input', 'math', 'motion', 'render-canvas2d', 'tick', 'transform'],
    summary: 'Circle-vs-AABB brick field with axis-of-least-penetration bounce response, paddle english, lives, escalating ball speed, and a persisted high score.',
    title: 'Breakout',
  },
  {
    id: 'jetpack',
    challenge: 4,
    controls: 'Hold Space / Up / mouse to fly, R restart',
    group: 'challenge',
    modules: ['collision', 'input', 'lifetime', 'math', 'motion', 'particles', 'render-canvas2d', 'spawner', 'tick', 'transform'],
    summary: 'Endless right-to-left scroller with hold-to-rise gravity, script-spawned recycled zappers, distance score, machine-gun bullets and particle juice.',
    title: 'Jetpack Joyride',
  },
  {
    id: 'space-invaders',
    challenge: 5,
    controls: 'Left/Right or A D move, Space fire, R restart',
    group: 'challenge',
    modules: ['collision', 'cooldown', 'input', 'lifetime', 'math', 'motion', 'particles', 'render-canvas2d', 'spawner', 'tick', 'transform'],
    summary: 'Beat-stepped alien fleet that drops and reverses at the walls and speeds up as it thins, single-rocket fire, bombs the player can shoot down, destructible bunkers, a bonus mothership, lives and waves.',
    title: 'Space Invaders',
  },
  {
    id: 'frogger',
    challenge: 6,
    controls: 'Arrows / W A S D to hop, R restart',
    group: 'challenge',
    modules: ['collision', 'input', 'lifetime', 'math', 'motion', 'particles', 'render-canvas2d', 'tick', 'transform'],
    summary: 'Tile-discrete hopping across recycled traffic lanes and a river of logs and diving turtles, carried platform-rider kinematics, and five lilypads to fill.',
    title: 'Frogger',
  },
  {
    id: 'river-raid',
    challenge: 7,
    controls: '← → move, ↑ accelerate, ↓ brake, Space fire, R restart',
    group: 'challenge',
    modules: ['collision', 'cooldown', 'input', 'math', 'motion', 'tick', 'transform'],
    summary: 'Vertically-scrolling jet fighter up a procedurally-generated river with variable-width banks, branching streams, bridges as checkpoints, enemy boats/helicopters/jets, and a draining fuel gauge.',
    title: 'River Raid',
  },
  {
    id: 'spacewar',
    challenge: 9,
    controls: 'P1: A/D rotate, W thrust, S fire  |  P2: ← → rotate, ↑ thrust, ↓ fire  |  R restart',
    group: 'challenge',
    modules: ['asset-loader', 'attach', 'audio', 'collision', 'cooldown', 'input', 'lifetime', 'math', 'motion', 'particles', 'render-canvas2d', 'spatial', 'tick', 'transform'],
    summary: 'Two-player local space duel with star gravity, screen wrapping, torpedoes, and particles — the very first video game.',
    title: 'Spacewar!',
  },
  {
    id: 'doom',
    challenge: 24,
    controls: 'Click to capture · WASD move · Space jump · LMB fire · 1/2 weapon · R restart',
    group: 'challenge',
    modules: ['camera-3d', 'collision-3d', 'input', 'kinematics-3d', 'math', 'motion-3d', 'render-scene3d', 'tick', 'transform-3d'],
    summary: 'First-person arena shooter — a 3D controller with verticality (stairs and a moving elevator), billboard-sprite enemies with line-of-sight AI, hitscan and projectile weapons, a health/ammo HUD, and pickups.',
    title: 'Doom',
  },
  {
    id: 'portal',
    challenge: 27,
    controls: 'Click to capture · WASD move · Space jump · E grab/drop · LMB/RMB portals · R restart',
    group: 'challenge',
    modules: ['camera-3d', 'collision-3d', 'input', 'kinematics-3d', 'math', 'render-scene3d', 'tick', 'transform-3d'],
    summary: 'Real 3D portals — recursive see-through rendering, momentum-preserving teleport, floor and ceiling portals, a companion cube, and a pressure-plate door.',
    title: 'Portal',
  },
  {
    id: 'starfighter',
    controls: 'W/S throttle · A/D roll · move reticle to steer · LMB/Space fire · R reset',
    group: 'subsystem',
    modules: ['camera-3d', 'collision-3d', 'input', 'math', 'motion-3d', 'render-scene3d', 'rng', 'tick', 'transform-3d'],
    summary: 'Third-person space flight: aim-to-steer attitude control (quaternion orientation, rate-based turns), throttle-only motion, a banking chase camera — proves the camera rig is neither yaw-only nor first-person-locked.',
    title: 'Starfighter',
  },
  {
    id: 'boids',
    controls: 'Move the cursor to scatter the flock',
    group: 'subsystem',
    modules: ['input', 'motion', 'spatial', 'steering', 'tick', 'transform'],
    summary: 'Steering-behaviours playground: 140 boids driven purely by composed Reynolds steering — separation, alignment and cohesion plus wander, cursor-flee and food-arrive, with neighbours from a spatial hash grid.',
    title: 'Boids (steering)',
  },
  {
    id: 'stealth-guard',
    controls: 'WASD / arrows to sneak, R reset',
    group: 'subsystem',
    modules: ['collision', 'fsm', 'input', 'math', 'motion', 'steering', 'tick', 'transform'],
    summary: 'FSM playground: guards run a 5-state machine (patrol → suspicious → chase → search → return) driven by a vision cone and line-of-sight; the chase state composes modules/steering.',
    title: 'Stealth Guard (FSM)',
  },
  {
    id: 'critters',
    controls: 'Move the cursor to scare the critters',
    group: 'subsystem',
    modules: ['behavior-tree', 'input', 'math', 'motion', 'steering', 'tick', 'transform'],
    summary: 'Behaviour-tree playground: critters each tick the same reactive tree — a selector over prioritised needs (flee threat > eat when hungry > sleep when tired > wander) — with a per-critter blackboard. Shows why a tree beats a state machine for layered priorities.',
    title: 'Critters (behaviour tree)',
  },
  {
    id: 'woodcutter',
    controls: 'Watch — no input',
    group: 'subsystem',
    modules: ['goap', 'math', 'motion', 'steering', 'tick', 'transform'],
    summary: 'GOAP planning playground: workers get actions (get axe, chop, deliver) with preconditions and effects and a goal, and an A* planner sequences them. After the first log a worker keeps its axe, so the planner drops the GetAxe step — the same goal, a different plan.',
    title: 'Woodcutter (GOAP)',
  },
  {
    id: 'stress-storage',
    controls: 'Slider = entity count, checkbox = SoA storage',
    group: 'harness',
    modules: ['transform'],
    summary: 'Storage benchmark: the same integrate-and-wrap sim over N entities two ways — the ECS Map store against flat SoA typed arrays — with isolated sim, render and frame timings and a frame-time graph.',
    title: 'Storage stress (SoA vs Map)',
  },
  {
    id: 'worker-offload',
    controls: 'Job-size slider, "Run in worker" checkbox, Run job button',
    group: 'harness',
    modules: ['worker-pool'],
    summary: 'Main-thread-stall demo: a heavy CPU job on the main thread freezes the page and spikes the frame-time graph; in a Web Worker via modules/worker-pool the dots keep drifting smoothly.',
    title: 'Worker offload (no stall)',
  },
  {
    id: 'parallel-kernel',
    controls: 'Entities slider, Kernel-K slider',
    group: 'harness',
    isolation: 'Its parallel mode needs cross-origin isolation (SharedArrayBuffer), which static hosting such as GitHub Pages cannot provide. Here it runs single-threaded; run it locally with `npm run dev -w @pierre/ecs-example-parallel-kernel` to try the parallel mode.',
    modules: ['transform'],
    summary: 'Core-bound benchmark: a heavy O(n·K) per-entity kernel (K attractors) run single-threaded over the columnar store. Raise entities and K until the sim dominates the frame.',
    title: 'Parallel kernel (core-bound)',
  },
] as const satisfies readonly ExampleEntry[];

export type ExampleId = (typeof EXAMPLES)[number]['id'];
