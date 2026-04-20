---
post_title: ECS Engine Examples
author1: pierre
post_slug: ecs-engine-examples
microsoft_alias: n/a
featured_image: n/a
categories: []
tags: [ecs, examples, prototypes]
ai_note: AI-assisted
summary: Example projects that use the @roguelike/ecs engine to validate its domain-neutrality. Each example is a tiny prototype breaking one or more assumptions baked into the roguelike.
post_date: 2026-04-17
---

# ECS Engine Examples

This folder hosts small example projects built on top of `@pierre/ecs`.
They exist to **validate** the engine's claim of being domain-neutral — if
an example needs to modify `packages/ecs/src/`, the engine has a layering
bug and the example is on hold until the bug is fixed.

## Status

**Rungs 1, 2, and 3 landed.** Three examples exist:

- [`snake/`](snake/) — Rung 1 (arcade grid, 4-way keyboard, real-time
  tick). See [snake/POSTMORTEM.md](snake/POSTMORTEM.md).
- [`asteroids/`](asteroids/) — Rung 2 (continuous 2D, momentum physics,
  rotating ship, bullet lifetimes, 3-tier rock splitting, BYO spatial
  via `HashGrid2D`). See [asteroids/POSTMORTEM.md](asteroids/POSTMORTEM.md).
- [`platformer/`](platformer/) — Rung 3 (side-scrolling sandbox,
  gravity + AABB collision resolution, static vs dynamic bodies via
  tags, edge-triggered jump, coin pickup, fall-out respawn). See
  [platformer/POSTMORTEM.md](platformer/POSTMORTEM.md).

The rest of the plan — which examples to build next, in what order, and
what each one proves — lives in
[docs/roadmap/prototype-games-roadmap.md](../../../docs/roadmap/prototype-games-roadmap.md).

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
   into [docs/plans/done/ecs-engine-audit.md](../../../docs/plans/done/ecs-engine-audit.md).

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

```sh
# Install workspace dependencies (first time only)
npm install

# Run a specific example's dev server
npm run dev -w @pierre/ecs-example-<name>

# Build-check a specific example
npm run build -w @pierre/ecs-example-<name>
```

## Related documents

- [Prototype Games Roadmap](../../../docs/roadmap/prototype-games-roadmap.md)
  — the full ladder of planned examples, coverage matrix, and suggested
  order.
- [General-Purpose ECS Roadmap](../../../docs/roadmap/general-purpose-ecs-roadmap.md)
  — the target engine layering these examples validate.
- [ECS Engine Audit](../../../docs/plans/done/ecs-engine-audit.md) — the
  concrete audit items postmortems feed back into.
- [ECS Engine Public Release Strategy](../../../docs/roadmap/ecs-engine-public-release-strategy.md)
  — if the engine ever goes public, these examples ship with it.
