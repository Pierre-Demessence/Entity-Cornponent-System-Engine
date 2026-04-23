# Rhythm Postmortem — Rung 6

**Prototype:** Rhythm (4-lane, 120 BPM, D/F/J/K hits, judgement windows
Perfect/Good/OK/Miss, synthesized metronome click).
**Engine version:** `@pierre/ecs` byte-identical with the card-battler
baseline — zero engine edits.
**LOC:** 580 (src total: audio 135, game 137, systems 135, render 141,
main 127 — sans comments they're ~100 each). Budget: 500, slack 100.
**Engine edits required:** **zero**. Rule R1 held.

## What worked

- **`TickSource` as an interface, not a class.** Writing a custom
  `AudioClockTickSource` that implements the interface and feeds
  `deltaMs = (audioCtx.currentTime - lastAudioTimeS) * 1000` was a
  five-minute drop-in. The engine (via `TickRunner`) treats it
  identically to `FixedIntervalTickSource` and `AnimationFrameTickSource`.
  This is the whole point of the prototype and the engine passed.

- **`TickRunner.contextFactory(info)` fired on every tick.** Using it
  to stamp `state.audioTimeS = audioCtx.currentTime` once per tick
  means systems read a coherent snapshot without each calling
  `audioCtx.currentTime` independently. This turns out to be the
  clean answer to the roadmap's predicted gap "`TickSource` has no
  slot for current time as a function" — the consumer fills that
  slot themselves in one place, and the engine doesn't have to know
  about clocks at all.

- **Input-as-timestamped-events via raw `KeyboardProvider.subscribe`**
  was the correct escape hatch. `createInput` is built around
  per-*tick* edge detection (`justPressed`, cleared via
  `clearEdges()`), which is fine for most games but discards the
  *instant* a key was pressed — rhythm requires that instant. Dropping
  back to the raw provider and pushing `{lane, timeS}` onto a FIFO
  drained by `inputSystem` was ~15 lines and felt right. Not an
  engine gap: rhythm is simply a different input model than the other
  examples.

- **`simpleComponent<Note>({hit, lane, targetTimeS})`** worked with
  zero save/load ceremony. The `hit` "0 | 1 | 2" enum-as-number is a
  minor code smell in the component but the primitive schema honestly
  reflects what's on disk. Zero boilerplate, exactly what the snake
  postmortem predicted would pay off.

- **`world.clearAll()` in `resetGame()`** was a one-liner. This was
  promoted from the snake postmortem, and rhythm is its third consumer
  (after asteroids and platformer respawn). Rule of Three well earned.

- **`Scheduler<GameState>` with three systems** (`spawn` → `input` →
  `cull`, via `runAfter`) ordered correctly on the first try. The
  cull pass marking hits and queuing destroys in the same iteration
  works because `queueDestroy` defers to end-of-tick — documented
  reality I didn't have to re-learn.

- **`EventBus<RhythmEvent>` for `NoteJudged`** let `main.ts` subscribe
  for the popup display without any system knowing about UI. Clean
  separation. The `type:` discriminant is an engine constraint — once
  I renamed from `kind:` to `type:` (below) everything type-checked.

- **Zero audio crackle.** Web Audio's `scheduleClick(targetTime)`
  pre-queues clicks up to 0.5 s ahead of the current clock, so even
  when the main thread stutters, the click track stays glued to audio
  time. No jitter buffering needed inside the engine.

## What was awkward / small friction

- **`EventBus` requires events with a `type` field, not `kind`.** I
  intuitively reached for `kind` since that's the TS discriminant
  convention for runtime-checked unions in most of this repo's own
  source code. Cost me one tsc round-trip. Not worth changing — the
  engine made a call and it's internally consistent. Worth calling
  out in `extending-the-engine.md` as "use `type: '...'` not `kind`".

- **`erasableSyntaxOnly: true` banned parameter properties** in the
  tick-source constructor. `constructor(private audioCtx)` →
  explicit field + assign is three extra lines. Known tradeoff for
  the tsconfig strict setting; not an engine gap.

- **Renderer-is-not-a-system pattern held up.** Rendering is a
  `tickSource.subscribe(() => render(...))` in `main.ts`, not a
  scheduled system. This matches the pattern from snake/asteroids
  and avoids the "system that reads everything" anti-pattern. No
  action needed.

- **`store.entries()` iteration for both input judgement and render.**
  The note count stays < 20 in flight so O(N) sweeps are fine. A
  lane-indexed query would be faster but isn't justified — one
  consumer, ~20 entities, 60 Hz. Defer.

- **Hit-state encoded as `0 | 1 | 2`** in the `Note` component because
  `simpleComponent`'s primitive schema doesn't model string unions
  cheaply. This is the same "enum as number" smell the snake and
  asteroids postmortems flagged but neither formally recorded. If a
  fourth consumer wants string-typed enums in a simple component,
  that's a Rule-of-Three trigger for `SimpleFieldKind` extending to
  `'enum:a|b|c'` or similar. Not yet.

## What was surprising

- **How cheaply the "external clock" test came out.** I expected at
  least one `TickInfo` extension — something like an optional `nowS`
  field. Didn't need it. The engine's deliberate minimalism
  (`TickInfo` carrying only `kind`, `deltaMs`, `tickNumber`) meant
  the prototype owns the clock-reading side and the engine doesn't
  have to know anything about Web Audio. This is the cleanest line
  the engine could have drawn.

- **`TickRunner.onTickComplete` is optional.** Rhythm doesn't need
  per-tick cleanup (input isn't edge-based inside the runner), and
  leaving the option undefined is fine. Small detail, but it meant
  the example couldn't "forget" to call `input.clearEdges()` because
  it doesn't use the edge API at all.

- **Bundle size: 25.88 kB (8.84 kB gz)** for the full rhythm game
  including engine, Web Audio plumbing, and renderer. The engine's
  tree-shakability is still earning its keep across a fifth prototype.

## Engine gaps identified

| # | Gap | Promotion bar | Status |
|---|---|---|---|
| 1 | `TickInfo.nowS?` — unified "current time" across all tick sources | 3 consumers asking for it. Currently: zero. Rhythm reads `audioCtx.currentTime` in `contextFactory` and doesn't need it on `info`. | Deferred. May become relevant for networked pong (Rung 9). |
| 2 | Timestamped input events on `InputRawEvent` (capture `event.timeStamp` or audio-clock time) | 2 consumers. Rhythm hand-rolls it. | Deferred. If networked pong wants the same pattern, promote. |
| 3 | `SimpleFieldKind` extending to typed enums (`'hit: 0\|1\|2'`) | 3+ consumers hitting enum-as-number smell | Deferred. Cosmetic. |
| 4 | Short-form DSL note in `extending-the-engine.md` that events use `type:` not `kind:` | Docs-only; not a code promotion | Nice-to-have. |

None rose to "promote now" per the Rule-of-Three.

## Verdict

**Rule R1 held; engine byte-identical across six prototypes now.**
The rhythm game shipped without a single `#tick-source` extension and
without a single input-layer bend. That's the strongest evidence yet
that `TickSource` + `TickRunner` hit the right abstraction line — the
engine doesn't own clocks, it subscribes to them.

Next worthwhile rung is probably **Rung 7 (three-D platformer)**: the
remaining 2D rungs (local pong, networked pong) exercise input-scoping
and determinism, neither of which will change the engine's spatial
interface. Rung 7 will.
