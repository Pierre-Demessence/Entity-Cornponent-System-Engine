# Local Pong — Postmortem (Rung 8)

Rung 8 lands. A two-player local Pong example built on `@pierre/ecs`
with zero engine edits. The point of the rung was not Pong itself; it
was proving that player-scoped input with stable player identity can sit
entirely in consumer state and flow through ECS systems cleanly.

Roadmap doc:
[../../../../docs/roadmap/prototype-games-roadmap.md](../../../../docs/roadmap/prototype-games-roadmap.md).
Plan doc:
[../../../../docs/plans/done/local-pong-prototype.md](../../../../docs/plans/done/local-pong-prototype.md).

## What this prototype proved

- The existing input module already supports player-scoped identity at
  the example layer. Two `createInput()` instances backed by the same
  `KeyboardProvider` were enough to model `left` and `right` players as
  separate action streams.
- Systems do not need any engine-global notion of "current player".
  The `PaddleDef.owner` field and `state.inputs[owner]` were sufficient
  to route movement to the correct entity.
- Score works better as a game resource than as an entity component for
  this kind of toy prototype. `state.scores` is simpler than inventing a
  scoreboard entity just to satisfy ECS purity.

## What was awkward

- `createInput().dispose()` also disposes its providers. That's fine for
  teardown, but it means a shared provider cannot be independently owned
  by multiple higher-level input states. The example gets away with it
  because all three inputs die together. If a future local-multiplayer
  consumer needs hot-swappable controllers, provider ownership will need
  a clearer story.
- There is no engine-level concept of a player registry or player slot,
  which is correct for now. The example keeps player identity as the
  string literal union `'left' | 'right'`. If a second local-multiplayer
  consumer appears, that pattern becomes a real promotion candidate.

## What was surprising

- The example did not need any special multiplayer scheduler logic.
  Once each paddle had a stable owner and an input state, the fixed-tick
  ECS loop looked exactly like the single-player rungs.
- Score-as-resource felt obviously right here. Earlier rungs already had
  app-level state outside ECS (timers, selected cards, camera yaw). Pong
  reinforces that "everything must be an entity" is the wrong instinct.

## Engine changes required

None. `packages/ecs/src/` stayed byte-identical.

## LOC budget

The example stays comfortably inside the roadmap budget. Most of the
code is in the four expected slices: game setup, systems, rendering, and
entrypoint wiring.

## Follow-ups (not blocking)

- If another local-multiplayer example lands, revisit whether the engine
  should expose a small player-slot/input-owner helper instead of every
  consumer inventing its own `PlayerId` union.
- If controller hot-swap becomes a real need, split provider disposal
  from input-state disposal so shared providers can outlive a specific
  action map.
