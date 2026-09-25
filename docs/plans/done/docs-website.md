# Docs website — landing page + TypeDoc at `/api`

Publish a consumer-facing GitHub Pages site for `@pierre/ecs`: a simple landing
page presenting the engine, plus the generated TypeDoc API reference as a
**route of the same site**. Nothing here publishes the repo's `docs/**`, which
stays internal — maintainer/agent documentation that GitHub already renders for
anyone reading the source.

## Decisions (settled before building)

- **No docs framework.** Starlight / VitePress were considered and rejected.
  Their value is ingesting many markdown pages into a sidebar with unified
  search; the internal `docs/**` tree is explicitly *not* published, so that
  value does not apply and the dependency cost is not earned. Astro for the
  landing page alone remains an available upgrade — it would not change the
  artifact layout below.
- **TypeDoc is a route, not the whole site.** It ships at `/api/`, leaving `/`
  for the landing page and room for more pages later. `/api/` rather than
  `/docs/` so it does not read as the repo's internal `docs/` folder.
- **Generated HTML is never committed.** CI builds TypeDoc and assembles the
  artifact on every deploy, so the published reference cannot drift from source.
  The spike produced 557 files / 6.4 MB — not something to put in git.
- **Pages deploys from a GitHub Actions artifact**, not a branch folder.
  Branch-based `/docs` publishing would serve the repo's *internal* docs folder
  at the site root: exactly inverted from what we want.
- **Relative links, absolute canonical.** TypeDoc emits relative links (verified
  in the spike), so it works under `/api/` with no path rewriting —
  `useHostedBaseUrlForAbsoluteLinks` stays `false`. `hostedBaseUrl` is set only
  for canonical tags and the sitemap.
- **Public-facing means scope control.** `excludeInternal: true`, so anything
  tagged `@internal` never reaches the published site.
- **The deploy does not re-run the test suite.** CI already gates `main`; the
  Pages job fails on its own if TypeDoc cannot resolve the entry points.
- **`githubPages: false`.** Jekyll never runs for artifact deploys, so the
  `.nojekyll` file TypeDoc would write is dead weight.

## Layout

Source (committed):

```
website/
  index.html      landing page
  style.css
typedoc.json      TypeDoc config (the output path is a CLI argument)
.github/workflows/pages.yml
```

Artifact (built in CI, never committed):

```
_site/
  index.html      from website/
  style.css
  api/            TypeDoc output
```

Served as `<owner>.github.io/Entity-Cornponent-System-Engine/` and
`.../Entity-Cornponent-System-Engine/api/`.

## Manual step (cannot be automated)

Repo **Settings → Pages → Source = GitHub Actions**. Until that is flipped the
deploy job has nowhere to publish.

## Landing page content

Short and factual — this is a pre-1.0 engine with no published release:

- A one-paragraph description of what `@pierre/ecs` is.
- A quick-start code block (register a component → spawn → query) taken from
  `README.md`.
- Prominent links to the API reference (`./api/`) and the GitHub repo.
- A plain note that it is pre-1.0 and consumed as source.

Styling follows the repo's colour guidance: light neutral background, dark
neutral text, one cool accent, no hot-colour backgrounds, checked contrast.

## Found while building

- **The README cannot be the `/api/` index.** It links into `./docs/**`, which is
  internal and unpublished, so those links would 404 on the site — and TypeDoc
  also warned it could not copy `docs/`. Fixed by giving the reference its own
  index, `website/api-readme.md`, via `readme`; the warning went (15 → 14) and no
  internal link reaches the published HTML.
- **`headings.readme: false`.** Without it the page rendered `@pierre/ecs` twice:
  once as the site title and once from the readme's own `#` heading.

## Peer review → LGTM

One pass, one should-fix — this checklist was unticked, which the edit above
fixes. Independently verified: every `typedoc.json` key is real in 0.28; `/api/`
renders styled and search-capable under the subpath (relative asset paths
resolve — the whole reason a subpath works); contrast ratios 14.97:1 light body,
5.67:1 light muted, 15.15:1 dark body, 7.83:1 dark muted; the four pinned action
majors are current; `cp -r website/. _site/` cannot clobber `_site/api`;
`package-lock.json` carries typedoc so CI's `npm ci` resolves; no `docs/**`
content is published.

## Checklist

- [x] `typedoc.json` — auto-discovered entry points from `package.json`
      `exports` (59 verified in the spike), `name`, `hostedBaseUrl`,
      `navigationLinks` to the site root and GitHub, `excludeInternal`.
- [x] Add `typedoc` to `devDependencies` so `npm ci` installs a pinned version.
- [x] `website/index.html` + `website/style.css` — the landing page.
- [x] `.github/workflows/pages.yml` — build job (TypeDoc → `_site/api`,
      landing → `_site`) and a least-privilege deploy job (`pages: write`,
      `id-token: write`), matching `ci.yml` conventions (Node 22, `npm ci`,
      `timeout-minutes`, `concurrency`).
- [x] Document it: `docs/agent/README.md` (Key Paths + Scripts),
      `README.md` (link the published site).
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test` (83 files / 1425
      tests green).
- [x] Peer review → LGTM (no edits, no `vscode_askQuestions`).
- [x] Tear down the spike: kill the `:8123` server, delete the temp output.
- [x] Move this plan to `docs/plans/done/` in the same commit.

## Prerequisite before the first deploy

Repo **Settings → Pages → Source = GitHub Actions**. Until that is set the deploy
job has nowhere to publish, so a push before it fails the workflow. Recorded
durably in [`docs/agent/README.md`](../../agent/README.md).
