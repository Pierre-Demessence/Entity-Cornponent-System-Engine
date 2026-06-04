# Extending the Engine

How to decide where new code belongs when you hit an engine gap — whether
from the roguelike, a future prototype, or anywhere else. This is the
rule-book for promoting code into the engine, keeping it out, or demoting
it back.

## The Core Rule

**Promote a primitive into the engine once its *shape* is proven.** The
risk you are managing is shipping the wrong shape — an API that over-fits
its first caller and has to be reworked or demoted later. So the only
question that matters is: *do you have enough evidence that this shape is
right?*

Two things are evidence, and they **trade off against each other**:

- **Internal consumers.** Each real consumer that uses the primitive
  validates the shape. Two independent consumers that grew the same helper
  are strong proof.
- **External canon.** A primitive that is well-established across major
  engines (Bevy, Pixi, Phaser, Unity, Godot, Box2D, Flecs, …) with a
  stable, obvious API has *already* had its shape validated by the
  industry. The literature is a substitute for an internal consumer.

The stronger the canon, the fewer internal consumers you need:

| Canon strength | Internal consumers needed before promotion |
|---|---|
| **Unanimous, universal** — same shape in ≥3 major engines (z-order, opacity, scale, rotation, AABB, sprite/text/polygon primitives, viewport) | **0** — ship it; waiting just delays obvious infrastructure |
| **Solid** — domain-standard with an obvious API (spatial hash, quad-tree/BVH, fixed-step tick, AABB sweep, ring buffer, event bus, command buffer, lifetime/lifespan) | **1** — ship once one real consumer exercises it |
| **None** — novel, opinionated, or genre-specific shape you are still discovering (turn cycler, combat-log bridge, class/race registry, save-slot manager) | **2** — the genuine Rule of Three; wait for a second consumer to reveal the real parameters |

### These examples are deliberately generic

The mini-game examples in [`examples/`](../../examples/) are intentionally
small and genre-spanning. That changes the calculus: **a gap that even one
of these generic examples hits is strong evidence the gap is generic too.**
The "first consumer over-fits the shape" worry — the whole reason the Rule
of Three exists — is much weaker here than in a single product codebase.
Combine that with canon and the bar drops fast. Do **not** reflexively
file everything as "wait for a second consumer"; that under-promotion is
the failure mode this project actually suffers from.

### Guardrails (slide with the evidence)

The less internal-consumer proof you have, the more these apply:

- **Minimal surface.** Ship the 2–3 operations the consumer actually
  calls. No optional parameters or config knobs until a second consumer
  asks for them.
- **Cite the canon.** If you are promoting on canon strength (0 or 1
  consumers), name the engines/libraries/textbook the shape comes from in
  the commit body and plan. If you *can't* name them, you don't have
  canon — you have a novel shape, and that needs 2 consumers.
- **Demotable by default.** Write it so it can be pulled if the first real
  downstream consumer reveals the shape is subtly wrong. No deep coupling
  to core internals.

When genuinely in doubt about a *novel* shape: keep it in the consumer and
log it as a gap (see below). When the thing is canon: ship it. Promoting
recognised canon early is cheap to demote; under-promoting canon ships an
engine that can't draw rotated text.

## How gaps reach the engine

When an example needs something the engine doesn't give it — whether the
engine has *nothing*, or has a module that's *insufficient* — you always
have two options. Which one is right is governed by the **same
sliding-scale rule above**, not by whether a module already exists.

> **Extending an existing module is an engine-shape decision with exactly
> the same bar as adding a new one.** Cramming a one-off into
> `modules/tmx` is no safer than shipping a one-off new module. "A module
> already exists" is *not* a license to put anything into it.

**You can always build the example without touching the engine.** If a
module can't do what you need, ignore it (or wrap it) and do the thing
locally in the example. So there is never a *forced* engine change — the
local fallback is always available. The only real question is: *is this
capability proven enough to promote?*

### Option 1 — promote (the capability is canon)

The capability is standard / well-established — the engine *ought* to have
it. Add the new primitive, or extend the existing module, under the
sliding-scale rule (canon + this one consumer is enough). Record it in the
[gap ledger](roadmap/engine-gap-ledger.md) as resolved. (Standard
`.tsx`/CSV/flip-flag TMX → extend `modules/tmx`; a bespoke dialect → keep
it local, see Option 2.)

### Option 2 — keep it local (the capability is novel / non-standard)

