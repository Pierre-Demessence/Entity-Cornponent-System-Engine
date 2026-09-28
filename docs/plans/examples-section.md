# Examples section: a runnable page per prototype

The published site has two sections — Manual and API reference — and neither runs
anything. The only runnable surface in the repo is `examples/hub`, a Vite app in
the workspace that mounts all 28 prototypes behind a card list
(`examples/hub/src/main.ts:15`). It is a development task runner, not a page a
reader arrives on, and it is not published.

The site already *lists* the prototypes: `website/manual/getting-started/examples.md`
names all 28, links each to its folder, and gives the modules it exercises as
prose. That page is authored copy in a Manual that is otherwise generated, and it
duplicates the hub's catalogue — two copies of the same 28 titles and summaries.

This plan promotes that page into a top-level **Examples** section: the prototype
list becomes the sidebar, and each prototype gets a page that runs it in place,
beside its source link and the modules it exercises. The engine does not change —
the site becomes one more consumer of the examples, exactly as the hub is.

## Requirements

- WHEN a reader opens the Examples section, THE site SHALL show one sidebar entry
  per prototype under `examples/`, grouped as the Manual page groups them today:
  early rungs, 20 Games Challenge, proving a subsystem, harnesses.
- THE page for a prototype SHALL mount that prototype in the page, and SHALL link
  to the prototype's folder in the repository.
- THE prototype SHALL start on its own when its page loads, with no click, and
  SHALL offer Stop and Restart controls. WHERE the browser blocks audio until a
  gesture, THE page SHALL still run silently and unlock sound on the reader's
  first key press or click.
- THE prototype SHALL be torn down when the reader leaves or reloads the page, so
  no listeners or render loop outlive it.
- THE Examples section SHALL have an overview page at `examples/` (the header
  link's target and the sidebar's first entry) that introduces the section and
  lists the groups.
- THE Examples section SHALL be reachable from the header beside Manual and API
  reference, and SHALL have its own sidebar that the other two sections do not
  share.
- WHEN a prototype is added, removed or renamed under `examples/`, THE site SHALL
  need no edit beyond the catalogue's own data (`examples/manifest.ts`); a type
  error or a failing test SHALL name every other place that must follow
  (`examples/loaders.ts`, the hub's `package.json` dependency), and a test SHALL
  fail if the catalogue and the directory disagree.
- THE prototype metadata (title, one-line summary, controls, modules exercised,
  group) SHALL have a single source, consumed by both the hub and the site.
- IF a prototype needs cross-origin isolation to run its headline feature, THEN
  its page SHALL say so and SHALL still run in its non-isolated mode.
- THE engine SHALL NOT change (`src/` untouched), and the site SHALL import a
  prototype only through `@pierre/ecs-example-<name>/src/main.ts` — the same entry
  the hub uses (`examples/hub/src/main.ts:21`), never `../../src`.

## What the repository already supports (verified, not assumed)

- **Every prototype has the same mount contract.** All 28 `examples/*/src/main.ts`
  export `start(container: HTMLElement): () => void` (e.g.
  `examples/snake/src/main.ts:19`, `examples/doom/src/main.ts:26`,
  `examples/worker-offload/src/main.ts:70`). The hub depends on it
  (`examples/hub/src/main.ts:4`) and mounts into a `div` it creates itself, so a
  page needs a container element and nothing else. Standalone, each prototype
  mounts into its own `<div id="root">` (`examples/*/index.html`), which is the
  only place the prototype is coupled to its shell.
- **No prototype ships global CSS.** Global `html, body` rules live in each
  prototype's `index.html` as an inline `<style>` (27 of 29 `examples/*/index.html`
  files carry one) and never enter a JS bundle. The only stylesheet a module
  imports is class-scoped: `examples/card-battler/src/main.ts:11` imports
  `examples/card-battler/src/style.css`, whose every rule is under `.cb-root`.
  The single global stylesheet in the workspace belongs to the hub
  (`examples/hub/src/style.css:3`), which this plan does not embed. Mounting a
  prototype into a docs page therefore leaks no styling.
