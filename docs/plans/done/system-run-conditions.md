# System Run Conditions (core 4.7)

Roadmap entry: [core-engine-roadmap.md §4.7](../../roadmap/core-engine-roadmap.md)
(removed on delivery).
Canon: Bevy `run_if` / `in_state` and system-set conditions, Unity DOTS
`SystemBase.Enabled` / system-group `Enabled`, Flecs `ecs_enable`.
Canon settles the shape; River Raid is the first consumer.

## Problem

A registered system runs every tick. "Only while not paused", "only in this
game phase", "only when this feature is on" is re-checked at the top of the
system body (River Raid: `if (ctx.dying || ctx.gameOver) return;` in
`scroll`, `collision`, `fuel`). The scheduler cannot see that gate, so it
cannot report it, and a game cannot flip a system off from outside.

## Decisions

1. **Predicate on the system: `runIf?: (ctx: TCtx) => boolean`.** Evaluated
   by `Scheduler.run` immediately before that system's `run`, so a system
   earlier in the same tick can change the outcome (Bevy evaluates
   conditions at the same point).
2. **Imperative toggle on the scheduler:** `setEnabled(name, enabled)` /
   `isEnabled(name)`. A disabled system is skipped regardless of `runIf`.
   Unknown names throw. The flag survives re-sorts; `remove(name)` clears it.
3. **Phase-level gating:** `setPhaseEnabled(phase, enabled)` /
   `isPhaseEnabled(phase)` in phase mode — the Unity system-group / Bevy
   system-set equivalent ("pause = disable `physics`"). Unknown phase throws.
4. **`init` is not gated.** A skipped system still receives `init(ctx)` on
   its first scheduler pass (Bevy initializes every system; Unity
   `OnCreate` runs whether or not the system is enabled), so subscriptions
   set up in `init` do not depend on the first tick's state.
5. **No combinators.** Predicates are plain functions; `&&` / `||` / `!`
   compose them. Bevy ships `and` / `or` / `not` because Rust closures do
   not compose ergonomically — that reason does not transfer.
6. **Custom run loops** (`for (const sys of scheduler)`) keep iterating every
   system. `scheduler.shouldRun(sys, ctx)` returns the same verdict `run`
   uses, so a custom loop can honour the gates without re-implementing them.
7. **DEV access-ordering check is unchanged.** It is static over the
   declared graph; a gate that skips a writer does not change which
   ordering is declared.

## Checklist

- [x] `src/scheduler.ts`: `runIf` on `SchedulableSystem`; `setEnabled` /
      `isEnabled`; `setPhaseEnabled` / `isPhaseEnabled`; `shouldRun`;
      `run` consults `shouldRun`; `remove` clears the flag.
- [x] `src/scheduler.test.ts`: runIf true/false; evaluated per tick with
      the live ctx; earlier system flips a later one's condition in the same
      tick; `init` runs while gated; disabled overrides `runIf`; unknown
      name/phase throws; phase toggle in phase mode and throws in legacy
      mode; `remove` + re-`add` starts enabled; `shouldRun` parity.
- [x] River Raid: move the `dying || gameOver` gates of `scroll`,
      `collision`, `fuel` into `runIf`.
- [x] `src/scheduler.md`: interface, API table, "Run Conditions" section.
- [x] Remove §4.7 from the roadmap and from the suggested order.
- [x] `npm run docs:api` and `npm run docs:usage`.
- [x] Gate: `npm run lint`, `npm run typecheck`, `npm run typecheck:examples`,
      `npm test`.
- [x] Peer review (haiku, one pass).
