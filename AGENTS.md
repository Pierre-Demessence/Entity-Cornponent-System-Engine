# AGENTS.md

Project-specific rules for AI coding agents working in this repo. They
supplement the global agent instructions and take precedence where the two
differ.

## What this is

`@pierre/ecs` is a standalone TypeScript Entity-Component-System engine for
2D and 3D games and simulations: domain-neutral core primitives in `src/` and
opt-in modules under `src/modules/<name>/`, consumed by the example games under
`examples/*` through a `file:` workspace install. It is built to a
production-grade bar: every change ships with tests, updated docs and a green
gate (lint, typecheck, tests); medium and large changes also get a peer review.

## Status: pre-1.0, no stability guarantee

The engine is pre-1.0 (`0.0.0`, unpublished), and its public API carries no
compatibility promise:

- Breaking changes are made whenever they improve a primitive's shape.
  Getting the shape right outranks keeping the surface stable.
- Projects outside this repo that depend on the engine pin a git commit; they
  are not migrated from here. **Never edit or commit in a repository other
  than this one.** When a change breaks a known downstream project, name the
  break in your report instead.
- Everything inside this repo — `examples/`, `website/`, `scripts/`, docs —
  migrates in the same commit as the change that breaks it.

This status is what licenses the overrides below. It changes at 1.0; revisit
this file then.

## Shape over stability

Each primitive's **shape** is what has to be right — for novel shapes,
validated by the examples (does it survive a genre shift?); for standard
subsystems, taken from **external canon** up front. This means:

- The sliding-scale promotion rule in [`docs/extending-the-engine.md`](docs/extending-the-engine.md)
  is canon. New core or module additions go through it. Internal
  consumers and external canon are interchangeable shape-evidence:
  unanimous universal canon ships with 0 consumers, solid canon with 1,
  a novel shape needs 2. The examples are deliberately generic, so a
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
- Each example in `examples/` is a first-class engine consumer, not
  throwaway demo code. Engine gaps it surfaces are logged in the backlog's
  [untriaged engine gaps](docs/backlog.md#untriaged-engine-gaps), which a
  separate triage pass turns into module entries, decisions or fixes.
- Aggressive renames, signature changes, and cross-module refactors
  are encouraged when shape-validation reveals a better fit.
- Don't preserve compatibility for its own sake.

These override the global "surgical changes / preserve existing structure"
defaults:

- When migrating a symbol to a new location, **delete** the old file
  in the same change. Never leave a single-symbol re-export shim "for
  stable import paths". Aggregating barrels (e.g. `src/index.ts`,
  `src/modules/<name>/index.ts`) that re-export from many sibling
  files are NOT relays — keep them. The rule applies only to
  single-symbol passthrough files.
- When renaming, rename everywhere in this repo in one pass, `examples/`
  included. No parallel old/new names, no back-compat aliases, no
  deprecation periods, no `@deprecated` JSDoc.
- **No git worktrees. Work on the current branch** unless explicitly
  told to create a new one. Don't branch off unless asked.

"Minimum diff" is calibrated for a frozen API — review burden, frozen wire
formats, deprecation cycles. None of that applies before 1.0.

## Commands

- `npm run lint` — ESLint (`eslint --cache .`); `npm run lint:fix` autofixes.
- `npm run typecheck` — three legs: `src/` (`tsconfig.json`), `scripts/` and
  the root configs (`tsconfig.node.json`), then the site (`website/tsconfig.json`)
  after `astro sync --root website`, which emits the `astro:content` types the
  site imports. There is no build step: the package ships as TypeScript source.
- `npm run typecheck:examples` — type-checks every `examples/*` workspace
  (~20 s). CI runs it; the Husky hooks don't, because it is too slow per push.
- `npm test` — Vitest (`vitest run`); `npm run test:watch` for watch mode.
- `npm run docs:api` — regenerate [`docs/agent/engine-api.md`](docs/agent/engine-api.md).
- `npm run docs:usage` — regenerate [`docs/agent/engine-usage.md`](docs/agent/engine-usage.md),
  `engine-usage.json`, and the gitignored sortable `engine-usage.html`.
