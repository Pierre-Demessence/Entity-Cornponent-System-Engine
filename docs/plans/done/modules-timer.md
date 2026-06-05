# Migration #6 — unified `modules/timer` (+ lifetime refactor + new cooldown)

**Status:** implementation complete — peer review pending
**Supersedes:** the backlog's per-entity `CooldownDef { remainingMs, durationMs }` proposal.

## Why

`#6` started as `modules/cooldown`. Dual-sided verification showed the
backlog's per-entity component shape fit **0** consumers — all 4 cooldown
consumers use a **scalar on GameState**, not a component. Rather than copy
that (same-author) bias, the decision (Pierre, option C) is to extract the
shared timing primitive both `lifetime` and `cooldown` are special cases of:
a Bevy-style **`Timer` value** (`once`/`repeating`, `tick`, `finished`,
`justFinished`, `fraction`, `restart`). `lifetime`, `cooldown`, and the
future `spawner` (#7) are all thin policy layers on top of it:

- `lifetime` = once-Timer + **destroy** on finish
- `cooldown` = once-Timer + **poll/restart** gate
- `spawner` (#7) = repeating-Timer + **ramp** + **emit-callback**

`Timer` is a **value**, not a component, so an entity can hold a lifetime
*and* a cooldown (separate flat components that share the timer field-set) —
the "one timer per entity" trap a single `TimerDef` component would create is
avoided.

## Constraints

- `simpleComponent` is **flat-only** (number/boolean/string). So lifetime /
  cooldown components hold the timer fields **flat**
  (`remainingMs, durationMs, mode, justFinished`) — `Lifetime`/`Cooldown`
  *are* `Timer` structurally. No nesting.
- `mode` is stored as a `string` field (no enum narrowing via
  `simpleComponent`); for the entity components it is always `'once'`.
- Cross-module dependency allowed when documented: `lifetime`/`cooldown`
  import `../timer` and note it in their README (precedent:
  `render-canvas2d` → `../transform`).

## Design

### `modules/timer` (pure value primitive, zero-ECS)
- `type TimerMode = 'once' | 'repeating'`
- `interface Timer { remainingMs; durationMs; mode; justFinished }`
- `timerSchema` — reusable `SimpleSchema<Timer>` for the component modules
- `makeTimer(durationMs, mode='once'): Timer`
- `tickTimer(t, dtMs): void` — decrement; once→clamp@0+latch, repeating→wrap; sets `justFinished`
- `finished(t)` — once: `remainingMs<=0` (latched); repeating: `justFinished`
- `justFinished(t)` — the per-tick edge
- `fraction(t)` — **elapsed** fraction `[0,1]` (Bevy-consistent; remaining = `1 - fraction`)
- `restart(t, durationMs?)` — reset to full

### `modules/lifetime` (refactor onto timer — BREAKING shape)
- `Lifetime = Timer`; `LifetimeDef = simpleComponent('lifetime', timerSchema)`
- `makeLifetime(durationMs) = makeTimer(durationMs, 'once')`
- system: `tickTimer` then `finished()` → expire (preserves re-fire-if-not-destroyed contract)
- gains `fraction()` (fade-out particles)

### `modules/cooldown` (new)
- `Cooldown = Timer`; `CooldownDef = simpleComponent('cooldown', timerSchema)`
- `makeCooldown(durationMs)` — starts **ready** (`remainingMs = 0`)
- `ready(c) = finished(c)`; `trigger(c, durationMs?) = restart(c, durationMs?)`
- `makeCooldownSystem({name, runAfter})` — ticks all `CooldownDef`

## Checklist

- [x] `src/modules/timer/{timer.ts,index.ts,timer.test.ts,README.md}`
- [x] Refactor `src/modules/lifetime/lifetime.ts` onto timer; export `makeLifetime`; update index + README (note timer dep) + tests
- [x] Migrate lifetime set-sites → `makeLifetime(...)`:
      asteroids `game.ts:162`, jetpack `game.ts:155,171`, space-invaders `game.ts:270`, frogger `game.ts:245`, top-down-shooter `game.ts:153`
- [x] `src/modules/cooldown/{cooldown.ts,index.ts,cooldown.test.ts,README.md}`
- [x] Migrate cooldown scalar→component:
      - asteroids `ctx.fireCooldownMs` → `CooldownDef` on ship (input.ts, game.ts, main.ts)
      - top-down-shooter `ctx.fireCooldownMs` → `CooldownDef` on player (input.ts, game.ts, main.ts)
      - space-invaders `ctx.invulnMs` → `CooldownDef` on player (systems.ts, game.ts, main.ts)
        (jetpack `bulletTimerMs`/`spawnTimerMs` are repeating auto-emitters → deferred to #7 spawner, not cooldown)
- [x] Docs: migration #6 → shipped; ledger B3 → Resolved (+shape-correction note: per-entity component, lifetime precedent, same-author bias); backlog cooldown → shipped + new `modules/timer` entry; note lifetime now builds on timer
- [x] Full test + lint green
- [x] Peer review (subagent, no-edit/no-askQuestions) → LGTM (2 non-blocking items fixed: O(1) repeating-wrap, cooldown README ordering)
- [ ] Move plan to `docs/plans/done/` in same commit