- **The weight is already lazy.** A measured hub build (`npm run build -w
  @pierre/ecs-examples-hub`) produces 3.48 MB / 101 files: a 19 kB landing chunk,
  one 4–31 kB chunk per prototype, one shared `three.module` chunk at 526 kB
  (136 kB gzip) for the 3D pages, and a 1.6 MB mp3 only the rhythm page loads. The
  58 MB under `examples/assets/` is source artwork; Vite bundles only what a
  prototype imports.
- **The prototypes are already catalogued once, in code.** `examples/hub/src/main.ts:15`
  holds all 28 entries with `title`, `summary`, `controls` and a literal
  `load: () => import(...)` (`:21`), typed by `ExampleSpec` (`:7`).
- **The Manual has a generated half and an authored half.**
  `renderManualPages()` (`scripts/manual.ts:486`) builds Core, Modules and the
  module index; `renderAuthoredPages()` (`scripts/manual.ts:417`) publishes the
  prose under `website/manual/**` verbatim. `scripts/manual.gen.ts:18` wipes
  `website/src/content/docs/manual` before writing (`:15` for the content root),
  and `.gitignore` already ignores the generated trees — a new generated
  directory needs the same entry.
- **MDX is available without new dependencies.** Starlight depends on
  `@astrojs/mdx` (`node_modules/@astrojs/starlight/package.json`), and the site
  already ships an MDX route (`website/src/content/docs/index.mdx`).
- **A section is a three-file change, done once before.** The group label in
  `website/astro.config.mjs` (beside `label: 'API reference'`, `:70`), the
  per-section split in `website/src/site-route-data.ts:20-21` (`MANUAL_GROUP` /
  `API_GROUP`, regrouped by `manualSidebar()` / `apiSidebar()`), and the header
  link list (`website/src/components/Header.astro:33`, entries at `:35`). The
  registered trap applies: a group added to the config alone is dropped by the
  middleware, so both must name it, and the rendered sidebar must be checked in
  the built HTML rather than inferred from a passing build.
- **The pipeline already publishes a built directory, and already typechecks the
  examples.** `.github/workflows/pages.yml` runs `npm run docs:site` and uploads
  `website/dist`. `ci.yml` runs four jobs: lint, test, `npm run typecheck` (three
  legs: root, `tsconfig.node.json`, and `astro sync` + `website/tsconfig.json`),
  and a separate `typecheck-examples` job (`ci.yml:61-72`) running
  `npm run typecheck:examples`.
- **The unused half of the idea is already noted.** `docs/roadmap/docs-site-roadmap.md`
  carries "Examples as a top-level section" as a candidate, gated on exactly this:
  a page per example.

## Decisions (settled before building)

- **The page mounts the prototype; it does not iframe it.** All 28 prototypes
  accept a container and inject nothing global, so an in-page mount gives the
  section the site's own chrome, one scroll context, and working deep links — and
  it is what the hub already proves works. An iframe stays available as the
  escape hatch for one prototype that misbehaves, and would be a page-local
  change, not a design change.
- **`start()` runs on page load.** Online demos of other libraries autoplay, and
  a click-to-play gate makes the section feel like a link list. The page renders
  the title, summary and controls, and mounts the prototype immediately. Three
  costs come with that, and each has a mitigation rather than a gate:
  - The prototypes attach keyboard listeners to the window, so Space and the
    arrows would scroll the page while a reader plays. The stage calls
    `preventDefault` for those keys only while the stage has focus or the
    pointer is over it (spike checks which prototypes need it).
  - Audio cannot start without a gesture. Prototypes must already tolerate a
    suspended audio context; the stage resumes it on the first key press or
    click. The spike confirms `rhythm` and any other audio prototype.
  - A render loop burns CPU/GPU while the page is being read. The stage stops the
    prototype when the tab is hidden or the stage has scrolled fully out of view
    (`IntersectionObserver` + `visibilitychange`), and Restart brings it back.
  Stop and Restart buttons are always available. The hub keeps its own Launch
  button; the two shells may differ on this.
- **Pages are generated MDX in the content collection, not a dynamic route.** The
  sidebar autogenerate, `Astro.locals.starlightRoute.id` in `Header.astro`, and
  the per-section regrouping in `site-route-data.ts` are all built for collection
  routes. A `src/pages/examples/[id].astro` using `StarlightPage` (exported at
  `@astrojs/starlight/components/StarlightPage.astro`) sits outside that path and
  would need its own resolved sidebar and its own route data.
