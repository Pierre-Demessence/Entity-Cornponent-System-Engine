# Core hygiene sweep + architecture boundary guard

A review of the core (`src/*.ts`) surfaced six defects that stand on their own,
independent of any new roadmap entry: one false row in the gap ledger, three
cases of consumer-facing doc drift, and two breaches of the engine's own
layering rules. This plan closes them and adds a test so the layering rules
cannot regress silently.

## Scope

- **In:** `docs/roadmap/engine-gap-ledger.md`,
  `docs/roadmap/ecs-module-backlog.md`, `docs/archived/audits/`, `src/world.md`,
  `src/query.md`, the `lifecycle` JSDoc in `src/world.ts`,
  `src/modules/render-dom/README.md`, `src/modules/tilemap/**`,
  `scripts/architecture.test.ts`, and the boundary clause in `AGENTS.md`.
- **Out:** any change to `EcsWorld`'s public surface, and the new core-roadmap
  entries, which are planned separately in `core-roadmap-completeness-entries.md`.

## Findings (verified @ src)

| # | Defect | Evidence |
|---|---|---|
| **A** | A gap-ledger row asserts tags emit no lifecycle event. False twice over: the events exist, and the consumer's per-frame zone walk is a render pass, not change polling. | `src/lifecycle.ts:18-19` (`TagAdded` / `TagRemoved`), emitted at `src/world.ts:357,361`; the consumer iterates zones to *draw* them — `examples/card-battler/src/render.ts:238-247`. No `lifecycle` reference anywhere in `examples/card-battler/**`. |
| **B1** | `src/world.md` omits the tag events from its `lifecycle` row, and its `enableSpatial` row names a `SpatialIndex` type that does not exist. | `src/world.md` vs `src/lifecycle.ts:14-19` and `src/spatial-structure.ts` (`SpatialStructure`) |
| **B2** | The `lifecycle` JSDoc in `src/world.ts` lists only four of the six events. This text is published through TypeDoc to the site's `/api/` reference. | `src/world.ts:33-35` |
| **B3** | `src/query.md` documents only the standalone scan path; the shipped archetype-index path is unmentioned, so the guide understates what a query costs. | `src/query.md` vs `src/query.ts:75-92` + `src/archetype-index.ts` |
| **C1** | A module imports the package barrel — `from '@pierre/ecs'` — contradicting AGENTS.md's "**No module imports from `@pierre/ecs` itself**". | `src/modules/tilemap/spawn.ts:1` |
| **C2** | One module reaches its siblings through the package specifier (`@pierre/ecs/modules/*`) while the rest of `src/` spells sibling imports relatively (`../<name>/…`), so the same file can be reached by two identities. | `src/modules/tilemap/{atlas,collision-grid,spawn,tile-transform}.ts` and their tests, vs the relative form in 76 edges elsewhere — e.g. `../transform/position` in `src/modules/kinematics/kinematics-system.ts` |
| **C3** | Core imports a module implementation. | `src/world.ts:13` → `#modules/spatial/hash-grid-2d` |
| **C4** | `modules/render-dom` consumes `modules/render-canvas2d` and `modules/transform` without documenting either, breaching the documented-dependency half of the AGENTS.md invariant. Surfaced by the new guard, not by reading. | `src/modules/render-dom/dom-renderer.ts:7-8` vs `src/modules/render-dom/README.md` |

## Decisions

### C3 — the core `HashGrid2D` import stays, as one documented carve-out

[`extending-the-engine.md`](../../extending-the-engine.md) commits to this
explicitly: `enableSpatial` accepts any `SpatialStructure` "with `HashGrid2D`
as the convenient default", and that pair is the document's worked example of
the *Good defaults, never mandatory assumptions* principle. So the edge is a
blessed default, not an oversight.

