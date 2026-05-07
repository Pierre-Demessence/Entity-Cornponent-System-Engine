# Roadmap Consolidation

Consolidate the four overlapping roadmap documents into two: one for **core
engine internals**, one for **module backlog**. The other two are largely
historical or duplicative and become archive material.

## Motivation

Audit of `docs/roadmap/`:

| File | Real role | Issue |
|---|---|---|
| `architecture-roadmap.md` | Core engine internals (Tier 1–4) | Stale "Current State"; mixes shipped + open items; misnamed (covers core internals, not "architecture" broadly) |
| `general-purpose-ecs-roadmap.md` | Layering manifesto + step 1–7 migration history + module catalog M1–M10 | ~80% historical / duplicative of `ecs-module-backlog.md` |
| `ecs-module-backlog.md` | Live deferred / speculative / declined modules | Healthy; the real backlog |
| `ecs-postmortem-additions-audit.md` | Reconciliation of postmortem suggestions vs `src/` | One-shot exercise; 2 of 3 net items already in backlog |

End state: `core-engine-roadmap.md` (renamed + slimmed) +
`ecs-module-backlog.md` remain as the two living roadmaps. The other
two move to `docs/archived/`. Layering principles + tradeoffs + prior
art lift into `extending-the-engine.md`.

## Subtasks

- [x] Port net-new items into `ecs-module-backlog.md`:
  - [x] M9 AI framework (speculative) — from `general-purpose-ecs-roadmap.md`
  - [x] M10 Networking (speculative) — from `general-purpose-ecs-roadmap.md`
  - [x] Local-multiplayer player-slot / input-owner helper — from `ecs-postmortem-additions-audit.md`
- [x] Lift principles + supporting sections from `general-purpose-ecs-roadmap.md` into `extending-the-engine.md`:
  - [x] Layering Principles section (good defaults / pay-for-what-you-use / composition / preset bundles)
  - [x] Tradeoffs section (costs vs savings)
  - [x] Prior Art section (Bevy / flecs / EnTT / BitECS / Unity DOTS)
- [x] Refresh + rename `architecture-roadmap.md` → `core-engine-roadmap.md`:
  - [x] Rename via `git mv`
  - [x] Drop "Current State" section (rolling docs shouldn't carry status snapshots)
  - [x] Verify shipped vs open items still accurate
  - [x] Drop stale path references (`src/ecs/spatial.ts`, `src/ecs/query.ts`, `src/ecs/scheduler.ts`, `src/game/entity.ts`)
  - [x] Add cross-link to `extending-the-engine.md` for the rule-book
- [x] Archive `general-purpose-ecs-roadmap.md`:
  - [x] Move to `docs/archived/general-purpose-ecs-roadmap.md`
  - [x] Prepend "archived because" note + date
- [x] Archive `ecs-postmortem-additions-audit.md`:
  - [x] Move to `docs/archived/ecs-postmortem-additions-audit.md`
  - [x] Prepend "archived because" note + date
- [x] Fix back-references:
  - [x] `docs/README.md` — drop archived entries from roadmap list, update rename link
  - [x] `docs/roadmap/prototype-games-roadmap.md` — update general-purpose + rename links
  - [x] `docs/roadmap/ecs-module-backlog.md` — update general-purpose + rename links
  - [x] `docs/extending-the-engine.md` — update mention of "architecture roadmap"
- [x] Move plan to `docs/plans/done/` in the same commit as the changes

## Out of scope

- The historical references inside `docs/archived/*` are intentionally
  left frozen — they reference files by the names they had at the time
  the document was alive. Updating them would defeat the purpose of an
  archive.

