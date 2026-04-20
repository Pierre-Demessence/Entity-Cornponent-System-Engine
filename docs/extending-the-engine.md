# Extending the Engine

How to decide where new code belongs when you hit an engine gap — whether
from the roguelike, a future prototype, or anywhere else. This is the
rule-book for promoting code into the engine, keeping it out, or demoting
it back.

## The Core Rule

**Don't abstract into the engine from one data point.** The first consumer
always over-fits the shape. The second consumer is what reveals which
parameters are real.

Practical form (Rule of Three, Fowler variant):

> Implement in the consumer. When duplication appears between two real
> consumers — or a second consumer would genuinely use the identical
> primitive if it existed — *then* lift.

Default for uncertainty: **stays in the consumer**.

## Three-Layer Triage

Where a piece of code lives depends on who uses it and what it assumes.

| Layer | Path | Criteria |
|---|---|---|
| **Core** | `packages/ecs/src/` | Domain-neutral + ≥2 real consumers + zero game imports. `EventBus`, `Scheduler`, `ComponentStore`, `SpatialStructure` interface. |
| **Modules** | `packages/ecs/src/modules/<domain>/` | Domain-scoped but **genre-reusable** (turn-based, spatial-2D, physics-2D, real-time tick). Opt-in import. `modules/turn-based/turn-cycler`, `modules/spatial/HashGrid2D`, `modules/tick/ManualTickSource`. |
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

## Promotion Workflow

When you identify a primitive worth promoting:

1. **Confirm ≥2 real consumers.** A hypothetical future consumer doesn't
   count. The second consumer can be a planned, scoped prototype — but
   not a vague "someone might want this someday".
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
  architecture, keybinding registry live on the architecture roadmap
  because the engine needs them to be usable by others, even if the
  roguelike works fine without them.

Match the driver to the change:

| Change type | Right driver |
|---|---|
| Improve primitive quality (perf, ergonomics, bug fixes) | Existing consumer usage |
| Test primitive generality (does it survive genre change?) | Prototype in a different genre |
| Close a gap for external users | Public-release audit |
| Add a new primitive | Need from ≥2 consumers |

## Related

- [packages/ecs/docs/README.md](README.md) — engine primitives index.
- [../../docs/roadmap/general-purpose-ecs-roadmap.md](../../docs/roadmap/general-purpose-ecs-roadmap.md) — module catalog and milestone ladder.
- [../../docs/roadmap/prototype-games-roadmap.md](../../docs/roadmap/prototype-games-roadmap.md) — prototype ladder for generality-driven changes.
- [../../docs/plans/done/ecs-engine-audit.md](../../docs/plans/done/ecs-engine-audit.md) — worked example of single-consumer-driven engine improvements.