- `npm run docs:site` / `npm run docs:dev` — build / serve the published site
  (see [`docs/website.md`](docs/website.md)); `docs:manual` and `docs:examples`
  regenerate just the generated Manual or Examples pages.

Git hooks (Husky): **pre-commit** runs `CI=1 npx lint-staged` (ESLint `--fix`
on staged `.ts`/`.tsx`/`.yml`/`.yaml`); **pre-push** runs
`npm run typecheck && npm test`.

## Layout

- `src/` — core primitives. Each has a guide beside its source (`src/<name>.md`:
  `component-store`, `event-bus`, `query`, `scheduler`, `spatial-structure`,
  `template`, `tick`, `world`), published as the Manual's Core group.
- `src/modules/<name>/` — one opt-in module each, exported as
  `@pierre/ecs/modules/<name>`, documented by its own `README.md`.
- `examples/<name>/` — one Vite app per example game; `examples/manifest.ts` is
  the single catalogue (hub and site both read it), `examples/hub/` hosts them
  all, and `examples/assets/` holds whole art packs on purpose.
- `scripts/` — generators (`*.gen.ts`) and the doc gates (`*.test.ts`).
- `website/` — the Starlight site; how it is generated: [`docs/website.md`](docs/website.md).
- `docs/` — internal, never published:
  - [`backlog.md`](docs/backlog.md) — all open work: core, modules, site, example
    adoption, untriaged engine gaps.
  - [`decisions.md`](docs/decisions.md) — non-obvious decisions, including what
    the engine declines to build.
  - [`roadmap.md`](docs/roadmap.md) — the games ladder built next.
  - [`extending-the-engine.md`](docs/extending-the-engine.md) — the promotion
    rule-book, layering principles and the gap-triage process.
  - [`game-ai-landscape.md`](docs/game-ai-landscape.md) — map of game-AI
    techniques and which ones the engine covers.
  - [`agent/`](docs/agent/) — the generated API catalog and usage report.
  - `plans/` — plans for work in progress only.

## Architectural invariants

These are not preferences; they're load-bearing structure. Don't break
them without a plan and a peer review.

- **Modules are tree-shakeable subpath exports.** Every module under
  `src/modules/<name>/` ships as `@pierre/ecs/modules/<name>` via the
  `exports` map in `package.json`; `sideEffects: false` keeps unused modules
  out of consumer bundles. Modules depend on core primitives only.
  **No module imports from `@pierre/ecs` itself**, and no module
  imports from another module unless that dependency is documented in
  the module's own README. That documentation rule covers shipped module
  code; a `*.test.ts` file may pull fixtures from any module without the
  dependency becoming documented surface.
- **Core (`src/`) is domain-neutral.** Zero references to game-shape
  concepts (no "player", "enemy", "tile", "turn", "score"). If a primitive in
  core mentions a genre concept, it's a leak — demote it.
- **Internal imports use `#*` aliases.** `package.json#imports` maps `#*` →
  `./src/*.ts`; inside `src/`, prefer `from '#world'` over `from './world'`.
- **`EntityId` is branded.** A plain `number` does not type-check as one. Get
  ids from the world, `packEntityId`, or `asEntityId` / `isEntityId` when
  decoding; store-level tests use `eid(index, generation?)` from `#test-utils`.
  Ids are recycled with a generation bump, so never assume they are dense,
  ordered by creation, or unique over a session.
- **No enums and no `private` constructor parameter properties** (TypeScript
  `erasableSyntaxOnly`). Use `as const` objects.
- **Tests live alongside source.** `*.test.ts` next to the file under
  test, not in a separate tree.

## Discovering engine capabilities

Before hand-rolling a helper in a consumer (`examples/*`), check
[`docs/agent/engine-api.md`](docs/agent/engine-api.md) — a generated,
one-line-per-symbol catalog of the whole public surface (every
`@pierre/ecs/*` + `@pierre/ecs/modules/*` export with its signature and
JSDoc summary). Reinventing a shipped primitive listed there is the #1 cause
of false-positive engine gaps. Regenerate it with `npm run docs:api`
whenever you add, remove, or rename a public export — a drift test fails
`npm test` if it goes stale.

The `— —` rows in it (exports with no JSDoc summary) are the doc-coverage
debt. `scripts/jsdoc-coverage.test.ts` fails `npm test` if a public function,
class, interface or type lacks a summary, or if the undocumented count rises
above its baseline; lower the baseline as you document the remaining `const`s.

