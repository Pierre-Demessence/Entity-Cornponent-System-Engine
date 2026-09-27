# Manual restructure: page types beyond the per-primitive reference

The Manual ships 51 pages and every one is a reference page for a single thing:
a curated Overview (`website/manual/index.md`), eight core-primitive guides
(`src/<name>.md`, listed in `CORE_GUIDES` at `scripts/manual.ts:31`) and 42
module guides (`src/modules/*/README.md`). A reader can look up any piece, but
there is no page for the model the pieces share, no walkthrough that starts from
nothing, and no way in that begins from a task instead of a name.

This plan adds those page types and the plumbing they need. It runs as several
slices; each slice ships on its own and is verified on its own.

## Requirements

- THE Manual SHALL contain a page for each of: a module index, an examples
  overview, the engine's shared model, a walkthrough, task guides,
  troubleshooting, and a glossary.
- THE module index SHALL list every module guide under exactly one named
  category.
- THE examples overview SHALL name each prototype directory under `examples/`
  (`assets/` holds shared files) and SHALL link to it.
- THE Manual SHALL explain archetypes, structural changes and their cost, query
  caching, tick versus frame, and system ordering on its own pages rather than
  only inside another guide.
- THE Manual SHALL provide a numbered walkthrough from an empty project to a
  running scene.
- THE Manual SHALL provide a how-to page for each of: fixed timestep and
  interpolation, save and load, scenes and transitions, worker offload, first
  frame, debug overlay.
- THE troubleshooting page SHALL carry one entry for each of: a query missing
  entities added in the same tick, deferred destroy taking effect at end of tick,
  archetype component order, and indexing a type that is never spatially queried.
  These four are the floor; more may be added.
- THE glossary SHALL define at least archetype, structural change, tick, phase,
  tag, template and subpath export.
- THE Manual SHALL document how to layer a module on the core primitives, on a
  page distinct from `docs/extending-the-engine.md`, which stays internal.
- THE Manual sidebar SHALL present three collapsed groups — **Getting started**,
  **Concepts**, **Guides** — in addition to **Core** and **Modules**, and the API
  reference sidebar SHALL NOT gain any of them.

## What the site already supports (verified, not assumed)

- **Authored pages are served by one mechanism.** `renderAuthoredPages()`
  (`scripts/manual.ts:294`) walks `website/manual/**` and publishes each file to
  the same path under `manual/`. The invariant it protects is that everything
  under `manual/` stays generated — `scripts/manual.gen.ts:18` wipes that
  directory before writing — so authored prose is committed beside the site and
  never hand-placed in the content tree.
- **A sidebar group must be declared twice.** `website/astro.config.mjs:57-58`
  declares the `Core` and `Modules` autogenerate groups; the resolved tree is
  then re-cut per section by `manualSidebar()` (`website/src/site-route-data.ts:42`),
  which pulls the groups out by label (`:44`, `:45`) and rebuilds the list
  (`:48`). A group added to the config alone does not survive — the middleware
  must name it, or its pages vanish from the sidebar while still building.
- **One-line summaries are already extracted.** `summaryOf()`
  (`scripts/manual.ts:127`) flattens a guide's first paragraph, strips inline
  markup and truncates at 160 characters; it already supplies every guide's meta
  description. The module index can consume the same function, so its one-liners
  cannot drift from the guides they describe.
- **The link rewriter runs only on generated bodies.** `rewriteLinks()` is called
  for guides (`scripts/manual.ts:329`) because those links are written for
  readers inside the repo. An authored page gets no rewriting, so it must use
  site routes (`./core/world/`, `../api/`) and absolute GitHub URLs directly.
- **The link guards have different scopes.** `scripts/docs.test.ts` walks
  `docs/**`, the root `README.md` and `AGENTS.md`; it never opens `website/**`.
  The Manual's own routes are checked by `scripts/manual.test.ts`, which resolves
  them against the generated page list rather than the filesystem, because a
  Manual page links to published URLs (`./core/world/`) that `existsSync` cannot
  see. A link into another section (the API reference) is out of scope.
- **Search is site-wide.** Pagefind indexes every built page, so new pages are
  findable with no extra index.
- **Most prototypes are invisible to a reader.** 11 of the 30 directories under
  `examples/` are named anywhere on the site, each in `examples/<name>` form
  inside a guide or a JSDoc comment, and several of those are named more than
  once. No prototype has a page, and nothing links out to a runnable build. 2 of
  the 30 directories carry a `README.md`, and one of those two is the shared
  `assets` folder, so a gallery's per-example copy is authored.
  `docs/twenty-games-challenge.md` holds the ladder and its status, but it is a
  governance doc and is not published.

## Decisions (settled before building)

