# modules/motion — vector util (normalize / set-speed)

Local→Engine migration #5. Pull the hand-rolled "normalize a direction
then scale to a target speed" math out of breakout and top-down-shooter
into the shipped `modules/motion`.

## Checklist

- [x] Add `src/modules/motion/vec.ts` — `normalize`, `scaleToSpeed`, `Vec2`.
- [x] Export the helpers from `src/modules/motion/index.ts`.
- [x] Colocated tests `vec.test.ts` (normalize, scaleToSpeed, zero-length, diagonal-not-faster).
- [x] README "Vector helpers" section.
- [x] Migrate breakout `setBallSpeed` → `scaleToSpeed`.
- [x] Migrate top-down-shooter player-move (`input.ts`) → `scaleToSpeed`.
- [x] Migrate top-down-shooter `enemy-steer.ts` → `scaleToSpeed` (keep `<1e-3` close-guard).
- [x] Full test + lint pass.
- [x] Docs: migration #5 → shipped, ledger B13 → Resolved, backlog → shipped.
- [x] Peer review (subagent), fix findings.

## Shape notes

- Pure, allocation-returning `(x, y) → Vec2`. No ECS coupling — operates
  on bare number pairs (velocities, steering deltas, input axes).
- Zero-length input → `{ x: 0, y: 0 }` (no `NaN`); caller supplies a
  fallback direction if needed.
- Canon: Unity `Vector2.normalized`, Godot `Vector2.normalized()` /
  `limit_length()`, Bevy `Vec2::normalize_or_zero`.
