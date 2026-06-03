# Flappy Bird — Postmortem

[20 Games Challenge](https://20_games_challenge.gitlab.io/games/flappy/) entry #2.
First game built as we work the challenge list in order (Pong and Asteroids
already existed). ~330 lines of app code across `components.ts`, `game.ts`,
`systems.ts`, `render.ts`, and `main.ts`.

## Goals (from the challenge page)

- [x] A game world with a floor.
- [x] A character that a constant force (gravity) pulls toward the floor.
- [x] Obstacles spawned on the right that slide left in pairs with a vertical gap.
- [x] Recycle/delete obstacles once they leave the screen.
- [x] Collision with floor or obstacles resets the game.
- [x] One point per obstacle passed, displayed on screen.

The flap impulse itself is the implicit core mechanic — gravity pulls the bird
down, a flap sets an upward velocity, and the player threads the gaps.

## What the engine gave us for free

- **`makeVelocityIntegrationSystem`** (`modules/motion`) integrates both the
  bird and every pipe with one system — no per-object movement code. Gravity is
  just a separate system that adds to the bird's `vy` before integration runs;
  the ordering is declared with `runAfter: ['gravity']`.
- **`createInput` + `KeyboardProvider`** gave edge-triggered `justPressed('flap')`
  cleanly, the same way Asteroids consumes `fire`/`reset`.
- **`Canvas2DRenderer`** drew the bird straight from a `RenderableDef` circle.
- **Tags + `queueDestroy`** made off-screen pipe recycling a two-line system.

## What was awkward / what we learned

### 1. One `Renderable` per entity vs. composite shapes

A Flappy pipe is *two* rectangles (above and below the gap) that share one x
position, one velocity, one scoring flag, and recycle together. The engine's
`RenderableDef` is one drawable per entity, so modelling a pair as two rect
entities would have split that shared state across two ids and complicated
recycling/scoring.

Instead each pipe pair is a **single logical entity** carrying `PositionDef`,
`VelocityDef`, and a `PipeDef { gapY, gapHalf, scored }`. The bird and floor go
through `Canvas2DRenderer`; the pipe *bodies* are drawn manually in `render.ts`
by iterating the `PipeTag`. This kept all pipe logic on one entity at the cost
of bypassing the engine renderer for that one shape.

This is the honest tradeoff to note for the backlog: the default renderer has no
notion of a multi-part or "stencil/gap" shape, so composite obstacles either
fan out into multiple entities or get hand-drawn. For a game this small,
hand-drawing was clearly simpler. A future `kind: 'group'`/multi-rect renderable
would let pipes go through the engine path — but that's speculative; nothing here
forced an engine change (rule R1 held: `@pierre/ecs` stayed byte-identical).

### 2. Freeze-on-death without a physics pause

There's no global "pause" switch, so death just zeroes the bird's `vy` and every
pipe's `vx` (`freeze()`), letting the always-on integration system keep running
harmlessly. Pre-start is the mirror image: the bird's velocity stays `0` and no
pipes exist yet, so the same integration system is a no-op until the first flap.

### 3. Circle-vs-AABB lived in app code

Collision is a bird *circle* against pipe/floor *rectangles*. `modules/collision`
ships `circleVsCircle` (used by Asteroids) but the circle-vs-rect test was a
five-line clamp-and-distance helper here. Candidate to promote if the next few
games need it again.

## Stretch goals

Skipped for now (best score is kept in-session but not persisted; no audio, no
parallax). The in-session best score is shown on the game-over overlay.
