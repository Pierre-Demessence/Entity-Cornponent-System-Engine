# Document the undocumented public functions & classes + ratchet

## Problem

`scripts/engine-api.ts` renders `— —` for every public export whose JSDoc
summary is empty. Right now **160 of 494 exports (~32%)** carry that marker.
Because the site's TypeDoc config does not set `excludeNotDocumented`, those
symbols already appear on `/api/` — but with a blank description, and with no
IDE-hover text.

The gap is not uniform. Behavioural API — **~20 functions and classes** — is
where a missing description costs the most (you hover a call to learn what it
does). Options / shape interfaces and component-def consts are mostly
self-describing from their fields, and the 30 `ease*` consts are a family better
served by one shared note than 30 near-identical lines.

## Goal

- Every public **function and class** carries a JSDoc summary, so its `/api/`
  page and IDE hover are useful.
- A test **ratchets** the undocumented-export count so it can only shrink: a new
  export without JSDoc fails `npm test`.

## Scope

Document these ~20 (the `fn` / `class` exports flagged `— —`):

- **asset-loader**: `createAssetHandle`, `arrayBufferAsset`, `jsonAsset`,
  `textAsset`, `imageAsset`, `audioBufferAsset`, `fontFaceAsset`, `AssetLoader`.
- **audio**: `AudioQueue`, `WebAudioProvider`, `makeAudioSystem`.
- **grid-based**: `bresenhamLine`.
- **lifetime**: `makeLifetimeSystem`.
- **motion**: `makeVelocityIntegrationSystem`.
- **motion-3d**: `makeVelocityIntegration3DSystem`.
- **render-dom**: `DomRenderer`.
- **save**: `computeChecksum`, `createEnvelope`, `verifyEnvelope`.
- **stats**: `FrameStats` (a descriptive comment already sits on
  `FrameStatsOptions`; give the class its own summary).

Interfaces, type aliases and consts (including the easing family) are out of
scope here — they stay in the ratchet's backlog and are paid down later.

## Design

- **JSDoc** written from each symbol's real implementation (read, not guessed),
  in the repo's WHY-first style: what it is and the one non-obvious thing about
  it, not a restatement of the signature.
- **Ratchet** — `scripts/jsdoc-coverage.ts` (pure): build the program, enumerate
  public exports via `engine-surface`, and return those whose
  `getDocumentationComment` is empty. `scripts/jsdoc-coverage.test.ts` asserts
  `undocumented.length <= BASELINE`, where `BASELINE` is the exact count after
  this change. A new undocumented export pushes the count over the ceiling and
  fails; documenting more only creates headroom. The failure message lists the
  offenders so the fix is obvious.
- **Regenerate** `docs/agent/engine-api.md` (`npm run docs:api`) so the catalog
  reflects the new summaries; its drift test then passes.

## Non-goals

- Documenting interfaces / types / consts (tracked by the ratchet backlog).
- A per-symbol allowlist ratchet — a count ceiling is lighter and the catalog
  already names every offender via `— —`.
- Turning `excludeNotDocumented` on — that would *hide* the still-undocumented
  symbols from the site, the opposite of the goal.

## Checklist

- [x] Write JSDoc for the ~20 functions/classes above.
- [x] `scripts/jsdoc-coverage.ts` + `.test.ts` with the count ratchet.
- [x] Regenerate `docs/agent/engine-api.md`; set `BASELINE` to the new count (140).
- [x] Update `docs/agent/README.md` with the coverage ratchet.
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run docs:site`.
