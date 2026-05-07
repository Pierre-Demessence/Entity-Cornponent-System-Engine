# Extending the Engine

How to decide where new code belongs when you hit an engine gap — whether
from the roguelike, a future prototype, or anywhere else. This is the
rule-book for promoting code into the engine, keeping it out, or demoting
it back.

## The Core Rule

**Don't abstract into the engine from one data point.** The first consumer
always over-fits the shape. The second consumer is what reveals which
parameters are real.

There are **three promotion paths**, and it matters which one you're on:

### Path A — Shape-validated promotion (Rule of Three, Fowler variant)

Use when the abstraction is **opinionated or non-obvious** — where the
*right shape* of the API is what you're trying to discover.

> Implement in the consumer. When duplication appears between two real
> consumers — or a second consumer would genuinely use the identical
> primitive if it existed — *then* lift.

Default for uncertainty: **stays in the consumer**. Most engine
additions land on this path.

### Path B — Canon promotion

Use when the primitive is **well-established in game-engine literature**
with a stable, obvious API: spatial hash, quad-tree / BVH, fixed-step
tick source, AABB sweep, ring buffer, dirty-flag change detection,
event bus, command buffer. These are domain-standard; their shape is
not what you're discovering.

> Ship it when **one** real consumer can exercise it. You still need
> proof the code works, but you do **not** need three internal
> prototypes to justify its existence — the external literature
> already does.

Guardrails for Path B — bias against over-building:

- **Minimal surface.** Start with the 2–3 operations the consumer
  actually calls. Resist optional parameters and configuration knobs
  until a second consumer asks.
- **One real user before you ship.** Canon ≠ theoretical. A primitive
  that has never touched a running game belongs in a spike branch, not
  the engine.
- **Document the canon reference.** Promotion rationale should name the
  literature / engines the shape comes from (Box2D, Rapier, Bevy,
  Flecs, etc.). If you can't, it's actually Path A and you need more
  consumers.
- **Demotable by default.** Write Path-B primitives so they can be
  removed if they turn out to be the wrong fit for downstream consumers.
  No deep coupling to core internals.

### Path C — Universal canon

Use when the primitive is **present in essentially every major engine
with the same shape**: z-order / sort-key, opacity / alpha, scale,
rotation, translation, text primitive, polygon / polyline primitive,
sprite primitive, AABB, viewport. These are so universal across
Pixi, Phaser, Unity, Godot, Bevy, LÖVE, SFML, etc. that the API
shape is not a discovery problem at all — skipping them because
"we don't have two consumers yet" ships a game engine that can't
draw rotated text.

> Ship it with **zero** current consumers if the canon is
> unanimous. The external literature is doing the job the "rule of
> three" normally does for you.

Guardrails for Path C — stricter than Path B, because you have no
consumer sanity-check:

- **Unanimous across ≥3 major production engines with the same
  shape.** "Pixi has something like this" is Path B, not Path C.
  If Bevy, Pixi, and Phaser all expose the concept with
  structurally-identical APIs (name may differ, shape matches),
  that's Path C.
- **Minimal surface, no speculative knobs.** Ship the canonical
  shape only. No optional parameters, no mode flags, no
  configuration that isn't in every reference engine.
- **Demotable by default.** Same as Path B. If the first real
  consumer reveals the shape is subtly wrong, you can pull it.
- **Cite three engines in the rationale.** Paste the equivalent
  API name from each into the plan file.

When to **reach for Path C vs Path B**: Path B is "canon exists,
ship with one consumer to validate". Path C is "canon is so
unanimous that waiting for a consumer is just delaying obvious
infrastructure". Use Path C for small, universal primitives;
Path B for larger or less-unanimous canon.

### Choosing the path

