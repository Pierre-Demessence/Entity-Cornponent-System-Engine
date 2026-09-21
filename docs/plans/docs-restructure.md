# Docs restructure — status docs describe work, not history

## Problem

The status docs describe shipped work, not open work. That makes them a
denormalized cache of `git log` + `src/`, with nothing to invalidate them,
so they drift.

Measured on 2026-09-21:

- `docs/roadmap/ecs-module-backlog.md` — **47 entries: 27 shipped, 2 mixed,
  18 open.** 1431 lines, 1094 of them non-blank, more than half recording
  work that already exists in `src/`. Entry states are interleaved under
  four topical H2 sections, so "shipped" and "open" are not separable by
  section.
- `docs/roadmap/engine-gap-ledger.md` — a permanent
  `Resolved — capability ships and consumers adopted it` section plus
  `Promoted` and `Rejected` sections. It is simultaneously an audit log, an
  open list, and an archive.
- The same fact is booked twice: audit row `B15` (ledger) and the
  `modules/tilemap` entry (backlog) both went stale together and both had to
  be corrected in one pass (`b718bfc`).
- **61 broken relative `.md` links** across 15 docs. `AGENTS.md`,
  `docs/README.md` (x2) and `docs/agent/README.md` all point at
  `docs/roadmap/prototype-games-roadmap.md`, which moved to `archived/` in
  `eff67a2` and was never re-pointed.
- `baa450b docs: consolidate roadmap docs into two living files` already
  attempted this; the tree re-sprawled to 5 roadmaps plus 6 archived docs.

## Invariant

**A status doc never describes shipped work.**

Shipped code is described by `src/`, when it shipped by `git log`, and why
by its `plans/done/` plan or module README. A status doc answers only
"what next?" or "why not?".

## Target shape — split by decision state, not by topic

```
docs/
  README.md                      docs map (updated)
  game-ai-landscape.md           reference (moved out of roadmap/)
  twenty-games-challenge.md      ladder (moved out of roadmap/)
  engine-readiness-assessment.md
  roadmap/
    core-engine-roadmap.md       open core-internals only
    ecs-module-backlog.md        open modules only; zero shipped headings
    non-goals.md                 declined + superseded, one line each
    engine-gap-ledger.md         undecided rows only (a small inbox)
  archived/audits/
    2026-09-21-example-gap-audit.md   drained ledger: promoted/resolved/rejected
```

| Doc | Status vocabulary | Answers |
|---|---|---|
| `ecs-module-backlog.md` | `deferred`, `speculative` | what next? |
| `non-goals.md` | `declined`, `superseded` | why not X? |
| `engine-gap-ledger.md` | `open` (untriaged) | what is waiting on triage? |
| `archived/audits/<date>-*.md` | frozen | what did the last audit find? |

Why `declined` and `superseded` survive: absence is not self-documenting.
A missing `modules/ui` reads as "forgotten", not "refused", so deleting the
declines makes the next session re-propose them. Same for the shape
decisions behind `superseded`.

Filenames `ecs-module-backlog.md` and `engine-gap-ledger.md` are kept so the
~15 inbound links survive; only their contents are drained.

## Non-goals of this plan

- No engine or example code changes. Docs and one test script only.
- No re-litigating the sliding-scale promotion rule or the module decisions
  it produced — this moves records, it does not re-judge them.
- No fix pass inside `docs/archived/**`. Those are frozen records from a
  different repo layout (they reference files such as
  `ecs-engine-public-release-strategy.md` that never existed here), so the
  link test exempts them.
- No rename of the two roadmap filenames (see above).
- Not touching `docs/plans/ecs-parallelism-and-soa-storage.md` — another
  agent's working tree change.

## Subtasks

- [x] 1. Create `docs/roadmap/non-goals.md`: lift the backlog's
      `## Non-goals (declined)` (5 entries) plus the `modules/motion`
      boundary-inset `superseded` entry. One line each + the reason. Drop
      the cross-reference narrative (the entity-hierarchy entry's "narrowed
      2026-07-15, promoted to the deferred `modules/attach` entry above"
      paragraph is exactly the rot this plan removes).
- [x] 2a. Harvest the **open tails buried inside shipped entries** into
      proper `V2` entries *before* deleting the shipped bodies. Found during
      planning: six shipped entries carry a `Still deferred` tail, and
      deleting them wholesale would lose live work — the exact failure this
      plan exists to prevent. The `V1`/`V2` convention already covers this
      (`modules/camera` V2, `modules/pathfinding` V2 set the precedent).

      | Shipped entry | Open tail to harvest into |
      |---|---|
      | `modules/camera` V2 | **V3** — rotation, parallax layers, snake `CameraDef` migration |
      | `modules/steering` | **V2** — obstacle-avoidance, wall-following, path-following, `SteeringAgentDef` |
      | `modules/fsm` | **V2** — HSM / parallel / history, `FsmDef`, doom migration |
      | `modules/behavior-tree` | **V2** — `parallel` / `cooldown` / `repeat` decorators, stateful variant |
      | `modules/goap` | **V2** — heap open-set, plan-runner, typed non-boolean facts |
      | `modules/particles` | **V2** — sub-emitters, trails, particle-collision, sprite particles |
      | `modules/animation` (mixed) | **V2** — clip registry, skeletal / 2D rigs |

      One tail is *not* a build: `modules/attach`'s "carrier /
      `inheritVelocity` path has no confirmed adopter (frogger unverified)"
      is an adoption gap. Its home is a ledger row, not a backlog entry.
