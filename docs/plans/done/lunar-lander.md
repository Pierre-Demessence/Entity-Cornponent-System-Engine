# Lunar Lander (20 Games Challenge #11)

Build rung 11 of the [20 Games Challenge](../../twenty-games-challenge.md) as
`examples/lunar-lander`. Chosen from [engine usage](../../agent/engine-usage.md):
it reaches modules whose value exports no example references yet.

## Goals (from the challenge page)

- Rotate + thrust lander under gravity, limited fuel
- Rough terrain with flat landing pads worth different multipliers
- Safe landing needs low speed and an upright angle; otherwise a crash
- Score, fuel and speed HUD

## Engine surface to prove

- `noise` — `perlin1D`, `fbm1D`, `valueNoise1D` build the terrain profile from a per-run seed
- `math` — `remap`, `smoothstep`, `approximately`, `clamp`, `lerpAngle`
- `easing` — camera zoom, HUD pulse, banner pop, particle fade/shrink curves
- `camera` — altitude-driven zoom, follow + limits, `worldToView` for off-screen pad markers
- `animation` — `makeSpriteAnimation` + `makeSpriteAnimationSystem` + `currentFrame` for the thruster flame
- `save` — `SaveStorage` persists a run leaderboard; `createEnvelope` / `verifyEnvelope` / `computeChecksum` drop tampered entries
- `particles`, `lifetime`, `motion`, `input`, `tick`, `render-canvas2d`, `rng` as supporting cast

## Checklist

- [x] `terrain.ts` — seeded heightfield with carved pads, pure + tested
- [x] `landing.ts` — touchdown verdict (speed, angle, pad, score), pure + tested
- [x] components, game state, systems (input, gravity/thrust, motion, camera zoom, contact, flame)
- [x] `save.ts` — leaderboard with envelope verification, tested
- [x] render + HUD + main loop
- [x] Register: `manifest.ts`, `loaders.ts`, `hub/package.json`
- [x] Tick #11 in `twenty-games-challenge.md`
- [x] `npm run docs:api` / `docs:usage` regenerated; lint, typecheck, tests green
- [x] Move this plan to `docs/plans/done/`
