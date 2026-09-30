# Indy 500 (20 Games Challenge #10)

Build rung 10 of the [20 Games Challenge](../../twenty-games-challenge.md) as
`examples/indy-500`. Next in list order; it is the first example to reach the
`steering` module's `seek` / `pursue` / `evade` / `obstacleAvoidance` for AI cars.

## Goals (from the challenge page)

- Top-down car that only turns while moving (forwards or backwards) and
  accelerates / decelerates smoothly
- Controls for up to two players; player 1 can race the clock or another player
- One or more complete-circuit tracks with a finish line, fitting on screen
- Collisions with the track boundary and between cars
- Lap / score counter
- Menus to pick track, number of players, etc.

## Stretch goals taken

- Standard racing: race the clock, or first to N laps (3 / 5 / 10 / 25)
- Crash and Score: a target square that relocates each time it is hit
- Tag: blinking car scores by surviving, the chaser scores by tagging; roles swap
- AI opponent so two-car modes are playable solo (`steering`)

Not taken: the figure-8 bridge track (a 2.5D layering problem that would
prove nothing about the engine surface).

## Engine surface to prove

- `steering` — `seek`, `pursue`, `evade`, `obstacleAvoidance`, `combine` drive the AI cars
- `collision` — `circleVsCircle` for car-vs-car, car-vs-target and tagging
- `math`, `rng`, `input`, `tick`, `transform` as supporting cast

## Checklist

- [x] `track.ts` — closed centerline tracks, `locate` / `pointAt`, pure + tested
- [x] `car.ts` — drive model, wall bounce, car-vs-car response, pure + tested
- [x] `ai.ts` — steering-driven controller
- [x] game state, systems (control, physics, collisions, laps, modes), tested headless
- [x] render + menu + HUD + main loop
- [x] Register: `manifest.ts`, `loaders.ts`, `hub/package.json`
- [x] Tick #10 in `twenty-games-challenge.md`
- [x] `npm install` workspace link, `npm run docs:api` / `docs:usage`; lint, typecheck, tests green
- [x] Move this plan to `docs/plans/done/`