The capability is non-standard, opinionated, or over-fitted to this one
example — a bespoke dialogue tree, a game-specific tween, a one-off map
format. **Do not touch the engine — not even an existing module.**
Implement it locally in the example and append the raw gap to the
[gap ledger](roadmap/engine-gap-ledger.md) — symptom only, no module
decision. A separate triage pass groups the accumulated gaps and decides
which ones become engine modules (and where), applying the sliding-scale
rule above. Keeping the *where-does-it-go* decision out of the
example-builder's hands is deliberate: it prevents one game's shape from
biasing the abstraction, and it stops one blocked consumer from baking a
bespoke format into the engine.

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
| **Core** | `src/` | Domain-neutral + enough shape-evidence (≥2 consumers, or canon — see [The Core Rule](#the-core-rule)) + zero game imports. `EventBus`, `Scheduler`, `ComponentStore`, `SpatialStructure` interface. |
| **Modules** | `src/modules/<domain>/` | Domain-scoped but **genre-reusable** (turn-based, spatial-2D, physics-2D, real-time tick). Opt-in import. `modules/turn-based/turn-cycler`, `modules/spatial/HashGrid2D`, `modules/spatial/projections`, `modules/tick/ManualTickSource`, `modules/tick/FixedIntervalTickSource`. |
| **Consumer** | Game source tree (`examples/<name>/src/…`) | One-consumer-specific, references concrete game components/tags, encodes genre rules, or a novel shape not yet proven. Everything else. |

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

So: **bias toward leaving *novel* shapes in the consumer until a second
consumer reveals the real parameters** — but promote *canon* early, since
its shape is already proven and demotion of a canonical primitive is
rare.

## Two Failure Modes

### Failure mode 1: breaking the engine/game separation

Consumer code reaches into engine internals because the engine is missing
a primitive. Red flags:

- Consumer mutating engine private state (`world.events = oldWorld.events`
  before B3).
- Consumer prototype-patching engine classes.
- Consumer using engine types in ways the engine didn't intend.

**Triage**: leave the hack in the consumer as tagged tech debt
(`// HACK: engine gap — see gap ledger`) and log it in the
[gap ledger](roadmap/engine-gap-ledger.md). Do not paper over it in the
engine by adding one-off support. Promote when the shape is proven — a
second consumer hitting the same wall, *or* canon that already pins the
shape (see [The Core Rule](#the-core-rule)). If an existing module is what
falls short, the same bar applies: extend it only when the missing
capability is canon — otherwise keep the workaround local to the example.

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

1. **Confirm you have enough shape-evidence** (see [The Core Rule](#the-core-rule)):
   - **Novel shape, no canon:** ≥2 real consumers. A hypothetical future
     consumer doesn't count. The second consumer can be a planned, scoped
     prototype — but not a vague "someone might want this someday".
   - **Canon shape:** 1 consumer (solid canon) or 0 (unanimous universal
     canon) + a citable reference (named engine, library, or standard
     textbook treatment with a stable API shape). Paste the reference into
     the plan file and the commit body. If you can't cite it, it's a novel
     shape and needs 2 consumers.
2. **Identify what parameterizes the difference.** Component defs? Tag
   names? A strategy interface? If you can't name the parameter, you
   don't yet have the abstraction.
3. **Choose the layer.**
   - Domain-neutral → `src/` (core).
   - Genre-scoped → `src/modules/<domain>/`.
   - Not sure? Default to **modules** over core. Easier to promote
     module → core later than to split core → modules.
4. **Write a tight plan** in `docs/plans/<feature>.md` if the extraction
   is non-trivial. Name the evidence that justifies it — the consumers
   and/or the canon reference.
5. **Ship the primitive + migrate its consumer(s) in the same commit**
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
- The shape is **canon** — well-established across major engines with a
  stable API — and at least one real consumer exercises it (or it's
  unanimous universal canon needing none). Canon substitutes for the
  second consumer.
- The code has no natural dependency on consumer-specific types — it
  could be written with type parameters or zero consumer imports.
- The abstraction boundary is obvious (a clear interface + ≥1 impl).

**Signals to leave it in the consumer:**

- It references consumer-specific components or tags.
- It encodes genre-specific rules.
- Only one consumer wants it **and** the shape is novel (no canon to pin
  it).
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
| Add a new primitive | ≥2 consumers, **or** canon + 1 (or unanimous canon + 0) — see [The Core Rule](#the-core-rule) |

## Worked Example: Canon promotion with one consumer (`modules/lifetime`)

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

Under a strict rule-of-three this would have waited for a second
consumer. Under **the sliding-scale rule** it shipped with the asteroids
migration alone, because the canon reference is the second data point.

The shipped module lives at `src/modules/lifetime/` and
is imported as `@pierre/ecs/modules/lifetime`.

## Related

- [docs/README.md](README.md) — engine primitives index.
