# Plan: `modules/input` — pure `projectPointer` export (migration #4)

**Status:** validated; awaiting commit

## Scope

Promote the module-private `defaultProject` (DPI-aware client→canvas
backing-pixel pointer projection) to an exported pure `projectPointer`, so
event-time pointer handlers reuse the exact math instead of re-deriving it.
Smallest of the migration-queue items (#4).

## Dual-side check (verified by grep)

- `defaultProject`@`pointer-provider.ts` = `(clientX/Y − rect) ×
  (canvas.width/rect.width)` when the target has numeric `width`/`height` and a
  non-zero rect, else raw local offset. Already `PointerProjector`-shaped;
  `PointerProvider` uses it as its default.
- breakout (x-only) + solitaire (both axes) replicate it **verbatim** at
  event-time → clean adopters.
- tilemap (custom viewport project) + space-invaders (no-DPI half-screen) don't
  fit — confirmed, left as-is.

## Done

- [x] Promote `defaultProject` → exported `projectPointer` (param widened to the
      structural `{ clientX; clientY }` it reads, so it works in
      pointer/click/dblclick handlers); `PointerProvider` default unchanged.
- [x] Export from the `modules/input` barrel.
- [x] 4 tests (DPI both-axis, identity, non-canvas fallback, zero-rect fallback).
- [x] Migrate breakout (`projectPointer(ev, canvas).x`) + solitaire (both axes,
      cast dropped after the param widening).
- [x] Docs: roadmap row 4 → shipped; ledger B9 → resolved; backlog section + TOC
      → shipped; input README documents the exported fn.
- [x] Catalog + lint + full test green (815).
- [x] Browser-smoke breakout (mouse paddle tracking) + solitaire (deal + tableau
      hit-test), 0 errors.
- [x] Peer review → LGTM (byte-identical promotion confirmed; widened the param
      per the reviewer's nit to drop solitaire's `as PointerEvent` cast).
- [ ] Move plan to `docs/plans/done/` in same commit.