- [x] 2b. Diet `docs/roadmap/ecs-module-backlog.md`: delete the 27 shipped
      entries and the shipped halves of the 2 mixed ones. Shipped entries'
      rationale is already in `plans/done/` and the module READMEs; verify
      each deleted entry has one before deleting.
- [x] 2c. Verify the diet by name, not by eye: list the open entries present
      in the old file and assert each appears in the new one, plus assert no
      `✅` heading survives. A byte-diff alone cannot catch a silently
      dropped entry.
- [x] 3. Backlog: strip the `✅ shipped` / `✅ SHIPPED` rows from the Table of
      contents and the `## Promotion triggers — summary` table, leaving only
      live signals. Rename that section to make "unbuilt only" explicit.
- [x] 4. Backlog: rewrite `## Conventions` — vocabulary shrinks to
      `deferred | speculative`, the "Shape" convention goes (it only existed
      for shipped entries), `Version suffixes (V1/V2)` stays.
- [x] 5. Backlog: retitle the H2 sections and the intro so the document
      states its own scope — open module work only.
- [x] 6. Move the drained ledger to
      `docs/archived/audits/2026-09-21-example-gap-audit.md`: the
      `Promoted`, `Resolved` and `Rejected` sections, the status vocabulary,
      and the verification-provenance note.
- [x] 7. Shrink `docs/roadmap/engine-gap-ledger.md` to the writer/triager
      workflow, the `Open` rows, and a pointer to the dated audit.
- [x] 8. `git mv docs/roadmap/game-ai-landscape.md docs/` and
      `git mv docs/roadmap/twenty-games-challenge.md docs/`; fix every
      inbound link, including `docs/plans/done/doom.md` and
      `docs/plans/done/portal.md`.
- [x] 9. Fix the remaining broken links in live docs: `AGENTS.md`,
      `docs/README.md`, `docs/agent/README.md` → `archived/prototype-games-roadmap.md`;
      the 10 `../plans/done/*.md` links in the backlog; the wrong-depth
      `../extending-the-engine.md` links in `docs/plans/done/*.md`.
- [x] 10. Add `scripts/docs.test.ts` (picked up by `vitest.config.ts`'s
      `scripts/**/*.test.ts` glob, beside the existing `engine-api.test.ts`
      drift test):
      - every relative `.md` link in live docs resolves (would have caught
        all 61),
      - `docs/roadmap/ecs-module-backlog.md` contains zero `✅ shipped`
        headings,
      - every entry heading in the backlog and `non-goals.md` carries a
        status from that file's vocabulary.
- [x] 11. Update `docs/README.md`'s Roadmap section and `AGENTS.md`'s "See
      also" for the two moves and the new `non-goals.md`.
- [x] 12. Trim `docs/engine-readiness-assessment.md`'s "Documentation drift
      found during this pass" section — after the diet the drift narrative
      is stale; keep only the live fact (the batched tilemap renderable is
      open as `modules/tilemap` V2).
- [x] 13. Validate: `npm test` (the new test plus the engine-api drift
      test), `npx tsc --noEmit`, `npm run lint`.
- [ ] 16. **Not yet done — `docs/roadmap/core-engine-roadmap.md`.** Found
      after implementation (and after the first peer review passed it): the
      core roadmap has **10 `✅ DONE` headings** out of 16 entries (1.1,
      1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.3, 4.1, 4.3), so it violates the same
      invariant. Tiers 1 and 2 are *entirely* shipped and would disappear;
      the `Dependency Graph` and `Suggested Implementation Order` sections
      reference the removed items and need reworking. It has no per-entry
      status suffix, so enforcing it in `scripts/docs.test.ts` needs either
      status suffixes on its headings or a file-specific rule ("no `✅` in a
      roadmap heading"). Deliberately left as a separate pass so this one
      stays reviewable — which means **success criterion 1 is not yet met
      repo-wide, and this plan must not move to `done/` until it is.**
- [ ] 17. Peer review loop with a small model until no actionable items;
      then fix and re-run.
- [ ] 15. Move this plan to `docs/plans/done/docs-restructure.md` in the
      same commit as the implementation.

## Success criteria

- No live status doc contains a `✅ shipped` heading. **(Not yet met — see
  subtask 16: `docs/roadmap/core-engine-roadmap.md` still carries 10
  `✅ DONE` headings.)**
- The backlog is open-only and roughly a third of its current length.
- `npm test` fails if a status doc re-admits shipped work, if an entry
  loses its status, or if a live doc link breaks.
- Zero broken links in live docs.
- `docs/roadmap/` goes from 5 files to 4, with the two non-status docs
  relocated; the ledger drops from 185 lines to an inbox.
