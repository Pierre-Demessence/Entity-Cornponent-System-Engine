# Plan — `modules/noise`

Ship coherent noise as a pure, domain-neutral value primitive alongside
`modules/math` and `modules/rng`. Backlog entry: `modules/noise` (deferred,
trigger MET on both axes — unanimous canon **and** a consumer).

## Dual-sided verification (2026-09-22)

**Engine — ABSENT.** A grep of `src/` for `noise` / `perlin` / `simplex` /
`fbm` finds no implementation (matches exist only in `docs/` and
`package-lock.json` integrity hashes). `modules/rng` ships seeded uniform
streams, which is a *different* primitive — white noise, not coherent noise.

**Consumer — one hand-roll.** `examples/river-raid/src/game.ts:137`
`riverWidth(t)` — the doc comment says "Smooth noise for river width
variation", but the body is a hand-summed 3-sine stack (`.003` / `.007` /
`.013` with weights `.6` / `.25` / `.15`), plus a sibling
`riverCentreX(t)`@`game.ts:148` doing the same with 2 sines. The backlog
recorded this as consumer evidence; the verification above is more precise —
it is a *weak* consumer (sines are not coherent noise, and swapping them
would change the river's shape), so the module's justification rests on
**canon**, with river-raid as a corroborating hand-roll.

**Canon — unanimous.** Godot `FastNoiseLite` (value / Perlin / simplex +
fBm fractal summation), Unity `Mathf.PerlinNoise`, `noise-rs` /
OpenSimplex. Value, Perlin and simplex are the three classical algorithm
families; octave-summed fBm is the universal consumer of them. Unanimous
canon clears the rule-book at **0 consumers**.

## Scope boundary (and what is deliberately *not* here)

Shipped: the three algorithm families in 1D/2D, plus the standard fractal
combiner (`fBm`) that every engine's noise ships.

Deliberately excluded, each for a stated reason:

- **3D noise** — the 2D stack is the only stack; dimension-sensitive work
  ships as parallel siblings when a 3D prototype is scoped (see the backlog's
  3D group). Lands with `modules/math-3d`.
- **Ridged / ping-pong fractal types** — two of the three canon sources expose
  these first-class (Godot `FRACTAL_RIDGED` / `FRACTAL_PING_PONG`, `noise-rs`
  `RidgedMulti` / `Billow`), which is solid canon at the 1-consumer tier rather
  than unanimous. Captured as a `modules/noise` V2 backlog entry.
- **1D simplex** — Perlin's simplex construction degenerates in 1D to a
  gradient noise indistinguishable in shape from `perlin1D`; shipping both
  would be two names for one behaviour.

No ECS component, no system, no world coupling — matching `modules/math` and
`modules/rng`, the module is pure functions over numbers.

## API

```ts
type Noise1D = (x: number, seed: number) => number;            // [-1, 1]
type Noise2D = (x: number, y: number, seed: number) => number;  // [-1, 1]

valueNoise1D(x, seed?)          valueNoise2D(x, y, seed?)        // lattice-interpolated
perlin1D(x, seed?)              perlin2D(x, y, seed?)            // gradient
simplex2D(x, y, seed?)                                           // gradient, better isotropy

interface Fbm1DOptions { seed?, octaves?, frequency?, lacunarity?, gain?, source? }
interface Fbm2DOptions { seed?, octaves?, frequency?, lacunarity?, gain?, source? }

fbm1D(x, options?)              fbm2D(x, y, options?)            // [-1, 1], source defaults to perlin
```

Defaults: `seed 0`, `octaves 4` (floored, capped at 32), `frequency 1`,
`lacunarity 2`, `gain 0.5`, `source` = the matching Perlin sampler. `fbm`
normalizes by the summed **absolute** amplitude, so the result stays in
`[-1, 1]` for any finite `octaves` / `gain` / `lacunarity` — including a
negative `gain`, and falling back to `0` if the amplitude series overflows.

## Tasks

- [x] `src/modules/noise/noise.ts` — the 7 samplers + 2 option types + 2
      sampler types; private hash / fade / mix / signed-zero / octave-loop
      internals.
- [x] `src/modules/noise/index.ts` — barrel (alphabetical, auto-exported by
      the `"./modules/*"` wildcard — no `package.json` edit).
- [x] `src/modules/noise/noise.test.ts` — determinism per seed, range bounds
      over a sweep, seed sensitivity, lattice-point behaviour, continuity,
      fbm normalization + octave/source overrides, plus the edge-case battery
      below.
- [x] `src/modules/noise/README.md` — API, canon, "not included (by design)".
- [x] `npm run docs:api` — regenerate `docs/agent/engine-api.md` (the drift
      test in `scripts/engine-api.test.ts` fails `npm test` if stale).
- [x] Backlog: drop the `modules/noise` entry + retarget its promotion-trigger
      row; add the `modules/noise` V2 entry (3D + extra families).
- [x] `docs/game-ai-landscape.md:99` — mark Noise ✅ shipped + link module.
- [x] `npm test` + `npm run lint` clean.
- [x] Peer review (subagent), fix findings, re-run to LGTM.
- [x] Move this plan to `docs/plans/done/noise.md` (this commit).

## Invariants

- Module depends on **nothing** — zero imports, not even `#index`. Pure
  number math only.
- Every sampler is total (no throw): for finite inputs and a `source` that
  honours the `Noise1D` / `Noise2D` contract, every return is inside
  `[-1, 1]`. `octaves` is floored and capped at 32 (non-finite or `<= 0`
  returns `0`), and `fbm` returns `0` rather than `NaN` whenever any
  intermediate goes non-finite — so no option combination can produce a
  non-finite result.
- Tests colocated (`noise.test.ts` next to `noise.ts`).
- No `enum` / `namespace` (`erasableSyntaxOnly`); string-literal unions and
  `as const` objects only.

## Review outcome (2026-09-22)

Reviewed by a read-only reviewer subagent over three passes; every finding was
applied before commit.

- **`fbm` could leave `[-1, 1]`** for a negative `gain` (measured up to
  `±15`): the octave sum was normalized by the *signed* amplitude total, so
  cancelling amplitudes shrank the denominator. Now normalized by the summed
  **absolute** amplitude, with range tests for `gain` `-1` / `-0.5` / `2`.
- **`octaves: Infinity` hung the octave loop** (`Math.floor(Infinity)` is
  `Infinity`). Fixed with `clampOctaves` (non-finite -> `0`, capped at 32) and
  tests for `Infinity` / `-Infinity` / `NaN`.
- **A canon claim was false**: "only Godot ships ridged first-class" —
  `noise-rs` ships `RidgedMulti` / `Billow` too. Corrected in the module
  README, the backlog V2 entry, and this plan; the deferral decision is
  unchanged (solid canon, 1-consumer tier).
- **Two range claims were overstated**: `valueNoise` approaches but never
  reaches `±1` (its lattice values come from `h / 2^32`), and `perlin2D`'s
  precise peak is sweep-dependent, so the README now says `roughly ±0.9`
  against a theoretical peak of `1`. `simplex2D`'s `~0.71` is now pinned by a
  test.
- Also from the review: three descoped canon families (cellular / Worley,
  value-cubic, domain warp) were added to the README "not included" list and
  the backlog V2 scope so they have a durable home; the tests now type their
  sampler tables with the module's exported `Noise1D` / `Noise2D`, and cover
  large coordinates (`>= 2^31`), negative / non-integer seeds, `frequency` `0`
  and negative, `gain` `0` / `1`, `lacunarity` below `1`, signed zero via
  `Object.is`, and octave seed-offset decorrelation.

**Third pass — one Blocking issue.** The overflow guard added in pass two
checked only the accumulated amplitude, so it did not cover the *frequency*
axis: `fbm1D(x, { lacunarity: 1e300 })`, `{ frequency: Infinity }`,
`{ frequency: NaN }` and a non-finite or very large coordinate still returned
`NaN`, contradicting the README's range guarantee. The guard now tests the
final result instead, which covers every axis. Also fixed from that pass: the
`gain` JSDoc had the direction backwards (`gain` below `1` damps the
high-frequency octaves, i.e. *smoother* — not rougher), the `0` fallback was
undocumented in the module README, and `perlin2D`'s unbacked "about `0.93`" was
softened to "roughly `0.9`". Tests gained the frequency-axis overflow cases,
a non-finite coordinate case, the `fbm2D` cap lower bound, and a pinned
negative peak for `simplex2D`.

**Fourth pass — LGTM.** Nits applied afterwards: the octave cap's stated
justification was false (with the default `gain` a 33rd octave moves the result
by ~`1e-10`, six orders of magnitude above `eps`, so it is *not* below float
precision) and is now described as a safety bound rather than a precision
floor; `frequency` was added to the overflow example lists; the sampler type
docblocks gained the finite-input caveat; and the overflow tests now assert the
documented fallback value `0` rather than merely finiteness.

## Deferred (written to a durable home at deferral time)

- river-raid adopting `fbm1D` for `riverWidth` / `riverCentreX` — the
  migration changes the river's visual profile, so it is a playtest-owned
  change offered to Pierre rather than applied silently.