| Situation | Path |
|---|---|
| Two internal consumers independently grew the same helper | A |
| Turn cycler, combat log bridge, class/race registry, save-slot manager | A (opinionated game-shape) |
| Spatial hash, quad-tree, fixed tick source, ring buffer, event bus | B (canon + 1 consumer) |
| Z-order, opacity, scale, rotation, text / polygon / sprite primitive, AABB | C (universal canon) |
| "We might want this someday" — no consumer and no canon pedigree | Neither. Keep it out. |
| One consumer, novel API shape, uncertain design | Neither yet — keep in the consumer. |

When in doubt: **A**. Under-promotion costs a bit of duplication;
over-promotion via mislabeled Path B or C costs an engine surface
you regret.

## Layering Principles

The engine is split into three layers — Core / Modules / App — and four
principles govern how they relate. The triage table below applies these
operationally; this section spells the principles out so future
contributors know *why* the table is shaped that way.

### Good defaults, never mandatory assumptions

Every module exposes an **interface** and a **default implementation**.
Users can swap the implementation without changing the core or other
modules. `EcsWorld.enableSpatial()` accepts any `SpatialStructure`, with
`HashGrid2D` as the convenient default for simple 2D grid games — a
future `QuadTree` or `BVH` drops in with zero core change. Same shape
applies to `TickSource`, `Renderer<TCtx>`, `InputProvider`,
`AudioProvider`, and every other module interface.

### Pay for what you use

A simple game that imports only the core pays zero runtime cost for
unused modules. Modules ship as `@pierre/ecs/modules/<name>` subpath
exports — tree-shakeable, no giant "ECS framework" object. If your
prototype doesn't import `modules/audio`, the audio code is not in your
bundle.

### Composition, not inheritance

Modules don't `extends World` — they receive the world and wire
themselves in via the core's extension points (store hooks, lifecycle
events, scheduler registration). This is what makes them swappable and
what keeps the core small. If a proposed module wants to subclass
`EcsWorld`, that's a design smell — find the missing extension point on
the core instead.

### Preset bundles for common game types

When a genre's module combination repeats (e.g. roguelikes always wire
`HashGrid2D` + `ManualTickSource` + `modules/grid-based` + a save
backend), an opinionated factory function is the right shape — *not* a
new core surface. Currently no presets ship; if a second roguelike-shape
consumer appears and the inline-composition boilerplate hurts, that's
the trigger to introduce e.g. `createRoguelikeWorld()`. Beginners get
turnkey setup; power users still compose their own.

## Three-Layer Triage

Where a piece of code lives depends on who uses it and what it assumes.

| Layer | Path | Criteria |
|---|---|---|
| **Core** | `packages/ecs/src/` | Domain-neutral + ≥2 real consumers + zero game imports. `EventBus`, `Scheduler`, `ComponentStore`, `SpatialStructure` interface. |
| **Modules** | `packages/ecs/src/modules/<domain>/` | Domain-scoped but **genre-reusable** (turn-based, spatial-2D, physics-2D, real-time tick). Opt-in import. `modules/turn-based/turn-cycler`, `modules/spatial/HashGrid2D`, `modules/spatial/projections`, `modules/tick/ManualTickSource`, `modules/tick/FixedIntervalTickSource`. |
| **Consumer** | Game source tree (`src/…`) or prototype | One-consumer-specific, references concrete game components/tags, encodes genre rules, or not-yet-proven. Everything else. |

Core = interfaces + universal machinery. Modules = concrete implementations
of a genre pattern. Consumer = application semantics.

## Asymmetric Movement Cost

Promotion and demotion are not symmetric:

- **Consumer → Engine (promote)** — cheap. `git mv`, rewrite imports, add
  generics where needed. The second consumer tells you exactly which
  parameters to extract.
- **Engine → Consumer (demote)** — expensive. Breaks any consumer that
  depended on the primitive, feels like a regression, politically awkward
  once the engine ships externally.

So: **bias toward leaving things in the consumer until promotion is
forced by real duplication.**

## Two Failure Modes

### Failure mode 1: breaking the engine/game separation

Consumer code reaches into engine internals because the engine is missing
a primitive. Red flags:

