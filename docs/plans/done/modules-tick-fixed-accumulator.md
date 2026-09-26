# modules/tick V2 — fixed-timestep accumulator + interpolation

Close the `modules/tick` V2 backlog entry (ready): a tick source that consumes
real elapsed time, advances the world at a fixed `dt` with catch-up steps, and
exposes an interpolation factor so the renderer can draw between the last two
simulation states. Canon shape: Godot `_physics_process` +
`Engine.physics_ticks_per_second`, Unity `FixedUpdate` +
`Rigidbody.interpolation`, Bevy `FixedUpdate`. Both shipped sources deliberately
sidestep it (`AnimationFrameTickSource` docs and
`src/modules/tick/README.md:72`), so this is a slice-V1 gap, not a new idea.

## Decisions (settled before building)

- **Caller-pumped, not rAF-owning.** `advance(frameDeltaMs)` is called from the
  app's existing render loop. Rationale, in source:
  - every example already owns a render-side rAF — `TickRunner` on a logic
    source plus a separate `AnimationFrameTickSource` for rendering
    (`examples/platformer/src/main.ts:104` and `:123-127`, same shape in ~20
    other examples);
  - a second hidden rAF inside this source would duplicate that loop and make
    render ordering fragile;
  - it is testable with no rAF stub at all (`advance(16.7)`), which matters for
    a tick-boundary source;
  - `ManualTickSource` is the shipped precedent for a caller-driven source
    (`start()`/`stop()` are no-ops for interface parity).
  The rejected alternative — wrapping an injected frame `TickSource` — is
  recorded here so it is not re-litigated.
- **`TickInfo` is left unchanged.** `TickInfo` (`src/tick-source.ts:11`) has no
  `alpha` field, and adding one would be a core change for a module-local need.
  Each emitted tick is `{ kind: 'fixed', deltaMs: fixedDtMs, tickNumber }`;
  `alpha` is a read-only property on the source, read by the consumer at draw
  time.
- **Clamp is the load-bearing detail.** `maxStepsPerFrame` caps catch-up ticks
  per `advance()` call, and the **excess accumulated time is dropped**, not
  carried — that is what stops the spiral of death. Default `8`, matching
  Godot's `max_physics_steps_per_frame`.
- **Lifecycle mirrors the siblings.** `start()`/`stop()` are no-ops (no internal
  timer); `tickNumber` is source-local, starts at 0, and is not reset by
  `stop()`.

## Probable API

```ts
new FixedAccumulatorTickSource({ fixedDtMs: number, maxStepsPerFrame?: number })
source.advance(frameDeltaMs: number): void   // emits 0..maxStepsPerFrame ticks
source.alpha: number                         // leftover / fixedDtMs, in [0, 1)
```

## Checklist

- [x] Add `src/modules/tick/fixed-accumulator-tick-source.ts`.
- [x] Constructor validation — `fixedDtMs` positive finite, `maxStepsPerFrame`
      positive integer; throw with the module's existing message style.
- [x] Export from `src/modules/tick/index.ts`.
- [x] Colocated tests `fixed-accumulator-tick-source.test.ts` — no tick below
      one step; one step + `alpha = 0`; `2.5 × fixedDt` → 2 ticks + `alpha =
      0.5`; the clamp drops excess time (repeated large frames never emit more
      than `maxStepsPerFrame`, and the remainder does not grow); `advance`
      with `0` / negative / non-finite delta emits nothing; `tickNumber`
      monotonic across calls; `start`/`stop` idempotent.
- [x] `src/modules/tick/README.md` — new section, update the "Choosing between
      them" table, and **remove the "## Future" V2 paragraph**.
- [x] `docs/roadmap/ecs-module-backlog.md` — drop the `modules/tick` V2 entry
      and its status-table row.
- [x] `npm run docs:api`.
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Shape notes

- No consumer yet, so no example migration in this change: the entry's
  scheduling gate is "a consumer whose physics needs frame-rate-independent
  determinism at a varying display rate", and adopting it is the consumer's
  own playtest-owned change.
- Core stays untouched: the whole feature lives in the module.