- **Authored sources live at `website/manual/<group>/<slug>.md` and publish to
  the same path under `manual/`.** `website/manual/index.md` is the landing page
  and the only authored page with no group; it carries `sidebar.hidden` because
  the sidebar's `Overview` entry is injected by the route middleware.
- **New page types get new groups.** Core and Modules mean "one page per
  primitive / per module" by construction; authored pages mixed into them would
  break that meaning and make the groups unfalsifiable. The Manual sidebar
  becomes: Overview, **Getting started**, **Concepts**, **Guides**, **Core**,
  **Modules**.
- **The module index is generated; its categories are declared.** The grouping is
  authored (task-oriented: collision & physics, rendering, input, AI, data &
  persistence, utility); the per-module one-liners come from `summaryOf()`. The
  index is therefore guarded by the existing `scripts/manual.test.ts` instead of
  by review.
- **The examples gallery is one authored page, not a section.** A third
  top-level section (its own sidebar, its own `Header.astro` link) is justified
  once there is a page per example; today there is one page, so it ships inside
  the Manual. Promotion is left as a roadmap candidate.
- **Concepts pages assemble shipped invariants rather than introducing claims.**
  `src/world.md` (`## Invariants`), `src/query.md`, `src/component-store.md` and
  `src/tick.md` already state the load-bearing behaviour; the concepts pages
  gather it and describe how the pieces relate. No new assertions about the
  engine are authored.
- **A group is declared in the same slice as the first page that fills it.** So
  the `Getting started` group arrives with the module index, `Concepts` with the
  model page, and `Guides` with the first how-to. Declaring them earlier would
  put an empty group in the sidebar: an `autogenerate` entry is resolved by
  filtering routes on the directory prefix (`node_modules/@astrojs/starlight/dist/utils/navigation.js:50-59`),
  and no matching route yields an empty entry list rather than an error, so the
  mistake is visible only in the rendered sidebar.
- **The walk needs a stated rule for title, description and the hidden flag.**
  A guide's title is its file name; an authored page has prose headings instead.
  The rule: the first `# ` heading is the title, falling back to the file name;
  the description is `summaryOf()`; and `index.md` keeps `title: 'Overview'`
  with `sidebar.hidden`, because the Overview's title lives in frontmatter and
  its prose opens without a heading.
- **Authored pages carry an explicit sidebar order.** Starlight orders an
  autogenerated group by frontmatter `sidebar.order` and otherwise
  alphabetically, which would render `Getting started` as examples,
  module-index, tutorial. The order is a map in `scripts/manual.ts` from
  authored page to number, emitted into each page's frontmatter. Slice 1 builds
  the mechanism and covers it from a throwaway directory; Slice 2 is where an
  order is first observable, since the landing page is the only authored page
  before it.
- **Slices ship independently.** Slice 1 lands alone and changes no published
  page at all, so a mistake in the walk or the frontmatter rule surfaces in a
  diff with no new prose to re-review. Content slices then add one page type
  each.

## Slices

### 1. Plumbing: authored-page support

Generalise `renderIndexPage()` into "render every authored page found under
`website/manual/`", so the folders on disk decide the pages. Move the Overview to
`website/manual/index.md`; the published path stays `manual/index.md`. No new
groups, no new pages and no prose: the mechanism is proven by the Overview
itself, so the diff stays reviewable. The Overview lives at the tree root and is
hidden from the sidebar, so this slice exercises the walk but not group pathing
or the declare-twice edit — Slice 2 is where those first appear, and the nested
path rule is covered from a throwaway directory in the meantime.

### 2. Module index

`manual/getting-started/module-index.md` — the six category headings, each
holding a table of its modules and their `summaryOf()` one-liner. Generated
straight into the content tree like the core and module pages, so
`website/manual/` stays hand-authored and no generated file lands in a source
tree. Built from the same listing the guide pages come from, so a new module
cannot be missing from it. This slice also declares the `Getting started` group
and updates the Overview's organisation section, which names only Core and
Modules.

### 3. Examples gallery

`website/manual/getting-started/examples.md` — one entry per prototype: what it
is, the mechanic it demonstrates, and a link to its folder. Copy is authored.

### 4. Concepts

Three pages under `website/manual/concepts/`: the entity/component/system model
and what an archetype is; structural changes, their cost, and what query caching
depends on; the tick and frame model with system ordering. Sourced from the
shipped invariants above. Declares the `Concepts` group; the glossary joins it in
Slice 7.

### 5. Tutorial

`website/manual/getting-started/tutorial.md` — numbered steps from an empty
project to a moving, drawn scene, using only shipped primitives.

### 6. Guides and troubleshooting

`website/manual/guides/*.md` — fixed timestep and interpolation, save and load,
scenes and transitions, worker offload, first frame, debug overlay; plus
`guides/troubleshooting.md` for the recurring traps. Declares the `Guides`
group.