The cost is real and worth naming: a class method cannot be tree-shaken, so
every `EcsWorld` consumer carries `HashGrid2D` whether or not it enables
spatial indexing — a genuine dent in *Pay for what you use*. The alternative
(make `structure` required; let `modules/spatial` export the convenience) would
break the public surface, contradict the governance principle above, and charge
an import on the common 2D case. Rejected for now. The guard permits exactly
this one edge and fails on any new one, so the decision stays visible rather
than becoming folklore.

### The guard encodes three rules, not two

C1 and C2 are the same defect at different scales — *inside `src/`, import
through the `#` aliases, never through the package specifier* — so they share
one rule. The mistake that rule cannot catch is a deliberate one: `#index`
resolves to `src/index.ts`, the same file `exports["."]` publishes, and ~50
modules import it for core types. That is allowed — an alias resolves to one
absolute path and cannot double-identify a file the way the package specifier
can — and the rule says so in place rather than leaving the gap to be
discovered.

A second rule enforces AGENTS.md's other module-boundary half: a cross-module
import must be documented in the importing module's README. It covers both
spellings, because the relative form (`../<name>/…`) is the dominant one — 76
edges against 23 for the alias. It is **not** retrospective: running it
surfaced one real breach (C4), which this plan fixes, and it found that the
remaining candidate was a test-only edge. Tests are therefore exempt — a
fixture may pull from any module without that becoming shipped surface. The
barrel requirement stays scoped to the alias spelling, since normalizing
`../<name>/<file>` deep imports is a migration, not a guard.

### The one sanctioned core → module edge is asserted, not assumed

Rule 2 fails on any new core → module import and permits exactly the C3 pair,
so the decision above is encoded where it can be seen rather than living in a
paragraph someone has to remember.

## Tasks

- [x] 1. Add `docs/archived/audits/2026-09-28-ledger-correction.md` freezing the
      corrected row as **Resolved**, and delete the row from
      `docs/roadmap/engine-gap-ledger.md` (leaving the carried-rider row).
- [x] 2. Correct the `modules/card-interaction` entry in
      `docs/roadmap/ecs-module-backlog.md`: drop the false "tags emit no
      lifecycle event" premise, keeping the tag-vs-component representation
      choice.
- [x] 3. Fix `src/world.md`: the `lifecycle` row lists all six events; the
      `enableSpatial` row names `SpatialStructure` / `HashGrid2D`.
- [x] 4. Fix `src/query.md`: document the archetype-index path alongside the
      scan path.
- [x] 5. Fix the `lifecycle` JSDoc in `src/world.ts`. The generated catalog
      lists no class members, so this edit cannot move it; the text is
      published through TypeDoc at `/api/`.
- [x] 6. Repoint `src/modules/tilemap/**` at `#` aliases.
- [x] 7. Document `modules/render-canvas2d` and `modules/transform` in
      `src/modules/render-dom/README.md` (finding C4), and record the
      test-file carve-out in `AGENTS.md`'s module-boundary invariant.
- [x] 8. Add `scripts/architecture.test.ts` with the three rules, plus
      self-proving tests for the rules and for the specifier scanner.
- [x] 9. Verify: `npm run lint`, `npm run typecheck`, `npm test`.
- [x] 10. Peer review — waived by the maintainer; the verification gates above
      stand as the check.

## Verification

- `npm test` — the new guard, the engine-api drift test, and the docs link /
  status-doc suites.
- `npm run typecheck` — all three legs.
- `npm run lint`.
- Manual: the guard's rules are proven by synthetic-input tests inside
  `scripts/architecture.test.ts`, and the scanner by its own test, so a rule
  cannot silently degrade to vacuous.

## Notes

- The guard reads `src/` only. `examples/**` are separate workspace packages and
  are *expected* to depend on `@pierre/ecs` through its exports map.
- `scripts/architecture.test.ts` follows `scripts/docs.test.ts`: a repo-wide
  rule expressed as a test, so it runs in CI rather than depending on review
  attention.
