# Agent Operational Doc

## Purpose

`@pierre/ecs` — TypeScript ECS engine: domain-neutral core primitives in
`src/` + opt-in modules under `src/modules/<name>/`. Consumed via
`file:` install by the prototype workspaces under `examples/*`.

## Scripts

- `npm run lint` — ESLint check (`eslint --cache .`)
- `npm run lint:fix` — ESLint with autofix
- `npm run typecheck` — Type-check only, in three legs: `src/` via `tsconfig.json`, `scripts/` and the root configs via `tsconfig.node.json`, then the site via `website/tsconfig.json`. The site leg runs after `astro sync --root website`, which emits the `astro:content` types the site imports; without that sync step the site fails to type-check on a fresh clone. No build step: the package ships as TypeScript source consumed via `file:` install.
- `npm run typecheck:examples` — Type-check every `examples/*` workspace (`npm exec --workspaces -- tsc --noEmit`, ~20s). CI runs this; it is deliberately not in the Husky hooks, where 20s is too slow for every push.
- `npm test` — Vitest tests (`vitest run`)
- `npm run test:watch` — Vitest in watch mode
- `npm run docs:site` — build the whole published site (Starlight) into
  `website/dist`
- `npm run docs:dev` — run the site locally with hot reload
- `npm run docs:manual` — regenerate just the generated Manual content
- `npm run docs:api` — regenerate the API-surface catalog (`docs/agent/engine-api.md`)
- `npm run docs:usage` — regenerate the usage report (`docs/agent/engine-usage.md`)

## Git Hooks (Husky)

- **pre-commit**: `CI=1 npx lint-staged` — ESLint --fix on staged `.ts`/`.tsx`/`.yml`/`.yaml` files
- **pre-push**: `npm run typecheck && npm test` — type-check then full Vitest run

## Key Paths

### Core primitives (`src/`)

The core primitive surface is catalogued in
[`docs/README.md`](../README.md) (Primitives + Supporting Files). Each
primitive also has a dedicated page under [`docs/`](../).

### Discovering engine capabilities (read before authoring a consumer)

[`engine-api.md`](engine-api.md) is a generated, one-line-per-symbol catalog
of the **entire public surface** — every `@pierre/ecs/*` and
`@pierre/ecs/modules/*` export with its type-level signature and JSDoc
summary. Read it first to find an existing helper before hand-rolling one in an
example (the cheap alternative to opening every module README, and the fix for
reinventing shipped primitives).

- Regenerate after changing any public export: `npm run docs:api`.
- A drift test (`scripts/engine-api.test.ts`) fails `npm test` if it is stale.
- The `— —` rows (exports with no JSDoc summary) are the doc-coverage backlog. A
  ratchet (`scripts/jsdoc-coverage.test.ts`) fails `npm test` if any public
  **function, class, interface, or type** lacks a summary, or if the total
  undocumented count rises above its baseline — so a new export must be
  documented and the backlog only shrinks. The remaining backlog is runtime
  `const`s; lower the baseline as you document them.
- [`engine-usage.md`](engine-usage.md) is its counterpart: which files
  reference each export, bucketed as example / unit test / other engine source.
  Read it when choosing what to build next. Regenerate with `npm run docs:usage`;
  a drift test (`scripts/engine-usage.test.ts`) fails `npm test` if it is stale.
- `npm run docs:usage` writes three artifacts from one model: `engine-usage.md`
  (versioned, for reading), `engine-usage.json` (versioned, the data contract
  other tools can consume), and `engine-usage.html` (generated and gitignored —
  sortable and filterable, opens straight from disk).

### Manual examples are compiled, walkthroughs are run (don't ship a broken sample)

Every `ts` code block in a Manual source — module READMEs, core guides
(`src/*.md`) and authored pages (`website/manual/**`) — is republished verbatim,
so a broken example is shipped to readers who copy it.
`scripts/doc-samples.test.ts` type-checks the **runnable** blocks — those that
`import` from `@pierre/ecs` — against the real declarations, failing `npm test`
naming the file and line on a wrong arity, a nonexistent member, or a mistyped
`@pierre/ecs` import path.

