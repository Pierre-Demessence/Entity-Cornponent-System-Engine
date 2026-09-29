# Example module adoption sweep

Migrate examples off hand-rolled code the engine already ships (capability
`PRESENT`, consumer hand-rolls). Genuinely missing capabilities were logged in
the [gap ledger](../../roadmap/engine-gap-ledger.md) instead and stay local here.
Behaviour-preserving: each game must play the same after the swap.

## Shapes

- [x] `SizeDef` → `ShapeAabbDef` (local-pong, space-invaders, frogger, river-raid, jetpack)
- [x] starfighter `RadiusDef` → `ShapeSphere3Def`

## Timers

- [x] river-raid module-level `_enemyTimer` / `_depotTimer` → `Spawner` on game state; its module-level LCG → `makeSeededRng`
- [x] space-invaders `fleetStepTimerMs` → `Spawner`
- [x] frogger / river-raid `deathTimerMs`, frogger `levelFlashMs` → `Timer`
- [x] doom `fireTimer` / `ai.attackTimer` → `Cooldown`, `tracer.ttl` → `Timer`, `Projectile.ttl` → `LifetimeDef`
- [x] starfighter `fireTimer` → `Cooldown`, `spawnTimer` → `Spawner`, `Bullet.ttl` → `LifetimeDef`
- [x] ~~woodcutter chop / drop `timer` → `Timer`~~ — dropped: it is one elapsed accumulator shared by two actions with different thresholds, not a fixed-duration countdown, so `Timer` does not fit without contortion

## Input

- [x] flappy, breakout, space-invaders, frogger, starfighter, doom, portal: raw mouse/pointer listeners → `PointerProvider` + `Pointer.*` in the action map
- [x] snake, rhythm: raw `keyboard.subscribe` switches → `InputMap` (`createInput` / `createEventInput`)

## Loops

- [x] boids, critters, stealth-guard, woodcutter, snake, solitaire: raw rAF render loop → `AnimationFrameTickSource`
- [x] rpg: hand-rolled frame loop → `Scheduler` + `TickRunner` + tick sources

## Per-example

- [x] rpg: per-direction `SpriteAnimation` swap → `SpriteAnimatorDef` + `SpriteClipRegistry` + `playClip`
- [x] local-pong: hand-integrated motion → `makeVelocityIntegrationSystem`
- [x] jetpack: bespoke particle tag + `spawnParticle` → `modules/particles` (`burst`; bullets keep a plain `LifetimeDef`)
- [x] starfighter: spherical clamp → `vec3ClampLength` / `vec3Reflect`; turn ease → `vec3Lerp`; deadzone → `inverseLerp` / `clamp01`
- [x] stealth-guard: vision-cone angle wrap → `wrap`
- [x] asteroids: speed cap → `truncate`
- [x] breakout: paddle hit test → `aabbVsCircle`
- [x] top-down-shooter: FPS meter → `FrameStats`
- [x] rhythm: numeric `hit` flag → string state

## Wrap-up

- [x] `examples/manifest.ts` module lists match the new imports
- [x] `npm run docs:usage` regenerated
- [x] Ledger consumer stamps re-pointed at post-migration lines
- [x] Gate green: `npm run lint`, `npm run typecheck`, `npm run typecheck:examples`, `npm test`
