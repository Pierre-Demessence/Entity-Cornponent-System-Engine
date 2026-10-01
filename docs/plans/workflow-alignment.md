# Workflow alignment

## Goal

Bring this repo's process files and docs layout in line with the current global
instructions (`pierre-workflow.instructions.md`): one `AGENTS.md`
for agents, `docs/backlog.md` / `docs/decisions.md` / `docs/roadmap.md` for
status, plans deleted when finished, no archive folders, no docs index.
Engine code and the published site do not change behavior.

## Findings (current state vs the instructions)

| # | Instruction | Current state |
|---|---|---|
| F2 | `AGENTS.md` holds commands, layout, conventions, invariants | Split: `AGENTS.md` + `docs/agent/README.md` (261 lines), invariants duplicated in both (`AGENTS.md:82-101`, `docs/agent/README.md:248-261`) |
| F3 | `AGENTS.md` matches the current setup | Points at `~/.copilot/instructions/` (`AGENTS.md:4`) and `taming-copilot.instructions.md` (`AGENTS.md:63`), which no longer exist |
| F4 | Finished plans are deleted; no `docs/plans/done/` | `AGENTS.md:125-132` and `docs/agent/README.md:261` mandate moving to `docs/plans/done/`; 98 files there |
| F5 | No `docs/archived/` | 11 files in `docs/archived/`; `scripts/docs.test.ts:11-21` exempts it from the link check |
| F6 | No `INDEX.md` (docs map) | `docs/README.md` is a docs index |
| F7 | `docs/backlog.md`, one line per item | Open work spread over `docs/roadmap/core-engine-roadmap.md` (112 lines), `ecs-module-backlog.md` (1272 lines, 61 multi-paragraph entries), `docs-site-roadmap.md`, `engine-gap-ledger.md` |
| F8 | `docs/decisions.md` (what, why, rejected alternatives) | `docs/roadmap/non-goals.md` holds declined decisions; other decisions live only inside done plans or `docs-site-roadmap.md:12-19` |
| F9 | `docs/roadmap.md` for milestones; reached milestones deleted | `docs/twenty-games-challenge.md` ticks done rows (`✅ done`) |
| F10 | Audits are point-in-time work under `docs/plans/`, deleted when finished | `docs/audit/engine-readiness-assessment.md`, `docs/audit/next-examples-coverage.md` kept as "reference" |
| F11 | Present tense, no history narration | E.g. `docs-site-roadmap.md:29-30` ("are shipped, and … is the record"), `engine-readiness-assessment.md:5` ("have shipped since") |
| F12 | Code comments don't point at stale paths | `src/column-store.ts:58` and `src/modules/worker-pool/worker-pool.ts:45` cite `docs/plans/ecs-parallelism-and-soa-storage.md`, which is under `done/` |
| F13 | Plans only for large tasks; medium tasks need verification + one review | `AGENTS.md:127` requires a plan for all "non-trivial" work |

Already compliant: `.gitignore`, lint/typecheck/test gate (Husky + CI), no
frontmatter in plain docs, tests colocated, commit-on-`main`, no worktrees.

Baseline (before any change): `npm run lint` clean, `npm run typecheck` clean,
`npm test` 124 files / 2238 tests passing.

## Acceptance criteria

- THE SYSTEM SHALL keep all agent-facing commands, layout, conventions and invariants in `AGENTS.md`, with no duplicate copy elsewhere, and no reference to Copilot-specific instruction files.
- WHEN a plan is finished, THE SYSTEM SHALL (per `AGENTS.md`) delete it in the feature's final commit, moving decisions to `docs/decisions.md` and open items to `docs/backlog.md`.
- THE SYSTEM SHALL contain no `docs/plans/done/`, `docs/archived/`, `docs/audit/` or docs index file.
- THE SYSTEM SHALL record all open work in `docs/backlog.md`, all non-obvious decisions (including declined ones) in `docs/decisions.md`, and the games ladder in `docs/roadmap.md` listing only games not yet built.
- WHEN `npm test` runs, THE SYSTEM SHALL check every relative `.md` link in every live doc, with no exempt folder, and the status-doc checks SHALL target the new files.
- IF a live doc or source comment links to a deleted file, THEN `npm test` (links) or the review pass SHALL catch it before completion.
- THE SYSTEM SHALL keep lint, typecheck and tests at the baseline (no new failures), and the published site SHALL build (`npm run docs:site`).

## Design

### Target layout

