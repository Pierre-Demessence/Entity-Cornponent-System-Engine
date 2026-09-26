# AGENTS.md

Project-specific overrides for AI coding agents working in this repo.
Supplements the global instructions in `~/.copilot/instructions/`.

## Project maturity: pre-1.0, no external consumers

This is `@pierre/ecs`, a TypeScript ECS engine, currently consumed only
by sibling-repo and in-repo prototypes:

- `Roguelike/` (sibling repo, `file:` install)
- `examples/asteroids`, `examples/snake`, `examples/platformer`,
  `examples/platformer-3d`, `examples/local-pong`, `examples/rhythm`,
  `examples/top-down-shooter`, `examples/card-battler`,
  `examples/hub` — all consume `@pierre/ecs` from this workspace.

No external (off-Pierre) consumers. No frozen public API. No published
release. Breaking the engine surface across all consumers in a single
commit is the *cheap* path while this is true. Once a real external
consumer appears, this file gets revisited.

## Prototype phase: validate shape, not surface stability

The priority is to get each primitive's **shape** right — for novel shapes,
validated by prototypes (does it survive a genre shift?); for standard
subsystems, taken from **external canon** up front — not to lock down a
stable surface. This means:

- The sliding-scale promotion rule in [`docs/extending-the-engine.md`](docs/extending-the-engine.md)
  is canon. New core or module additions go through it. Internal
  consumers and external canon are interchangeable shape-evidence:
  unanimous universal canon ships with 0 consumers, solid canon with 1,
  a novel shape needs 2. These examples are deliberately generic, so a
  gap one of them hits is strong generality signal — don't reflexively
  defer canon to "wait for a second consumer". A primitive whose shape
  canon settles is **Ready** in the backlog — authorized to build, gated
  only on a build slot, never on evidence.
- **Canon-complete over incremental.** For a recognized canonical
  subsystem (a 2D camera, a scalar-math library, a collision narrowphase),
  build the *canon-complete* surface in one pass — the operations every
  major engine ships — not the minimal slice one consumer happens to call.
  Strong external canon (Godot/Unity/Bevy/…) is sufficient justification on
  its own; consumers **validate** a shape, they do **not gate** its
  existence. Half-baked / under-promoted primitives are the failure mode
  this project actually suffers from. Only genuinely *novel* (non-canon)
  shapes wait for a second consumer.
- Each prototype in `examples/` is a first-class engine consumer, not
  throwaway demo code. Engine gaps it surfaces are logged in
  [`docs/roadmap/engine-gap-ledger.md`](docs/roadmap/engine-gap-ledger.md),
  which a triage pass promotes into
  [`docs/roadmap/ecs-module-backlog.md`](docs/roadmap/ecs-module-backlog.md).
- Aggressive renames, signature changes, and cross-module refactors
  are encouraged when shape-validation reveals a better fit. Migrate
  every consumer in the same commit.
- Don't preserve compatibility for compatibility's sake. The cheap
  window to fix a wrong shape is *now*.

**Override the conservative defaults from `taming-copilot.instructions.md`
("Surgical Code Modification", "Preserve Existing Code", "Minimal
Necessary Changes", "Integrate, Don't Replace"):**

- When migrating a symbol to a new location, **delete** the old file
  in the same change. Never leave a single-symbol re-export shim "for
  stable import paths". Aggregating barrels (e.g. `src/index.ts`,
  `src/modules/<name>/index.ts`) that re-export from many sibling
  files are NOT relays — keep them. The rule applies only to
  single-symbol passthrough files.
- When renaming, rename everywhere in one pass — including consumer
  prototypes in `examples/` and the sibling `Roguelike/` repo if the
  symbol is exported. No parallel old/new names, no deprecation
  periods, no `@deprecated` JSDoc.
- **No git worktrees. Work on the current branch** unless explicitly
  told to create a new one. Don't branch off unless asked.

The cost-benefit of "minimum diff" is calibrated for production:
review burden, frozen wire formats, bisect history. None of that
applies here. Once shipped externally, the same cleanup costs months
of deprecation cycles — update this file then and revert to the
conservative defaults.

## Architectural invariants

These are not preferences; they're load-bearing structure. Don't break
them without a plan and a peer review.

- **Modules are tree-shakeable subpath exports.** Every module under
  `src/modules/<name>/` ships as `@pierre/ecs/modules/<name>` via the
  `exports` map in `package.json`. Modules depend on core primitives
  only. **No module imports from `@pierre/ecs` itself**, and no module
  imports from another module unless that dependency is documented in
  the module's own README.
