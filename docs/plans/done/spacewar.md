# Spacewar! — 20 Games Challenge #9

Two-player local-multiplayer space duel: two ships orbit a central star with
gravity, screen-wrap, fire torpedoes, and collide for score.

## Goals (from [challenge page](https://20_games_challenge.gitlab.io/games/spacewar/))

- [x] Two ships, each player-controlled: rotate + thrust (accelerate in facing direction)
- [x] Torpedoes: fire in facing direction, disappear after short lifetime
- [x] Collisions: ship↔ship → both lose; torpedo↔ship → other wins; torpedo↔torpedo → both destroyed
- [x] Screen wrapping (toroidal topology)
- [x] Central star with gravity (everything slowly falls toward it)
- [x] Particles on destruction
- [x] Register in hub + update twenty-games-challenge.md checklist

## Architecture

Follows the asteroids/local-pong pattern:
- `main.ts` — bootstrap: canvas, input, scheduler, tick runner, render loop
- `game.ts` — constants, world factory, spawn helpers, reset, despawn, GameState type
- `render.ts` — canvas2d renderer + HUD (star, scores, game-over overlay)
- `components/` — barrel re-exports + local tags
- `systems/` — input, gravity, collision, thrust-flame

### New game-specific code (local, not engine)

| System | What it does |
|--------|-------------|
| `gravity` | Accelerates every non-star entity toward the star centre each tick (inverse-square; clamped min distance) |
| `input` | Two `InputState` instances (P1: A/D/W/S, P2: Arrows); rotate, thrust, fire per ship |
| `collision` | Broadphase (spatial grid) + narrowphase (circle-vs-circle): torpedo↔ship, ship↔ship, torpedo↔torpedo |
| `thrust-flame` | Opacity toggle on thrust-flame entities (position/rotation via `modules/attach`) |

### Engine modules consumed

`modules/motion` (wrap), `modules/collision` (circleVsCircle, makeTriggerSystem),
`modules/cooldown`, `modules/lifetime`, `modules/particles` (burst),
`modules/spatial` (ContinuousHashGrid2D), `modules/transform`,
`modules/render-canvas2d` (Canvas2DRenderer), `modules/attach`,
`modules/input` (two createInput instances), `modules/tick`.

### Engine gaps surfaced

None expected — Spacewar! is a superset of asteroids with gravity + second player,
both already solved patterns in the engine.
