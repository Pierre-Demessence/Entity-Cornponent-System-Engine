# ECS Engine Examples

This folder hosts small example projects built on top of `@pierre/ecs`.
They exist to **validate** the engine's claim of being domain-neutral — if
an example needs to modify `src/`, the engine has a layering
bug and the example is on hold until the bug is fixed.

## Examples

Each subfolder of this directory is one runnable example. Open the folder
to read its code; what each one proves (the engine assumption it breaks)
is tracked by rung in the
[prototype roadmap](../docs/roadmap/prototype-games-roadmap.md), and the
[20 Games Challenge](https://20_games_challenge.gitlab.io/) entries are
tracked in the [challenge roadmap](../docs/roadmap/twenty-games-challenge.md).

Engine gaps surfaced while building these examples are recorded centrally
in the [engine gap ledger](../docs/roadmap/engine-gap-ledger.md).

## Rules for examples

These mirror the guiding rules from the prototype roadmap. They are
non-negotiable:

1. **The engine stays byte-identical.** An example imports `@pierre/ecs`
   unchanged. If it can't, stop the example, land the engine change
   through a normal plan/review loop, resume.

2. **One mechanic, one screen.** No menus, no save system, minimal
   polish. Add audio only when it is part of the mechanic being proven.
   Target: < 500–1000 lines of app code per example (see the per-rung
   targets in the roadmap).

3. **Each example must break at least one engine assumption.** Otherwise
   it proves nothing. See the roadmap's "ladder" section for which
   assumption each planned example breaks.

4. **Consumable via the public import path.** Examples depend on
   `@pierre/ecs` via the same path external users would use, not via a
   relative path into `../../src`. This catches packaging mistakes
   before any public release.

5. **Log engine gaps.** After each example, record anything `@pierre/ecs`
   lacked (or an existing surface that had to be extended) in the
   [engine gap ledger](../docs/roadmap/engine-gap-ledger.md) — symptom
   only. A separate triage pass decides which gaps become modules.

## Layout (once examples start landing)

```text
packages/ecs/examples/
├── README.md                 ← this file
├── snake/                    ← Rung 1
│   ├── package.json          ← name: @pierre/ecs-example-snake
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       └── main.ts
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