- A page whose blocks are steps of one program is listed in `SINGLE_FILE_PAGES`
  (`scripts/doc-samples.ts`) and checked as one file, each block on its own
  Markdown lines.
- `scripts/manual-walkthroughs.test.ts` also **executes** the Introduction's
  example and the whole tutorial (DOM and `requestAnimationFrame` stubbed), so a
  runtime precondition a page skips — `world.move` without `enableSpatial` —
  fails the test. Any `console.error` fails it too, because tick sources report
  a throwing system that way instead of rethrowing.

- Only runnable blocks are checked; `.d.ts`-style signature listings and
  cheat-sheets are API reference, not code, and are skipped (the test logs how
  many). Signature listings are name-checked by the sibling gate below; inline
  `` `foo()` `` prose mentions are a deferred follow-up.
- Free identifiers a sample never defines (`ctx`, `GRAVITY`, …) are stubbed as
  `any`; `world` and `scheduler` get their real engine types so member misuse is
  caught. There is no artifact to regenerate; the walkthrough test writes its
  modules to the gitignored `scripts/.walkthroughs/` and deletes them after.
- If a runnable block genuinely cannot compile in isolation (it dereferences
  game-specific component stores, say), add a `{ source, index, reason }` entry
  to `SAMPLE_EXCLUSIONS` in `scripts/doc-samples.ts` — `source` is the module
  name for a README (`collision-3d`) or the path without `.md` otherwise
  (`website/manual/guides/scenes`), `index` is the block's zero-based ordinal
  within that file, and the `reason` must name what is missing so the exclusion
  can later be lifted.

The `.d.ts`-style **signature-listing** blocks that the compile gate skips are
instead name-checked by `scripts/readme-symbols.test.ts`: every top-level
`function`/`class`/`interface`/`type` a listing documents must be a real public
export, so a renamed or removed export cannot leave a stale name in a README. A
documented name that is intentionally not an export goes in `SYMBOL_ALLOWLIST`
(`scripts/readme-symbols.ts`) with a reason. Inline `` `foo()` `` prose mentions
are not yet checked — that is a deferred, false-positive-bound follow-up (see
[`../roadmap/core-engine-roadmap.md`](../roadmap/core-engine-roadmap.md) §4.6).

### Modules (`src/modules/<name>/`, exported as `@pierre/ecs/modules/<name>`)

Each module is exported as `@pierre/ecs/modules/<name>` and documents itself in
its own `src/modules/<name>/README.md` (deep reference). For the one-read
capability map across all modules, use [`engine-api.md`](engine-api.md).

### Tests

- `*.test.ts` colocated with source under `src/` and `src/modules/<name>/`
- `vitest.config.ts` — root config; modules and examples inherit

### Docs

- [`docs/README.md`](../README.md) — full docs index
- [`docs/extending-the-engine.md`](../extending-the-engine.md) — the sliding-scale promotion rule, layering principles, tradeoffs, prior art
- [`docs/roadmap/core-engine-roadmap.md`](../roadmap/core-engine-roadmap.md) — open core-internals work
- [`docs/roadmap/ecs-module-backlog.md`](../roadmap/ecs-module-backlog.md) — open module work
- [`docs/twenty-games-challenge.md`](../twenty-games-challenge.md) — proof-via-prototypes ladder
- `docs/<primitive>.md` — per-primitive docs (component-store, event-bus, query, scheduler, spatial-structure, template, tick, world)

### Published site (`website/`, Astro + Starlight)

A consumer-facing GitHub Pages site with three sections sharing one theme and one
search index — but **not** one sidebar: the Manual, the API reference and the
Examples each get their own, described below.

- `/` — the home page (`website/src/content/docs/index.mdx`).
- `/manual/` — one guide per module, **generated** from
  `src/modules/<name>/README.md` by `scripts/manual.ts` into
  `website/src/content/docs/manual/` (gitignored). The READMEs are the single
  source: nothing is copied by hand and no frontmatter is added to them. The
  core-primitive guides (`src/<name>.md`) and the hand-authored pages
  (`website/manual/**`) join them from their own sources.
- `/api/` — the TypeDoc reference, rendered as Starlight pages by
  `starlight-typedoc`, whose entry points are derived from `package.json`
  `exports` so they cannot drift. Landing page: `website/src/content/docs/api.md`.