### 7. Glossary

`website/manual/concepts/glossary.md` — archetype, structural change, tick,
phase, tag, template, subpath export.

### 8. Writing your own module

`website/manual/guides/writing-a-module.md` — the consumer-facing counterpart to
`docs/extending-the-engine.md`, which is governance and stays unpublished: how to
layer a module on the core primitives, and what "module" means as a subpath.

## Checklist

Slice 1 — plumbing:

- [x] Move `website/manual-overview.md` to `website/manual/index.md`; delete the
      old file.
- [x] `scripts/manual.ts` — replace `renderIndexPage()` with a walk of
      `website/manual/**/*.md`, publishing each to the same relative path under
      `manual/`; sort with the existing `byName` so the output stays
      byte-stable for `scripts/manual.test.ts`.
- [x] `scripts/manual.ts` — apply the title / description / `index.md` rule.
- [x] Check authored site routes against the generated page list, in
      `scripts/manual.test.ts`, since no gate opens `website/**` today.
- [x] `scripts/manual.test.ts` — cover an authored page outside the Overview,
      rendered from a throwaway directory, so the nested-path rule is exercised
      before an authored page lands in the repository.
- [x] `docs/agent/README.md` — record the authored-source folder, the
      route-link rule, and the declare-twice rule for a new group.
- [x] `scripts/manual.ts` — emit each authored page's declared sidebar order,
      from a map in that file, so a group of authored pages reads in a declared
      order rather than alphabetically.
- [x] `scripts/manual.test.ts` — cover the order rule by rendering a throwaway
      directory with an injected map.

Slice 2 — module index:

- [x] Declare the categories and generate the page into
      `manual/getting-started/`.
- [x] `website/astro.config.mjs` + `website/src/site-route-data.ts` — declare the
      `Getting started` group in both, and check the rendered sidebar.
- [x] `website/manual/index.md` — extend its organisation section, which names
      only Core and Modules.
- [x] Extend `scripts/manual.test.ts` so every module appears exactly once.

Slice 3 — examples gallery:

- [x] Author the page, one entry per prototype.
- [x] `docs/agent/README.md` — note that example copy is authored, since 28 of
      30 folders carry no README.

Slice 4 — concepts:

- [x] Author the three pages from shipped invariants only.
- [x] Declare the `Concepts` group in `astro.config.mjs` and
      `site-route-data.ts`, and check the rendered sidebar.

Slice 5 — tutorial:

- [ ] Author the walkthrough; every snippet typechecked against `src/`.

Slice 6 — guides and troubleshooting:

- [ ] Author the how-to pages and the troubleshooting page.
- [ ] Declare the `Guides` group in `astro.config.mjs` and
      `site-route-data.ts`, and check the rendered sidebar.

Slice 7 — glossary:

- [ ] Author the glossary.

Slice 8 — writing your own module:

- [ ] Author the consumer-facing module-authoring guide.

Per slice:

- [ ] `npm run docs:site` builds, and the rendered sidebar of every new page
      shows the right group (`dist/**/index.html`, not just page existence).
- [ ] `npm run typecheck` and `npm test` green.
- [ ] Browser check of the new pages in both themes.
- [ ] Peer review (subagent: no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Non-goals

- **Per-primitive pages for the remaining core sources.** No page is planned for
  the 13 core sources without a same-named guide, and the reason differs per
  file. `tick-source.ts` (30 lines) and `tick-runner.ts` (109) are covered by
  `src/tick.md`, whose import line names both. `index.ts` (44) is a barrel.
  `archetype-index.ts` (125) and `column-store.ts` (302) are storage internals
  behind `ComponentStore` and `Query`, not consumer surface. Five are interface
  contracts of 2-26 lines (`entity-id.ts` 2, `lifecycle.ts` 19,
  `input-source.ts` 20, `renderer.ts` 21, `audio-provider.ts` 26). Three are
  small utilities: `validation.ts` (46), `plugin.ts` (29) and `test-utils.ts`
  (69).
- **Publishing anything under `docs/`.** That tree is governance; the Manual's
  sources are the ones co-located with the code they document plus the authored
  folder above.
- **Versioned docs and translation.** Pre-1.0, single language.

## Shape notes

- Every slice keeps the invariant that `website/src/content/docs/manual/` is
  fully generated. Authored prose never lands there.
- Slice 1 is deliberately page-free: if the walk, the frontmatter rule or the
  route check is wrong, it is wrong in a diff with no new prose to re-review.
  Its route check lives in `scripts/manual.test.ts` rather than a new file,
  because it needs the generated page list, which only the generator has.
- The favicon 404 on every page is a site defect, not a Manual one, and is
  tracked in `docs/roadmap/docs-site-roadmap.md`.
