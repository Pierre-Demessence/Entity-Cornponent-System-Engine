# Website

How the published site (`website/`, Astro + Starlight, deployed to GitHub Pages)
is generated. Read it before changing `website/`, the generators in `scripts/`
(`manual.ts`, `examples.ts`) or `examples/manifest.ts`.

## Sections

A consumer-facing site with three sections sharing one theme and one
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

## Sidebars: one per section

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

## Header links

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

## Build and generators

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
  **Examples** section rather than as a Manual page (most folders under
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