- `/examples/` — one page per prototype under `examples/`, **generated** from
  `examples/manifest.ts` by `scripts/examples.ts` into
  `website/src/content/docs/examples/` (gitignored, wiped by `npm run
  docs:examples`). Each page mounts the prototype in place through
  `website/src/components/ExampleStage.astro`, which imports the literal loaders in
  `examples/loaders.ts` and starts the prototype on page load. The manifest is the
  single catalogue — the hub reads it too — and `scripts/examples.test.ts` fails
  when it disagrees with the `examples/` directories, the hub's dependencies or
  `src/modules/`. The sidebar groups come from the manifest's `group`.

`typeDocSidebarGroup` is an empty placeholder that `starlight-typedoc` swaps for
the generated sidebar group by matching its **label**. It must sit in the sidebar
untouched: spreading its `items` (or renaming it) at config-eval time silently
drops the entire API tree from navigation while every API page still builds. Nest
it inside a labelled group instead if the group needs a label of its own.

TypeDoc also emits the repo `README.md` as `/api/readme/` even with `readme:
'none'`. Nothing links to it and it is not in the sidebar, so it is a duplicate
page reachable only by URL.

#### Sidebars: one per section

Starlight configures a single sidebar, but the Manual, the API reference and the
Examples share nothing, so `website/src/site-route-data.ts` (wired through `routeMiddleware`)
replaces `starlightRoute.sidebar` per section: the configured sidebar is the
superset, Starlight resolves it, and the middleware only rearranges the resolved
entries. The three shapes:

- `/manual/**` — `Overview` (→ `/manual/`) then collapsed `Core` and `Modules`
  groups. A new Manual group must be declared in **both**
  `website/astro.config.mjs` (the `autogenerate` entry) and `manualSidebar()` in
  `website/src/site-route-data.ts`, which re-cuts the resolved tree by label. A
  group declared only in the config collapses to nothing: its pages build and
  are reachable by URL, but never appear in navigation.
- `/api/**` — `Overview` (→ `/api/`) then collapsed `Core API` and
  `Modules API` groups. The generated group is split on TypeDoc's `modules/`
  label prefix (from the `./src/modules/*/index.ts` entry glob), and the prefix
  is stripped, so a heading reads `animation` rather than `modules/animation`.
  Changing that glob without updating the prefix check would silently put every
  module in Core API.
- `/examples/**` — `Overview` (→ `/examples/`) then the manifest's groups, each a
  list of explicit links. The groups are declared once in `astro.config.mjs`
  (built from `EXAMPLE_GROUPS` / `EXAMPLES`), and `examplesSidebar()` lifts them
  out by the `Examples` label, so adding a prototype to the manifest needs no
  edit to either.

The section is chosen from the URL path relative to `import.meta.env.BASE_URL`,
not from the page id, so `/manual/` itself classifies correctly.

#### Header links

The header's three section links and the active-section highlight come from
`website/src/components/Header.astro`, registered as `components.Header`. It is a
copy of Starlight's default header with a nav added *inside* the search column:
at ≥50rem the header is a three-column grid, so a fourth child would wrap onto a
second row. Starlight's own styles are reproduced verbatim there — keep that file
in step when upgrading Starlight, and re-check the layout at a narrow width, where
the links (like the right-hand icons) are hidden.

The home page's section cards are `Card`s wrapped in an anchor rather than
`LinkCard`s: `LinkCard` has no `icon` prop, so passing one silently does nothing.
`website/src/styles/custom.css` carries what the wrapper owes as a result — the
persistent CTA row that marks each card clickable, and the icon-chip colour
cycle, which `Card` derives from `:nth-child` and which collapses to a single
colour once every card is the only child of its wrapper.

- `npm run docs:site` regenerates the Manual, runs TypeDoc, and builds the site
  into `website/dist` — **generated output is never committed**. `.github/workflows/pages.yml`
  deploys that directory as a Pages artifact.
- `npm run docs:dev` for local work; it regenerates the Manual first, because
  `website/src/content/docs/manual/` does not exist in a fresh clone.