- Consumer mutating engine private state (`world.events = oldWorld.events`
  before B3).
- Consumer prototype-patching engine classes.
- Consumer using engine types in ways the engine didn't intend.

**Triage**: leave the hack in the consumer as tagged tech debt
(`// HACK: engine gap — see issue #N`). Do not paper over it in the
engine by adding one-off support. **Wait for a second consumer to hit
the same wall**, then promote with confidence.

### Failure mode 2: premature generalization in the engine

Engine code was lifted from one consumer but still carries that
consumer's assumptions. Red flags:

- Engine imports from a consumer-specific folder.
- Engine hardcodes specific tag names, component names, or enum values.
- Engine API takes parameters only one consumer would ever provide.

**Triage**: revert the extraction. Move the code back into the consumer.
Wait for a second driver to reveal the real abstraction shape. Better
"consumer has code the engine could own" than "engine has code nobody
but one consumer uses."

## Tradeoffs

Layering and module abstraction are not free. Worth naming the costs so
"why isn't everything just one big `World` class" has a written answer.

**What it costs:**

- **Extra indirection.** `world.spatial.queryAt({x, y})` involves an
  interface call. Negligible for normal use; profile and inline if a hot
  loop ever sting.
- **More types.** Every module ships an interface + a default impl,
  doubling the surface area vs a hardcoded implementation.
- **Learning curve for contributors.** "Where does X go?" requires
  applying the triage table. Documented, but a new contributor still
  has to read it.
- **Temptation to over-engineer.** YAGNI is real. Each generalization
  must be justified by either (a) a concrete current need, or (b) a
  concrete cost in the current non-general shape — see the failure
  modes above.

**What it saves:**

- **Reusability.** The engine survives a genre pivot without a rewrite
  (validated by snake / asteroids / platformer / 3D platformer
  prototypes consuming `@pierre/ecs` byte-identical).
- **Testability.** Mock implementations of any module let you test the
  core + other modules in isolation.
- **Modding (future).** Plugins fall out naturally once modules are
  well-separated.
- **Clearer mental model.** "Where does the turn counter live?" has a
  single correct answer (`TickSource`), not two.

## Prior Art

Engines worth reading when considering layering or extension shape:

- **[Bevy](https://bevyengine.org)** — Rust. `bevy_ecs` is the model of
  layer separation. The crate dependency graph is the documentation.
- **[flecs](https://www.flecs.dev/flecs/)** — C/C++, archetype-based,
  very fast. Has explicit "basic" and "addons" distributions.
- **[EnTT](https://github.com/skypjack/entt)** — C++, header-only,
  widely used in AAA (Minecraft: Bedrock). Strictly core-only; modules
  are community.
- **[BitECS](https://github.com/NateTheGreatt/bitECS)** — JS/TS,
  archetype-based, tiny. Example of a JS ECS that stays core-only.
- **[Unity DOTS](https://unity.com/dots)** — A cautionary tale of tight
  coupling to a single host engine. Good for archetype algorithms;
  **do not copy** the way it's wedded to Unity's component system.

## Promotion Workflow

When you identify a primitive worth promoting:

1. **Confirm the promotion path:**
   - **Path A:** ≥2 real consumers. A hypothetical future consumer
     doesn't count. The second consumer can be a planned, scoped
     prototype — but not a vague "someone might want this someday".
   - **Path B:** 1 real consumer exercising the primitive + a citable
     canon reference (named engine, library, or standard textbook
     treatment with a stable API shape). Paste the reference into the
     plan file and the commit body.
2. **Identify what parameterizes the difference.** Component defs? Tag
   names? A strategy interface? If you can't name the parameter, you
   don't yet have the abstraction.
3. **Choose the layer.**
   - Domain-neutral → `packages/ecs/src/` (core).
   - Genre-scoped → `packages/ecs/src/modules/<domain>/`.
   - Not sure? Default to **modules** over core. Easier to promote
     module → core later than to split core → modules.
4. **Write a tight plan** in `docs/plans/<feature>.md` if the extraction
   is non-trivial. Include the two consumers that justify it.
5. **Ship the primitive + migrate both consumers in the same commit**
   when feasible. Keeps the "why this shape" visible in one diff.
6. **Keep consumer-facing ergonomics** (dual signatures, helper methods)
   on the implementation class, not the interface. See `HashGrid2D`'s
   integer-shorthand `add(id, x, y)` alongside the interface-shape
   `add(id, pos)`.

## Consumer-Shaped Middle Ground

A useful third option when you're unsure whether to extract: **write
engine-shaped code inside the consumer until it earns promotion.** Define
a clear interface (e.g. `interface PhysicsBackend { step(...); queryAABB(...); }`)
but keep that interface *in the consumer* initially. When the second
consumer arrives, the interface + one impl lift cleanly into
`modules/<domain>/` — this is what `SpatialIndex` → `SpatialStructure` +
`HashGrid2D` did: the old class was already interface-shaped in spirit,
so the split was one tight commit instead of an archaeology expedition.

## Signals

**Signals to extract (promote):**

- Two real consumers have copy-pasted or near-duplicated the code.
- A second consumer's need shows the first consumer had unnecessary
  specificity baked in.
- The code has no natural dependency on consumer-specific types — it
  could be written with type parameters or zero consumer imports.
- The abstraction boundary is obvious (a clear interface + ≥1 impl).

**Signals to leave it in the consumer:**

- It references consumer-specific components or tags.
- It encodes genre-specific rules.
- Only one consumer wants it.
- You can't name what parameterizes the difference across consumers.
- The engine already has a primitive that covers 80% of the need — the
  remaining 20% may be consumer-scoped custom logic, not an engine gap.

## Prototypes Aren't the Only Drivers

Prototype-driven development is **one** driver for engine changes —
specifically for testing *generality* (does this primitive survive a
genre shift?). It's not the only one.

Two other legitimate drivers:

- **Existing consumer pain.** The roguelike alone has driven the entire
  engine audit, M1 spatial split, M2 tick infrastructure, and all A1–A10
  improvements. No prototype needed — the single consumer surfaced real
  quality issues.
- **Public-release readiness.** Items like dev-inspector, plugin
  architecture, keybinding registry live on the core-engine roadmap
  because the engine needs them to be usable by others, even if the
  roguelike works fine without them.

Match the driver to the change:

| Change type | Right driver |
|---|---|
| Improve primitive quality (perf, ergonomics, bug fixes) | Existing consumer usage |
| Test primitive generality (does it survive genre change?) | Prototype in a different genre |
| Close a gap for external users | Public-release audit |
| Add a new primitive | Need from ≥2 consumers |

## Worked Example: Path-B Promotion (`modules/lifetime`)

Asteroids defined a local `LifetimeDef { remainingMs }` + one-pass
countdown system for bullet expiry. One internal consumer, but:

- The API shape is textbook: countdown field + per-tick decrement +
  destroy-on-expire.
- It is directly named in external canon: Unreal's
  `AActor::SetLifeSpan`, Unity's `Object.Destroy(obj, t)`, Gregory,
  *Game Engine Architecture* (3rd ed.) §12.5.
- Minimal surface: a component with one field and a system factory
  with one optional hook (`onExpire`) for consumers that need extra
  cleanup.
- Demotable: the entire module is ~40 LOC across two files; if a
  future prototype reveals a richer shape (e.g. pause semantics,
  elapsed-time tracking) and contradicts this one, we delete the
  module and the consumer re-inlines it.

Under the old Rule-of-Three rule this would have waited for a second
consumer. Under **Path B** it shipped with the asteroids migration
alone, because the canon reference is the second data point.

The shipped module lives at `packages/ecs/src/modules/lifetime/` and
is imported as `@pierre/ecs/modules/lifetime`.

## Related

- [packages/ecs/docs/README.md](README.md) — engine primitives index.