- **One catalogue, in `examples/`, split into data and loaders.**
  `examples/manifest.ts` holds the data (id, title, summary, controls, group,
  optional challenge rung, modules, optional isolation caveat) and
  `examples/loaders.ts` holds the literal `import()` per id, typed as a record
  over the manifest's id union so a missing prototype is a type error rather than
  a runtime one. Adding a prototype therefore touches the manifest, the loaders
  and the hub's `package.json` (which lists every `@pierre/ecs-example-*`
  workspace as a dependency); the test in slice 1 checks all three against the
  directories, so nothing is silently forgotten. The hub consumes both — its inline `EXAMPLES` array and its
  loaders go away — and so does the site, which is what removes today's second
  copy. A dynamic specifier would defeat chunking, which is why the loaders stay
  a literal map even though the ids already exist in the manifest.
- **The prototypes keep their standalone shells.** Nothing moves out of
  `examples/<name>/index.html` or its Vite app; `npm run dev -w
  @pierre/ecs-example-<name>` keeps working as documented in `examples/README.md`.
  The site is an additional consumer, not a replacement shell.
- **The site's stage is its own component, not shared with the hub.**
  `website/src/components/ExampleStage.astro` owns the autostart, the Stop/Restart and
  fullscreen controls, the visibility pause and the teardown. The hub's equivalent markup is styled by the hub's own
  stylesheet, so sharing the code would drag the hub's CSS into the docs section
  to save about 60 lines of DOM wiring. What is shared is the contract
  (`start(container)`, gated), and it gets stated in `examples/README.md`.