- The generator rewrites README links for the site: sibling
  `../<module>/README.md` becomes a guide route, repo-relative paths point at
  GitHub, and `docs/**` links are dropped. `scripts/manual.test.ts` guards those
  rules, so a README link into `docs/` can never reach the published site.
- Every module has a README, so every module has a guide. A new module added
  without one is skipped and named in the build output rather than silently
  missing — `modulesWithoutReadme()` is what reports it.
- Hand-authored Manual pages live in `website/manual/` and publish to the same
  path under `manual/`, so `website/manual/index.md` becomes the `/manual/`
  landing page. That tree is the only site source outside the generator, and it
  exists so a page which is not a guide can be committed rather than
  hand-placed: `scripts/manual.gen.ts` wipes `manual/` before every write. An
  authored page's title is its first `# ` heading, dropped from the body because
  Starlight renders the frontmatter title. `index.md` is the exception — its
  title is `Overview`, and it carries `sidebar.hidden` because the `Overview`
  sidebar entry is injected by the route middleware instead.
- Authored pages link to **published routes** (`./core/world/`), not to files,
  because nothing rewrites them (unlike guide bodies, which go through
  `rewriteLinks()`). `scripts/manual.test.ts` resolves those routes against the
  generated page list, so a typo in a Manual route fails `npm test`.
- The prototypes are listed once, in `examples/manifest.ts`, and published as the
  **Examples** section rather than as a Manual page (28 of the 30 folders under
  `examples/` carry no `README.md`). Adding an example means adding its manifest
  entry, its loader in `examples/loaders.ts` and its workspace dependency in
  `examples/hub/package.json`; `scripts/examples.test.ts` names whichever is
  missing.
- Source `.md` files are checked out CRLF on Windows (no `.gitattributes`,
  `core.autocrlf=true`) and the generator writes them verbatim, so each
  generated page is CRLF. A byte-diff of generated output against a Git blob
  therefore shows phantom differences — compare against the worktree file.
- Remember: `docs/**` is **internal** and is not published. The site shows the
  home page, the Manual, the API reference and the Examples only.
- The deploy requires repo Settings → Pages → Source = **GitHub Actions**.

## Invariants

- **Domain-neutral core.** `src/` (root level) contains zero references to game-shape concepts — no "player", "enemy", "tile", "turn", "score". If a primitive at the root mentions a genre concept, it's a leak; demote it.
- **Modules are tree-shakeable subpath exports.** Every `src/modules/<name>/` ships as `@pierre/ecs/modules/<name>` via the `exports` map in `package.json`. `sideEffects: false` keeps unused modules out of consumer bundles.
- **No module imports `@pierre/ecs` itself.** Modules import core primitives by relative path; never round-trip through the package barrel. No module imports another module unless the dependency is documented in that module's README.
- **Internal imports use `#*` aliases.** `package.json#imports` maps `#*` → `./src/*.ts`. Inside `src/`, prefer `from '#world'` over relative `from './world'`.
- **No enums.** Use `as const` objects (TypeScript `erasableSyntaxOnly`).
- **No `private` constructor parameter properties** (same reason).
- **Tests live alongside source.** `*.test.ts` next to the file under test; no separate `__tests__/` or top-level `test/`.
- **Single-symbol re-export shims are forbidden.** When migrating a symbol's home, delete the old file in the same change. Aggregating barrels (e.g. `src/index.ts`, `src/modules/<name>/index.ts`) re-exporting from many siblings are NOT relays — keep them.
- **Promotion rule-book is canon.** New core / module additions go through the sliding-scale evidence rule in `docs/extending-the-engine.md`: canon and internal consumers are interchangeable proof (unanimous canon → 0 consumers, solid canon → 1, novel shape → 2). The examples are deliberately generic, so don't reflexively defer canon.
- **Prototypes in `examples/` are first-class consumers.** Engine gaps they surface go to `docs/roadmap/engine-gap-ledger.md` (symptom only, no module decision); a triage pass promotes them into `docs/roadmap/ecs-module-backlog.md`. Don't treat the examples as throwaway demos.
- **Plan-file lifecycle.** Non-trivial work uses `docs/plans/<feature>.md` with a `[ ]` checklist. Move the plan to `docs/plans/done/<feature>.md` in the same commit as the final implementation change. `git mv` only works on tracked files.