- **Core (`src/`) is domain-neutral.** Zero references to game-shape
  concepts (no "player", "enemy", "tile", "turn"). If a primitive in
  core mentions a genre concept, it's a leak — demote it.
- **Tests live alongside source.** `*.test.ts` next to the file under
  test, not in a separate tree.

## Consumer-facing docs describe; governance docs justify

Two audiences read this repo's Markdown, and the "canon" vocabulary belongs to
only one of them.

- **Governance docs** — this file, [`docs/extending-the-engine.md`](docs/extending-the-engine.md),
  and everything under `docs/plans/`, `docs/roadmap/`, `docs/archived/`. Here
  "canon" is a load-bearing technical term: the 0/1/2-consumer promotion rule.
  Keep it.
- **Consumer-facing docs** — every `src/modules/**/README.md` and the
  core-primitive guides `src/<name>.md` (both published as the Manual), plus all
  JSDoc on public exports (published as the API reference). These describe
  **what a primitive is and how to use it** — never why it earned
  a place in the engine. **No `Canon:` lines, no `## Canon` sections, no
  consumer-count or backlog status** (`marked ready`, `solid canon`,
  `canon-complete`). Do not copy the justification line from a module's
  `docs/plans/` file into its shipped README/JSDoc.

A cross-engine reference is allowed in consumer docs **only** when it helps the
reader — a porting caveat ("left-handed, e.g. Unity") or a familiarity bridge
("coming from Godot, this maps to `Camera2D`") — framed as help, not as proof.
Standard math/CS usage of "canonical" (canonical Perlin gradients, canonical
defaults) is unrelated to the governance term and is fine.

## docs/plans lifecycle

Non-trivial work requires `docs/plans/<feature>.md` with a `[ ]`
checklist. Tick boxes as subtasks complete. Move the plan to
`docs/plans/done/<feature>.md` **in the same commit** as the final
implementation change — not a separate follow-up commit. `git mv` only
works on tracked files; for plans created in the same session, either
`git add` the plan first, or use `Move-Item` then `git add -A`.

## Discovering engine capabilities

Before hand-rolling a helper in a consumer (`examples/*`), check
[`docs/agent/engine-api.md`](docs/agent/engine-api.md) — a generated,
one-line-per-symbol catalog of the whole public surface (every
`@pierre/ecs/*` + `@pierre/ecs/modules/*` export with its signature and
JSDoc summary).
Reinventing a shipped primitive listed there is the #1 cause of
false-positive gaps in the ledger. Regenerate it with `npm run docs:api`
whenever you add, remove, or rename a public export — a drift test fails
`npm test` if it goes stale.

[`docs/agent/engine-usage.md`](docs/agent/engine-usage.md) is the inverse view:
which files reference each export, bucketed as example / unit test / other
engine source, plus a ranking of the value exports no prototype reaches. Read it
when choosing what to prove next. Regenerate with `npm run docs:usage` (also
drift-guarded by `npm test`) — that writes the versioned markdown and JSON model
alongside a generated, gitignored HTML view with sortable tables.

## See also

- [`docs/agent/engine-api.md`](docs/agent/engine-api.md) — generated catalog of the whole public API surface, signature + summary per symbol (read before hand-rolling in a consumer)
- [`docs/agent/engine-usage.md`](docs/agent/engine-usage.md) — generated report of which files reference each export (examples / tests / other source), for choosing what to prove next
- [`docs/README.md`](docs/README.md) — full docs map
- [`docs/extending-the-engine.md`](docs/extending-the-engine.md) — promotion paths + layering principles + tradeoffs
- [`docs/roadmap/core-engine-roadmap.md`](docs/roadmap/core-engine-roadmap.md) — open core-internals work
- [`docs/roadmap/ecs-module-backlog.md`](docs/roadmap/ecs-module-backlog.md) — open module work (shipped modules are not listed; `src/` + `git log` are the record)
- [`docs/roadmap/non-goals.md`](docs/roadmap/non-goals.md) — declined and superseded decisions, with the reason
- [`docs/twenty-games-challenge.md`](docs/twenty-games-challenge.md) — ladder of small games built next (the older proof-via-prototypes ladder is archived at [`docs/archived/prototype-games-roadmap.md`](docs/archived/prototype-games-roadmap.md))