| File | Reader / purpose | Built from |
|---|---|---|
| `AGENTS.md` | Agents: what this is, pre-1.0 status, shape-over-stability, commands, layout, git hooks, invariants, consumer-vs-governance docs rule, plan lifecycle, docs map | current `AGENTS.md` + `docs/agent/README.md` (Scripts, Hooks, Key paths, Invariants, doc-sample gates) |
| `docs/website.md` | Topic doc: how the Starlight site is generated (sidebars, header, generators, gotchas) | the "Published site" section of `docs/agent/README.md` — too long and specialized for `AGENTS.md` |
| `docs/backlog.md` | Everything not done, one line each, grouped: Core, Modules (Ready / Deferred / Speculative), Docs site, Untriaged engine gaps, Doc defects | the four roadmap files + open items from the two audits (see D1, D2) |
| `docs/decisions.md` | Non-obvious decisions with why and rejected alternatives | `non-goals.md` (Declined, Superseded), `docs-site-roadmap.md:12-19` (guide coverage), the hybrid-storage decision behind F12, the hosting/COOP decision |
| `docs/roadmap.md` | 20 Games Challenge: order, rules, and the games not yet built | `twenty-games-challenge.md` minus done rows, plus example candidates from `next-examples-coverage.md` |
| `docs/extending-the-engine.md` | Promotion rule-book (governance) | unchanged except paths |
| `docs/game-ai-landscape.md` | Reference map for picking AI modules | unchanged except paths |
| `docs/agent/engine-api.md`, `engine-usage.*` | Generated catalogs | unchanged |
| `docs/plans/` | In-progress plans only | — |

Deleted: `docs/README.md`, `docs/agent/README.md`, `docs/roadmap/` (5 files),
`docs/twenty-games-challenge.md`, `docs/audit/` (2), `docs/archived/` (11),
`docs/plans/done/` (98). Git keeps them (`git log --all -- <path>`).

### Decisions

- **D1 — Backlog detail and file split: agreed.** One backlog file,
  one line per item (scope, status, the engines that ship it, gate), with an
  optional indented note of at most 3 lines only for an item whose design can't
  be re-derived from other engines (core-internals entries such as 3.5
  archetype tables, split-canon modules such as `ui` or rigid-body physics).
  Repo grep evidence ("ABSENT, grep finds…") is dropped: it goes stale and is
  re-checked when the item is built. Areas are sections, not files: the
  docs-site backlog is 2 items. `docs/roadmap.md` stays the single roadmap:
  only the games ladder has ordered milestones.
- **D2 — Engine gap ledger workflow: kept** (project-specific process). The
  inbox becomes the "Untriaged engine gaps" section of `docs/backlog.md`; the
  role rules move to `docs/extending-the-engine.md`. Its "Verification
  provenance" section is history and goes; each row keeps its consumers and
  `file:line` pointers.
- **D3 — Done plans: delete all**, without mining. Decisions already cited by
  live docs or code (F12, site decisions) get a `docs/decisions.md` entry.
- **D4 — Memory: done.** `peer-review-cheapest-model` (Haiku, one pass)
  contradicted the review rule and is deleted. The other four memories don't
  contradict the instructions.

### Code and test changes

- `scripts/docs.test.ts`: drop `isArchived` and its exemption; point the
  status-doc checks at `docs/backlog.md` (module section) and `docs/decisions.md`;
  keep the "no checkmark records shipped work" rule for `docs/roadmap.md`.
- `scripts/examples.ts:63`: the "Built for rung N of the 20 Games Challenge"
  line links to the external challenge list instead of the repo doc, because done
  games leave `docs/roadmap.md`.
- `src/column-store.ts:58`, `src/modules/worker-pool/worker-pool.ts:45`: point at
  the `docs/decisions.md` entry.
- `docs/agent/engine-api.md` / `engine-usage.*`: regenerate only if a JSDoc
  change alters them (the drift tests say so).

### Edge cases and failure modes

- Links inside the published Manual: `scripts/manual.ts` already drops `docs/**`
  links, so module READMEs linking into `docs/` are unaffected; verified by
  `npm run docs:site`.
- Generated or site files that name `docs/twenty-games-challenge.md`: covered by
  the `examples.ts` change and a repo-wide grep for every deleted path.
- Empty sections (memory `keep-empty-doc-sections`): empty tier/section
  headings in the backlog are kept.
- This plan itself was never committed: on commit, two commits (feature with
  the plan ticked, then the plan's deletion).

## Checklist

- [x] Confirm D2–D4
- [x] Confirm D1
- [x] Rewrite `AGENTS.md`: drop Copilot references, merge `docs/agent/README.md` content, new plan lifecycle (large tasks only, delete when finished), docs map, size-scaled process note
- [x] Create `docs/website.md` from the site section; delete `docs/agent/README.md`
- [x] Create `docs/decisions.md` from `non-goals.md` + site/storage decisions
- [x] Create `docs/backlog.md` from core roadmap, module backlog, docs-site roadmap, gap ledger, audit open items
- [x] Move gap-ledger role rules into `docs/extending-the-engine.md`; update its paths
- [x] Create `docs/roadmap.md` from the challenge doc (open games only) + coverage candidates
- [x] Delete `docs/README.md`, `docs/roadmap/`, `docs/audit/`, `docs/archived/`, `docs/plans/done/`, `docs/twenty-games-challenge.md`
- [x] Update `scripts/docs.test.ts`, `scripts/examples.ts`, the two source comments
- [x] Fix every remaining reference to deleted paths (repo-wide grep, `README.md`, `examples/README.md`, `game-ai-landscape.md`)
- [x] Present-tense sweep of the docs touched
- [x] Update memory per D4
- [x] Verify: lint, typecheck, `npm test`, `npm run docs:site`
- [x] Peer review (fresh context, read-only), fix blocking findings
- [x] Final report
