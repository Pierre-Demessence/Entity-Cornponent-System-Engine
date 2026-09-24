# modules/noise V2 — 3D samplers

Close the `modules/noise` V2 backlog entry (ready): the 3D forms of V1's
value / Perlin / simplex samplers plus `fbm3D`. Canon: Godot
(`FastNoiseLite.get_noise_3d`), `noise-rs`, and `simplex-noise` / three.js all
expose 3D samplers of the same shape as the shipped 1D/2D surface, and
dimension-sensitive modules ship as parallel siblings by project rule. **0
consumers** — the module itself still has none — which is the case the
rule-book covers: canon alone authorizes it.

## Decisions (settled before building)

- **Mirror the V1 surface exactly.** `Noise3D = (x, y, z, seed) => number`,
  `valueNoise3D`, `perlin3D`, `simplex3D`, `fbm3D` + `Fbm3DOptions` (same
  option names and defaults as `Fbm1DOptions` / `Fbm2DOptions`, with
  `source?: Noise3D`). Same `[-1, 1]` contract, same zero-safety and
  non-finite → `0` overflow behaviour.
- **The 2D code path must stay byte-identical.** `gradientAngle`
  (`src/modules/noise/noise.ts:81`) returns a *radians angle* and is therefore
  2D-only by construction; 3D needs a unit gradient **vector**. Add a 3D hash
  (`hashLattice3` with a new `HASH_Z` constant) beside the existing
  `hashLattice` (`:73`) rather than generalizing the 2D one — no reason to
  perturb shipped 1D/2D output.
- **No `modules/math` import.** `simplex3D` takes its gradients straight from
  `gradientDot3`'s scalar `switch` (`dx` / `dy` / `dz` components), so no vector
  type is needed. Modules depend on core primitives only (`AGENTS.md`), and
  this module's own contract is "Depends on nothing".
- **`simplex3D` is the real work**, the rest is mechanical: 3D skew/unskew
  constants plus Perlin's 12 edge gradients via a switch on the hashed index —
  not an angle. Document the practical peak the way the 2D doc does.
- **`perlin3D` scales by `sqrt(2)`, the same factor as `perlin2D`.** The 12
  edge gradients, normalized to unit length and scaled by `sqrt(2)`, reproduce
  Perlin's `improved noise` field magnitude exactly, so the sampler keeps the
  canonical range instead of an arbitrary one. That range is *approximately*
  `[-1, 1]`, like the reference's: an edge gradient cannot point along a cell
  diagonal, so the construction's true ceiling is `sqrt(2) * 0.7328 = 1.0364`
  for one rare gradient configuration, and an aligned cell centre lands one ulp
  outside. Both are documented on the sampler and in the README rather than
  papered over. This is also what lets all four 3D samplers keep the shared
  `0.5` band bar: `perlin3D` reaches ~`0.9` on a lattice sweep (~`1` under
  dense sampling) and `fbm3D` ~`0.62`.
- **1D simplex stays permanently excluded** (`README.md` "Not included"), and
  the ridged / ping-pong and cellular families stay in V3 (still deferred).

## Checklist

- [x] Add `Noise3D`, `Fbm3DOptions`, `valueNoise3D`, `perlin3D`, `simplex3D`,
      `fbm3D` to `src/modules/noise/noise.ts`.
- [x] Export all of them from `src/modules/noise/index.ts`.
- [x] Extend `noise.test.ts` with a `SAMPLERS_3D` table + `sweep3D`, mirroring
      the 2D property list (range, determinism per seed, seed sensitivity,
      exact `0` at integer lattice points for `perlin3D`, no `-0`, `fbm3D`
      octave cap / non-finite guard).
- [x] `src/modules/noise/README.md` — API block, a 3D usage example, and
      **remove the "3D noise" bullet from "Not included (by design)"**; keep
      V3's deferred families listed.
- [x] `docs/roadmap/ecs-module-backlog.md` — drop the `modules/noise` V2 entry
      and its status-table row.
- [x] `npm run docs:api`.
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.
- [x] Move this plan to `docs/plans/done/` in the commit that lands the change.

## Related open item (not this plan)

`examples/river-raid` still hand-sums five sines for river shaping
(`src/game.ts:137`, `:148`); swapping them for `fbm1D` changes the river's
visual profile, so it is a playtest-owned change and stays out of this commit.