[`docs/agent/engine-usage.md`](docs/agent/engine-usage.md) is the inverse view:
which files reference each export, bucketed as example / unit test / other
engine source, plus a ranking of the value exports no example reaches. Read it
when choosing what to prove next. Regenerate with `npm run docs:usage` (also
drift-guarded by `npm test`).

## Manual samples are compiled, walkthroughs are run

Every `ts` block in a Manual source — module READMEs, core guides and
`website/manual/**` — is republished verbatim, so a broken sample ships to
readers.

- `scripts/doc-samples.test.ts` type-checks the **runnable** blocks (those
  that `import` from `@pierre/ecs`) against the real declarations. Free
  identifiers a sample never defines are stubbed as `any`; `world` and
  `scheduler` get their real types. A page whose blocks are steps of one
  program is listed in `SINGLE_FILE_PAGES` (`scripts/doc-samples.ts`).
- A runnable block that cannot compile in isolation gets a
  `{ source, index, reason }` entry in `SAMPLE_EXCLUSIONS` — `source` is the
  module name for a README or the path without `.md` otherwise, `index` the
  block's zero-based ordinal, and `reason` names what is missing so the
  exclusion can be lifted later.
- `scripts/readme-symbols.test.ts` name-checks the `.d.ts`-style signature
  listings the compile gate skips: every documented top-level
  `function`/`class`/`interface`/`type` must be a real export. An intentional
  non-export goes in `SYMBOL_ALLOWLIST` (`scripts/readme-symbols.ts`) with a
  reason. Inline prose mentions are not checked (backlog: core 4.6).
- `scripts/manual-walkthroughs.test.ts` **executes** the Introduction's example
  and the whole tutorial (DOM and `requestAnimationFrame` stubbed) in the
  gitignored `scripts/.walkthroughs/`; any `console.error` fails it.

## Consumer-facing docs describe; governance docs justify

Two audiences read this repo's Markdown, and the "canon" vocabulary belongs to
only one of them.

- **Governance docs** — this file and everything under `docs/` (backlog,
  decisions, roadmap, the rule-book, plans). Here "canon" is a load-bearing
  technical term: the 0/1/2-consumer promotion rule. Keep it.
- **Consumer-facing docs** — every `src/modules/**/README.md` and the
  core-primitive guides `src/<name>.md` (both published as the Manual), plus all
  JSDoc on public exports (published as the API reference). These describe
  **what a primitive is and how to use it** — never why it earned
  a place in the engine. **No `Canon:` lines, no `## Canon` sections, no
  consumer-count or backlog status** (`marked ready`, `solid canon`,
  `canon-complete`). Do not copy the justification from a plan or the backlog
  into a shipped README or JSDoc.

A cross-engine reference is allowed in consumer docs **only** when it helps the
reader — a porting caveat ("left-handed, e.g. Unity") or a familiarity bridge
("coming from Godot, this maps to `Camera2D`") — framed as help, not as proof.
Standard math/CS usage of "canonical" (canonical Perlin gradients, canonical
defaults) is unrelated to the governance term and is fine.

## Plans, backlog and decisions

- Large tasks get a plan in `docs/plans/<feature>.md` with a `[ ]` checklist,
  ticked as subtasks land. A finished plan is **deleted** in the feature's final
  commit: its non-obvious decisions move to [`docs/decisions.md`](docs/decisions.md)
  and its open items to [`docs/backlog.md`](docs/backlog.md). There is no
  `plans/done/` or archive folder; `git log --all -- docs/plans/<name>.md`
  finds an old plan.
- Anything deferred or discovered out of scope goes to the backlog when it is
  deferred, one entry each; a module entry carries a status (Ready / Deferred /
  Speculative) and a gate, as the backlog's header defines. An entry is deleted
  in the commit that finishes it.
- When an example lands, its row leaves [`docs/roadmap.md`](docs/roadmap.md) and
  the gaps it hit go to the backlog's untriaged section.
- `scripts/docs.test.ts` fails `npm test` on a broken relative link in any
  `docs/` file, `README.md` or this file, and on a module backlog entry without a
  status.