- **Generated files land in the content tree, authored prose does not.** The
  prototypes' pages are generated into `website/src/content/docs/examples/`
  (gitignored, wiped by the generator, like the Manual's generated half). Only the
  data is authored, and it is authored in `examples/` where it describes the
  prototypes.
- **The section has a generated overview page.** `examples/index` is generated
  from the manifest like the prototype pages: a short introduction, then the
  groups with a card per prototype. It carries the intro copy the retired Manual
  page had.
- **No view transitions, so navigation is a full page load.** The site does not
  use Astro's `ClientRouter`, so leaving a page discards the prototype anyway.
  Teardown is still wired (`pagehide`, Stop, and the visibility pause) so the
  stage stays correct if the site adopts a client router later.
- **The Manual's examples page is deleted, not kept alongside.** It carries the
  same 28 summaries and the same module lists the manifest will carry; leaving it
  would recreate the duplication this plan removes. Its narrative grouping (early
  rungs → challenge → subsystems → harnesses) survives as the sidebar groups, and
  its inbound links are updated (`website/manual/index.md:45`,
  `website/manual/guides/tutorial.md:21`, `docs/agent/README.md:207`).
- **Cross-origin isolation is stated, not solved.** `examples/parallel-kernel`
  sets COOP/COEP through dev-and-preview middleware
  (`examples/parallel-kernel/vite.config.ts`) and degrades when
  `SharedArrayBuffer` is absent (`examples/parallel-kernel/src/main.ts:25`).
  GitHub Pages cannot send response headers, so the published page says the
  parallel toggle needs an isolated origin. Moving the site to a host that can set
  headers is a separate decision, recorded as such rather than implied.
- **No prototype is special-cased.** The 20 Games Challenge rung numbers and the
  isolation caveat are data in the manifest, so the generator has one code path.

## Slices

### 1. Catalogue: one source for the prototype list

`examples/manifest.ts` and `examples/loaders.ts`; the hub drops its inline array
and loaders and reads both. `scripts/examples.test.ts` asserts the manifest
matches the directories on disk: every `examples/*/package.json` whose name starts
`@pierre/ecs-example-` appears exactly once, no entry names a missing directory,
every workspace the hub depends on matches the manifest, the loaders record has
exactly the manifest's ids, and every module named in an entry exists under
`src/modules/`. (The renderer's one-page-per-entry check arrives with the
renderer, in slice 2.) No site change at all, so the diff is reviewable as
pure data movement — and the hub build plus a browser pass over the hub is what
proves it did not change behaviour.

### 2. Two prototypes, mounted from the site

Add `website/src/components/ExampleStage.astro` (container + autostart +
Stop/Restart + fullscreen + visibility pause + teardown), the pure renderer in `scripts/examples.ts` and its CLI
`scripts/examples.gen.ts` writing into `website/src/content/docs/examples/`
(gitignored, wiped first), and generate the overview page plus exactly two prototype pages: `snake` (canvas, no
assets, no worker) and `worker-offload` (worker, posts, graph). Those two cover
the two risky shapes — a plain canvas mount and a worker whose URL has to come out
base-correct under `website/astro.config.mjs`'s `base`. The spike also answers whether
`astro.config.mjs` can import `examples/manifest.ts` (Astro loads its config
through Vite, so it should) and what the keyboard and audio handling above needs.
Neither page is in a
sidebar yet, so this slice changes no published navigation and can be visited
directly at its URL.

### 3. The section

Generate all 28 pages; declare the `Examples` group in `website/astro.config.mjs`
with explicit `link` entries built from the manifest and grouped by category;
teach `site-route-data.ts` to cut the section (a third label beside
`MANUAL_GROUP` / `API_GROUP`, and an `examplesSidebar()` that returns the group's
resolved entries plus the Overview link); add the third header link in
`Header.astro`. Record the site build's size and time next to the hub's 3.48 MB baseline, since
Pages now carries every prototype chunk. Verified by grepping the built `website/dist/**/index.html` for the
group labels and an entry per prototype, not by trusting a green build.

### 4. Retire the Manual page

Delete `website/manual/getting-started/examples.md`, drop its
`AUTHORED_ORDER` entry (`scripts/manual.ts:37`), and repoint the two inbound
links. Each generated page carries what the entry carried: the summary, the
controls, the source link, the modules exercised as links into the Manual's
module pages, and the challenge rung where there is one.

### 5. Guards, docs and CI

No CI edit is needed: the `typecheck-examples` job (`ci.yml:61-72`) already runs
`npm run typecheck:examples`, which is what checks the catalogue once the hub
imports it. Confirm that coverage rather than assuming it, because the site build
now compiles every prototype's source and a prototype that stops typechecking
must fail CI instead of shipping as a page that cannot mount. Note the mount
contract in `examples/README.md` (a prototype exports `start(container)` and is
safe to mount in a foreign page), and update `docs/roadmap/docs-site-roadmap.md`:
the Examples candidate is shipped, and open roadmap files list open work. The
file has no "Deferred" section today, so the deferred items below get one. A peer
review of the whole change is the last gate before the plan moves to `done/`.

## Deferred, and where it lives

- **A per-prototype poster image.** The section ships with the text card, no
  art. If it turns out to want visual anchors, that is a docs-site roadmap item
  (it needs a capture step and a place for the images).
- **Cross-origin isolation for the hosted `parallel-kernel`.** Belongs with the
  hosting decision in `docs/roadmap/docs-site-roadmap.md`, not in this plan.
- **A runnable Example block inside module guides** ("see it in use"). Same data
  would support it; it is a Manual change, so it goes to the backlog after this
  section exists.

## Checklist

Slice 1 — catalogue:

- [ ] Write `examples/manifest.ts`: 28 entries with id, title, summary, controls,
      group, modules, challenge rung where applicable, isolation caveat for
      `parallel-kernel`. Copy is lifted from `examples/hub/src/main.ts:15` and
      `website/manual/getting-started/examples.md`, reconciled where the two
      disagree.
- [ ] Write `examples/loaders.ts` as a record over the manifest's id union, one
      literal `import('@pierre/ecs-example-<id>/src/main.ts')` each.
- [ ] Point `examples/hub/src/main.ts` at both; delete the inline `EXAMPLES`
      array and the inline loaders. Page copy and behaviour unchanged.
- [ ] Keep the hub importing both files. `examples/hub/tsconfig.json` includes
      only `src`, and TypeScript checks what an included file imports, so the
      hub's import is what puts the catalogue in the program that
      `npm run typecheck:examples` checks — the record that turns a missing
      prototype into a type error included. An import from the site alone would
      never be typechecked.
- [ ] Add `scripts/examples.test.ts`: the manifest against
      `examples/*/package.json`, `examples/hub/package.json` dependencies, the
      loaders record's keys and `src/modules/`, so a prototype missing from any
      side fails `npm test` rather than vanishing from the site.
- [ ] Gates: `npm run lint`, `npm test`, `npm run typecheck`, `npm run
      typecheck:examples`, `npm run build -w @pierre/ecs-examples-hub`.
- [ ] Hand the hub to Pierre to confirm each prototype still launches.

Slice 2 — two prototypes from the site:

- [ ] Add `website/src/components/ExampleStage.astro`: renders the prototype's
      title, summary and controls and a `div` the prototype mounts into; calls
      `start()` on load; Stop and Restart buttons; pauses when the tab is hidden
      or the stage is scrolled out of view; tears down on `pagehide`; keeps the
      hub's fullscreen affordance; keeps Space/arrows from scrolling the page
      while the stage is focused or hovered; resumes audio on the first gesture.
- [ ] Add `scripts/examples.ts` (pure: manifest → page markdown with frontmatter,
      including the `examples/index` overview page)
      and `scripts/examples.gen.ts` (CLI: wipe and write
      `website/src/content/docs/examples/`).
- [ ] Add `website/src/content/docs/examples/` to `.gitignore` beside the
      Manual's generated entry.
- [ ] Extend `scripts/examples.test.ts`: the renderer emits one page per manifest
      entry plus the overview.
- [ ] Generate the overview, `snake` and `worker-offload` only; wire the generator into
      `docs:manual` / `docs:site` in `package.json`.
- [ ] Gate: `npm run docs:site` succeeds and the two pages start their prototype
      on load, with the worker URL resolving under the Pages base path. Claude
      drives both pages in the pre-installed Chromium (Playwright: no console
      errors, canvas painting, Stop/Restart work, Space does not scroll) and
      reports; Pierre then confirms by eye.
- [ ] Record in the plan what the spike proved or broke: whether Astro bundles a
      workspace TS package imported from an `.astro` script, whether the worker
      chunk gets the `base` prefix, the added build time, and whether
      `website/tsconfig.json` needs `examples/loaders.ts` in `include` for the
      typecheck leg, and whether `astro.config.mjs` can import the manifest.

Slice 3 — the section:

- [ ] Generate all 28 pages, grouped by category. Sweep every page in Chromium
      (starts, no console errors, audio prototypes run silently until a gesture);
      record the site build's size and time.
- [ ] Declare the `Examples` group in `website/astro.config.mjs` (explicit link
      entries from the manifest; Starlight's `{ label, items: [{ autogenerate }] }`
      shape is not needed for explicit links).
- [ ] Add `EXAMPLES_GROUP` and `examplesSidebar()` to
      `website/src/site-route-data.ts`, keeping the Manual and API sidebars
      untouched.
- [ ] Add the third entry to `Header.astro`'s `sections`.
- [ ] Gate: grep the built `website/dist/**/index.html` for the `Examples` group
      label, the category labels and one entry per prototype; confirm the Manual
      and API sidebars are unchanged. Pierre verifies the navigation in the
      browser.

Slice 4 — retire the Manual page:

- [ ] Delete `website/manual/getting-started/examples.md` and its
      `AUTHORED_ORDER` entry.
- [ ] Repoint `website/manual/index.md:45` and
      `website/manual/guides/tutorial.md:21` at the new section (correct relative
      depth for a page's own URL, per the Manual's link rules), and fix the count
      in the index's own copy at `:45` — it says 29 prototypes while `examples/`
      holds 28 next to `hub/` and `assets/`.
- [ ] Repoint `docs/agent/README.md:207`, which describes the retired page as
      the hand-written prototype list.
- [ ] Confirm nothing links to the retired route: `npm test` runs the Manual's
      route check.
- [ ] Gate: `npm run docs:site`, then Pierre confirms no Manual page lost content.

Slice 5 — guards, docs, roadmap:

- [ ] Confirm the `typecheck-examples` job (`ci.yml:61-72`) typechecks the
      catalogue through the hub's import; no CI edit.
- [ ] State the mount contract in `examples/README.md`.
- [ ] Delete the "Candidate, not yet wanted" block at
      `docs/roadmap/docs-site-roadmap.md:31-35`: the candidate shipped, and an
      open roadmap lists open work. Add a "Deferred" section there and file
      the deferred items above in it.
- [ ] Peer review of the full change before the move.
- [ ] Move this plan to `docs/plans/done/` in the same commit as the final
      change, and re-run `npm test` after the move.
