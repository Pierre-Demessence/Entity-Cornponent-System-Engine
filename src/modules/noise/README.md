# `@pierre/ecs/modules/noise`

Pure, domain-neutral coherent noise: the smooth, seed-reproducible field
under terrain, water shaping, texture variation and clouds. Every sampler is
a pure number function returning `[-1, 1]`. **Depends on nothing.**

Coherent noise differs from *white* noise by being spatially correlated:
neighbouring samples are similar, which is what makes it look like
landscape instead of static. For uniform, uncorrelated randomness use
[`modules/rng`](../rng/README.md) — a different primitive.

Canon pattern: Godot `FastNoiseLite` (value / Perlin / simplex + fBm),
Unity `Mathf.PerlinNoise`, `noise-rs` / OpenSimplex.

## API

```ts
type Noise1D = (x: number, seed: number) => number;                       // [-1, 1]
type Noise2D = (x: number, y: number, seed: number) => number;            // [-1, 1]
type Noise3D = (x: number, y: number, z: number, seed: number) => number; // [-1, 1]

valueNoise1D(x, seed = 0)   valueNoise2D(x, y, seed = 0)   valueNoise3D(x, y, z, seed = 0)
perlin1D(x, seed = 0)       perlin2D(x, y, seed = 0)       perlin3D(x, y, z, seed = 0)
                            simplex2D(x, y, seed = 0)      simplex3D(x, y, z, seed = 0)

fbm1D(x, options?)          fbm2D(x, y, options?)          fbm3D(x, y, z, options?)

interface Fbm1DOptions {   // Fbm2DOptions / Fbm3DOptions are the same shape
  frequency?: number;      // input multiplier                     default 1
  gain?: number;           // amplitude per octave; higher=rougher  default 0.5
  lacunarity?: number;     // frequency growth per octave         default 2
  octaves?: number;        // summed octaves, floored, max 32      default 4
  seed?: number;           // offset per octave                   default 0
  source?: Noise1D;        // base sampler                        default perlin1D
}
```

Each dimension ships as a parallel sibling: the 3D samplers are the same
algorithms with a `z` axis (`source?: Noise3D` for `fbm3D`), not a different
family.

### Which sampler?

- **`valueNoise`** — cheapest, hashed lattice values interpolated. The most
  "blocky"; fine for cheap variation, weak for terrain silhouettes.
- **`perlin`** — gradient noise on a square lattice, so unlike value noise it
  has no blocky lattice values. The classic, and exactly `0` at every integer
  coordinate.
- **`simplex`** — gradient noise on a triangular (2D) / tetrahedral (3D)
  lattice: less directional bias than Perlin and no axis-aligned artifacts.
  The usual pick for organic terrain.
- **`fbm`** — octave-summed `source`; the shape terrain, water and clouds
  actually sample.

## Notes

- **Ranges are `[-1, 1]` for finite inputs** — no sampler meaningfully leaves
  the range. How much of it each one *uses* differs: `valueNoise` approaches
  `±1` and `perlin1D` reaches it, while `perlin2D` / `perlin3D` reach roughly
  `±0.9` over a lattice sweep and within a hair of `±1` under dense sampling.
  `simplex2D` / `simplex3D` are the low pair, plateauing at about `±0.71` /
  `±0.69`. The Perlin pair inherits the reference implementation's rounding
  caveats, and `perlin3D` carries the widest of them: a cell centre whose
  gradients all align lands one ulp outside, and a rare gradient configuration
  reaches `1.0364`. Scale by amplitude when you need the full swing.
- **Non-finite coordinates propagate as `NaN`** from `valueNoise*`, `perlin*`
  and `simplex*`, as with any JS math function. `fbm` is the exception — see
  its bullet below.
- **`perlin1D` / `perlin2D` / `perlin3D` are exactly `0` at integer
  coordinates** — a byproduct of gradient noise, and the property that makes
  scrolling worlds behave at cell seams. `valueNoise` and `simplex` do not have
  it.
- **`valueNoise2D` is the `y = 0` slice of `valueNoise1D`**, and
  `valueNoise3D`'s `z = 0` plane is `valueNoise2D`, both bit for bit. The Perlin
  family shares only a lattice *plane* — `perlin1D` uses ±1 scalar gradients
  while `perlin2D` / `perlin3D` use hashed angles / edge vectors — so fields of
  different dimensions from one seed are related, not independent sources.
- **`fbm` normalizes by the summed *absolute* amplitude**, so its result stays
  in `[-1, 1]` (up to its `source`'s own rounding) for any finite `octaves` /
  `gain` / `lacunarity` combination — you cannot overflow the range by asking
  for more detail, and a negative `gain` (a difference-of-octaves texture) is
  bounded too. If the octave series *does*
  overflow (an amplifying `gain`, a runaway `lacunarity` or `frequency`, a
  non-finite coordinate), it returns `0` rather than `NaN`: finite and in range,
  but a flat field — so keep `gain` and `lacunarity` in normal ranges.
- **`octaves` is floored and capped at 32**, and a non-finite or non-positive
  `octaves` returns `0` rather than throwing or spinning the octave loop. The
  cap is a safety bound, not a precision floor: with the default `gain` a 33rd
  octave would still change the result, but 32 is far past anything a game
  needs.
- **Never returns `-0`.** Signed zero is a legal float but leaks into
  `Object.is`, `Math.sign` and `1 / v`, so the samplers normalise it away.
- **`frequency` is a plain input multiplier**, not a Godot-style absolute
  frequency. `fbm2D(x, y, { frequency: 0.01, octaves: 1 })` is the idiomatic
  way to get one very wide continental octave.

## Not included (by design)

- **Other algorithm families** that Godot's `FastNoiseLite` and `noise-rs`
  ship: **cellular / Worley** (Voronoi), **value-cubic**, and **domain warp**
  (turbulence). Real canon, but not *unanimous* across engines and with no
  consumer, so each waits for one.
- **Ridged / ping-pong fractal types.** Two of the three canon sources expose
  these first-class (Godot `FRACTAL_RIDGED` / `FRACTAL_PING_PONG`, `noise-rs`
  `RidgedMulti` / `Billow`) — solid but not unanimous canon, so they wait for a
  consumer that needs them.
- **1D simplex.** The simplex construction degenerates in 1D to a gradient
  noise indistinguishable in shape from `perlin1D`.

The first two are tracked in the
[module backlog](../../../docs/roadmap/ecs-module-backlog.md); 1D simplex is
excluded permanently rather than deferred.

## Usage

```ts
import { fbm2D, fbm3D, perlin1D, simplex2D } from '@pierre/ecs/modules/noise';

// Scrolling water: a wide, gentle band that varies along the track.
const width = 90 + perlin1D(travel * 0.002, seed) * 30;

// Terrain: the same seed always builds the same world.
const height = fbm2D(col * 0.05, 0, { seed: 1337, octaves: 5 });

// Organic 2D detail with no axis-aligned bias.
const moisture = simplex2D(x * 0.1, y * 0.1, 7);

// Volumetric density for a cave system: the 3D sibling of the height field.
const density = fbm3D(x * 0.04, y * 0.04, z * 0.04, { seed: 1337, octaves: 5 });
```
