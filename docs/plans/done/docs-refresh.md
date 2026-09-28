# Docs refresh

Doc drift found in a whole-project review: entry-point docs that describe an
older engine, a stale assessment still linked as evidence, and literal
`\u2014` escapes in comments (they reach the API reference as text).

## Changes

- `README.md` — "What's included" describes the current core: columnar
  storage, the archetype-indexed query, deferred commands, liveness,
  lifecycle, plugins, the tick runner, and a pointer to the module catalog.
  The spatial index is described as the `SpatialStructure` interface with the
  `HashGrid2D` default, and the event bus by its real features. The quick start
  uses `simpleComponent`, not a hand-written `ComponentDef` with an unchecked
  `raw as Pos` cast.
- `website/src/content/docs/index.mdx` — same quick start.
- `docs/engine-readiness-assessment.md` → `docs/audit/`, flagged as a
  point-in-time audit dated by git (no date stamp). Its "no SoA / pooling /
  workers" and "no 3D stack at all" claims predate shipped work; the two
  backlog citations point at the new path, and `docs/README.md` lists it.
- Replace literal `\u2014` / `\u00d7` escapes in comments with the characters
  they encode.

## Checklist

- [x] README "What's included" + quick start
- [x] Site landing quick start
- [x] Move readiness assessment to `docs/audit/`; repoint backlog links; list in `docs/README.md`
- [x] Fix escaped characters in comments
- [x] lint + typecheck + tests green
- [x] Peer review (haiku, one pass) — LGTM
