# ECS Engine Examples

This folder hosts small example projects built on top of `@pierre/ecs`.
They exist to **validate** the engine's claim of being domain-neutral — if
an example needs to modify `packages/ecs/src/`, the engine has a layering
bug and the example is on hold until the bug is fixed.

## Status

**Rungs 1, 2, 3, 4, 5, 6, 7, and 8 landed.** Eight examples exist:

- [`snake/`](snake/) — Rung 1 (arcade grid, 4-way keyboard, real-time
  tick). See [snake/POSTMORTEM.md](snake/POSTMORTEM.md).
- [`asteroids/`](asteroids/) — Rung 2 (continuous 2D, momentum physics,
  rotating ship, bullet lifetimes, 3-tier rock splitting, BYO spatial
  via `HashGrid2D`). See [asteroids/POSTMORTEM.md](asteroids/POSTMORTEM.md).
- [`platformer/`](platformer/) — Rung 3 (side-scrolling sandbox,
  gravity + AABB collision resolution, static vs dynamic bodies via
  tags, edge-triggered jump, coin pickup, fall-out respawn). See
  [platformer/POSTMORTEM.md](platformer/POSTMORTEM.md).
- [`top-down-shooter/`](top-down-shooter/) — Rung 4 (twin-stick arena,
  continuous mouse aim, held-fire bullets, scaled enemy swarms). See
  [top-down-shooter/POSTMORTEM.md](top-down-shooter/POSTMORTEM.md).
- [`card-battler/`](card-battler/) — Rung 5 (turn-based card combat,
  DOM renderer, manual tick, drag-to-play). See
  [card-battler/POSTMORTEM.md](card-battler/POSTMORTEM.md).
- [`rhythm/`](rhythm/) — Rung 6 (4-lane rhythm, tick source driven by
  `AudioContext.currentTime`, input timestamped to audio clock). See
  [rhythm/POSTMORTEM.md](rhythm/POSTMORTEM.md).
- [`platformer-3d/`](platformer-3d/) — Rung 7 (3D platformer via
  three.js, custom 3D AABB kinematics, chase cam, coins — defining
  test that `@pierre/ecs` is not secretly 2D). See
  [platformer-3d/POSTMORTEM.md](platformer-3d/POSTMORTEM.md).
- [`local-pong/`](local-pong/) — Rung 8 (local multiplayer Pong,
   player-scoped input identity, score as game state resource). See
   [local-pong/POSTMORTEM.md](local-pong/POSTMORTEM.md).

The rest of the plan — which examples to build next, in what order, and
what each one proves — lives in the consuming repo's prototype roadmap.

## Rules for examples

These mirror the guiding rules from the prototype roadmap. They are
non-negotiable:

1. **The engine stays byte-identical.** An example imports `@pierre/ecs`
   unchanged. If it can't, stop the example, land the engine change
   through a normal plan/review loop, resume.

2. **One mechanic, one screen.** No menus, no save system, no audio, no
   polish. Target: < 500–1000 lines of app code per example (see the
   per-rung targets in the roadmap).

3. **Each example must break at least one engine assumption.** Otherwise
   it proves nothing. See the roadmap's "ladder" section for which
   assumption each planned example breaks.

4. **Consumable via the public import path.** Examples depend on
   `@pierre/ecs` via the same path external users would use, not via a
   relative path into `../../src`. This catches packaging mistakes
   before any public release.

5. **Postmortem required.** After each example, write a one-page note in
   the example's own `POSTMORTEM.md` covering: what engine API was
   missing, what felt awkward, what was surprising. Findings feed back
   into the consumer's engine-audit plan.

## Layout (once examples start landing)

```
packages/ecs/examples/
├── README.md                 ← this file
├── snake/                    ← Rung 1
│   ├── package.json          ← name: @pierre/ecs-example-snake
│   ├── index.html
│   ├── vite.config.ts
│   ├── src/
│   │   └── main.ts
│   └── POSTMORTEM.md
├── asteroids/                ← Rung 2
│   └── ...
└── platformer-3d/            ← Rung 7
    └── ...
```

## Running an example

Workspaces are configured (root `package.json` has
`"workspaces": ["packages/*", "packages/ecs/examples/*"]`).

### Hub mode (single dev server)

Run all examples from one landing page:

```sh
# From repository root
npm run dev:ecs-examples
```

This starts the examples hub at `packages/ecs/examples/hub/` and lets
you launch the landed examples from one page.

### Standalone mode (per example)

```sh
# Install workspace dependencies (first time only)
npm install

# Run a specific example's dev server
npm run dev -w @pierre/ecs-example-<name>

# Build-check a specific example
npm run build -w @pierre/ecs-example-<name>
```

## Related documents

- [`../docs/README.md`](../docs/README.md) — engine primitives index.
- [`../docs/extending-the-engine.md`](../docs/extending-the-engine.md) —
  Rule-of-Three promotion policy and failure modes to avoid.
