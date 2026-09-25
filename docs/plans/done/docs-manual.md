# Manual section — module guides rendered from the module READMEs

Add a `/manual` section to the published site: one guide page per opt-in
module, rendered from that module's own `src/modules/<name>/README.md`. This is
the consumer-facing "Manual" half of the Unity-style split, sibling to the
existing `/api` reference.

## Why not TypeDoc's own documents

`projectDocuments` was spiked first and it does work (41 documents, no filename
collision — TypeDoc disambiguates by folder), but it costs three things that
matter for a manual:

- guide URLs are structural: `/manual/documents/behavior-tree_README.html`;
- sidebar titles are raw paths (`behavior-tree\README`) unless all 41 READMEs
  gain YAML frontmatter — which GitHub then renders rather than hides;
- the guide list lands on `/manual/modules.html`, not `/manual/`.

Rendering the READMEs directly costs one small dependency and buys clean URLs
(`/manual/behavior-tree.html`), titles taken from the READMEs, and an index
whose ordering and wording we control.

## Decisions

- **The READMEs are the single source of truth** — the same files maintainers
  and agents read. Nothing is copied into `website/`, and no frontmatter is
  added.
- **Generated HTML is never committed**, same as the API: written to
  `_site/manual` and built in CI.
- **Link rewriting, three rules**, because the READMEs are written *inside* the
  repo and the site is not:
  - `../<module>/README.md` (14 distinct targets, 27 occurrences) →
    `/manual/<module>.html`, so the guides interlink;
  - `../../..*/examples/<name>/` → the GitHub tree URL;
  - `../../..*/docs/**` → **unlinked** (text kept, link dropped). `docs/**` is
    internal and must not be advertised from the public Manual.
  - Anything else relative that cannot be resolved is left untouched.
- **Rewriting skips fenced code blocks.** Several READMEs contain code samples
  with bracket syntax; rewriting inside a fence would corrupt the example.
- **No syntax highlighting in v1.** Code blocks are styled like the landing
  page's. Adding a highlighter is a separate decision.
- **Styling follows the landing page, not TypeDoc's theme**: the Manual is
  consumer-facing prose, the API reference is a reference.

## Peer review → LGTM

One pass, 4 should-fixes and 13 nits, all addressed or explicitly left:

- **`summaryOf` mangled text.** Stripping `*` and `_` blanket-wise turned
  `A\* pathfinding` into `A\ pathfinding` and `bevy_pathfinding` into
  `bevypathfinding` on the index page. Markup is now *unwrapped* (links, code
  spans, paired emphasis) and backslash escapes are removed, and
  `scripts/manual.test.ts` asserts both strings survive.
- **`attach` was silently missing.** It ships as a module but has no README, so
  the Manual had 41 of 42 guides with no signal. The build now names skipped
  modules; writing that README is left as follow-up work.
- **Stale docs.** `docs/agent/README.md` still described a two-section site and
  claimed the site shows "only the landing page and the API reference", which
  stopped being true. Both it and `README.md` now cover the Manual.
- **The landing page had no path to `/manual`.** Added to its nav, body and
  footer.
- Fixed from the nits: stale pages are cleared before writing (a deleted README
  used to leave its guide behind), and each guide now carries its own meta
  description rather than one generic string.
- Left deliberately, with rationale: no syntax highlighting (a separate call);
  inline-code and reference-style links are not rewritten (no occurrences
  today, and the fence guard covers the real risk); `marked` does not sanitise
  raw HTML — not a live risk while every input is a repo-authored file, but
  worth a one-line sanitiser if READMEs ever accept pasted HTML.

Verified independently: zero `docs/` hrefs in the built Manual (the only
`docs/` match is an external MDN URL), all 100 fenced blocks byte-faithful,
locale-independent ordering, and contrast passing in both colour schemes.

## Checklist

- [x] `scripts/manual.ts` — pure `renderManualPages()`.
- [x] `scripts/manual.gen.ts` — CLI writer into `_site/manual`.
- [x] `scripts/manual.test.ts` — guards link rewriting, no `docs/` leakage,
      code-sample integrity, stable output.
- [x] `website/manual.css` — prose + guide-nav styling.
- [x] `website/index.html` — a path from the landing page to `/manual`.
- [x] `package.json` — `marked` devDep, `docs:manual`, wired into `docs:site`.
- [x] `typedoc.json` — a "Manual" link in the API site's header.
- [x] Docs: `docs/agent/README.md`, `README.md`.
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test`.
- [x] Peer review → LGTM (no edits, no `vscode_askQuestions`).
- [x] Move this plan to `docs/plans/done/` in the same commit.
