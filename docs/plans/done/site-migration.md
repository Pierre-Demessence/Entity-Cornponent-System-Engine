# Site migration — Astro + Starlight (home / manual / api)

Replace the hand-rolled three-way site — a static landing page, a bespoke Manual
renderer, and TypeDoc's own HTML bolted in at `/api` — with one Astro +
Starlight site, so every section shares a theme, a sidebar and one search index.

## Goals

1. **Homepage** with a navbar reaching the Manual and the API reference, and
   room for more links later.
2. **API reference** — TypeDoc, rendered as Starlight pages.
3. **Manual** — the module guides, with a sidebar listing every module that stays
   visible while reading a guide.

Explicitly **out of scope for now**: splitting the Manual into "using the engine"
and "module reference", and authoring core-engine guide pages. The README's
current content covers what is needed today.

## Why now

The trigger is not content volume but site furniture, which static pages do badly
and a docs framework does natively:

- a sidebar cannot exist across hand-written pages;
- three styling systems (landing CSS, manual CSS, TypeDoc's theme) do not read as
  one site — the API section in particular looked foreign;
- syntax highlighting needs Shiki.

## Decisions

- **Astro + Starlight is the site shell.** One theme, one sidebar, Pagefind
  search across every section, Shiki highlighting in light and dark.
- **`starlight-typedoc` renders the API as Starlight pages** rather than embedding
  TypeDoc's HTML. This is the specific reason the API stops looking like a
  different website: it inherits the same chrome and search.
- **The Manual's source of truth stays `src/modules/<name>/README.md`**, read at
  build time by `scripts/manual.ts`, which generates one markdown page per module
  (with `title` / `description` frontmatter) into
  `website/src/content/docs/manual/`. That directory is gitignored, so no README
  is copied by hand and no frontmatter is added to the READMEs themselves.
- **`docs/**` stays unpublished.** Astro's markdown pipeline cannot know that, so
  the current renderer's link rule survives in some form.
- **Only the presentation is deleted.** `website/index.html`, `website/style.css`,
  `website/manual.css`, `website/api-readme.md`, `typedoc.json` and the `marked`
  dependency are gone. `scripts/manual.ts` and `manual.gen.ts` survive — smaller,
  and now emitting markdown rather than HTML — because a transform is still
  required: `docs/**` links must never be published, and the READMEs'
  repo-relative links need pointing at GitHub or at sibling guides.
- **Site dependencies live in the root `devDependencies`**, and the site is built
  with `astro --root website`. Not a workspace: `typecheck:examples` runs
  `npm exec --workspaces`, so a new workspace would drag the site into that gate.
- **Routes**: `/` home, `/manual/...` guides, `/api/...` reference.
- **Generated output stays gitignored** and is built in CI, as now.

## Found while building

Each of these was a wrong assumption caught only by building it:

- **TypeDoc resolves paths from the repo root**, not the Astro root, because that
  is where the npm script runs. `../src/...` therefore pointed outside the repo.
  Entry points are now derived from the `exports` map verbatim.
- **Starlight does not register its own content collection.** Without
  `src/content.config.ts` the `docs` collection is empty, and the build
  "succeeds" while publishing one page and silently ignoring every generated
  guide. This is the failure worth remembering.
- **Starlight prefixes its own links with `base`, but not links written in
  frontmatter or components.** The home hero's `/manual/` would have 404'd under
  `/Entity-Cornponent-System-Engine/`; the links are now relative.
- **`starlight-typedoc` puts the TypeDoc readme at `/api/readme/`**, leaving
  `/api/` empty. The API landing is now an authored page, `content/docs/api.md`.
- **Generated output must be in ESLint's ignores.** A stale `_site/` from the
  previous approach produced 8,168 lint errors; `website/dist` and the generated
  content directories are now ignored.
- **The site's TypeScript sat outside the type gate.** `npm run typecheck` covered
  `src/`, `scripts/` and the root configs, so `astro.config.mjs` and
  `content.config.ts` were never checked. The script now runs
  `astro sync --root website` (which emits the `astro:content` types the site
  imports) and then `tsc -p website/tsconfig.json`. There are no `.astro` files,
  so `astro check` would add a dependency for nothing.
- **`typeDocSidebarGroup` is matched by label, not by reference.** It is an empty
  placeholder that the plugin swaps for the generated group only when it finds an
  entry whose label is equal, so spreading its `items` at config-eval time splices
  in an empty array and the replacement never fires — the entire API tree
  disappears from the sidebar while every API page still builds. It must be placed
  in the sidebar untouched; the group label comes from the plugin's `sidebar`
  option, not from the wrapper.
- **A section needs a landing page.** The home hero and the README both linked to
  `/manual/`, but only per-module pages were generated, so the section root 404'd.
  The generator now emits `manual/index.md`. The same trap applies to
  `/api/`, which is why the API landing is an authored page.

## Checklist

- [x] Add `astro`, `@astrojs/starlight`, `starlight-typedoc`,
      `typedoc-plugin-markdown`.
- [x] Astro project skeleton in `website/` (config, tsconfig, content config).
- [x] Home page with the navbar.
- [x] Manual content collection generated from `src/modules/*/README.md`.
- [x] API section via `starlight-typedoc`.
- [x] Link transform for the READMEs (`docs/**` unlinked, `examples/` → GitHub).
- [x] `docs:site` builds the Astro site; Pages publishes `website/dist`.
- [x] Generate a `/manual/` landing page, so the section root is a route.
- [x] Delete the hand-rolled HTML/CSS presentation and drop `marked`.
- [x] Docs updated: `docs/agent/README.md`. (`README.md` needed no change — its
      site links were already correct.)
- [x] Gates: lint, `npm run typecheck` (covering the site too), 84 files /
      1434 tests; 540 pages built.
- [x] Peer review → LGTM (five read-only rounds; no edits, no
      `vscode_askQuestions` from the reviewer). Each round found real defects,
      including three that only a running page or the plugin's source revealed.
- [x] Move this plan to `docs/plans/done/` in the same commit.
