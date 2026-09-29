# Write your own module

A module is the unit the engine adds capability in: one folder, one subpath
import, one README. Games built on the engine use the same shape for their own
reusable pieces, so this page is about the conventions that make a module a
module rather than a folder of code.

## What belongs in a module

Three places code can live, and the boundary between them is the point:

| Where | What goes there |
| --- | --- |
| **Core** (`src/`) | Domain-neutral primitives. Nothing here may mention a genre concept — no player, tile, turn or enemy. |
| **A module** (`src/modules/<name>/`) | One capability, layered on core. Genre-specific is fine here; that is what the modules group is for. |
| **Your game** | The rules, the content, the tuning. |

The test for "is this core?" is whether a genre concept appears in it. If a
primitive needs one, it is a module — or it belongs in the game.

## The shape

```text
src/modules/timer/
  index.ts          # the public surface: re-exports from the files below
  timer.ts          # the components and pure helpers
  timer-system.ts   # the system factory
  timer.test.ts     # tests, beside the file they test
  README.md         # the guide that becomes the module's Manual page
```

`index.ts` is a barrel: it re-exports the module's public symbols from its own
files and nothing else. It is what `@pierre/ecs/modules/timer` resolves to, via
the package's `"./modules/*": "./src/modules/*/index.ts"` export. A module is not
registered anywhere — publishing the folder is what makes it importable.

## The pieces

**Components.** Reach for the factories rather than writing a `ComponentDef` by
hand. `simpleComponent` builds one from a flat primitive schema, and
`registryComponent` builds one for a reference into the world's registry — both
are documented in [`component-store`](../../core/component-store/). Serialization
comes from the factory, which is what makes your component saveable.

**A system factory.** The convention is a `makeXSystem(options?)` function
returning a `SchedulableSystem<TCtx>`, rather than an exported system object. It
lets the caller name the system, set `runAfter`, and inject what the system needs,
without the module reaching for a global:

```ts
export function makeTimerSystem<TCtx extends TimerTickCtx>(
  options: TimerSystemOptions<TCtx> = {},
): SchedulableSystem<TCtx> { /* ... */ }
```

**A context interface.** Declare the narrowest context your system needs and name
it `<Thing>TickCtx` — `LifetimeTickCtx`, `VelocityIntegrationTickCtx`. It keeps
the module usable from a project whose tick context carries more than `world` and
`dtMs`, and it documents exactly what the system reads.

**Pure helpers for pure work.** Anything with no world in it — a curve, a
projection, a distance — is a plain function, not a system. It is easier to test
and the module stays smaller.

## The rules that keep the layering intact

These are architectural rather than stylistic:

- **A module depends on core only.** It imports `#<primitive>` internally and
  never `@pierre/ecs` itself — the barrel would pull in the whole core surface and
  defeat the subpath split.
- **A module does not import another module** unless that dependency is stated in
  its own README. One documented dependency is fine; an undeclared one is how a
  subpath import starts dragging in half the engine.
- **Tests sit beside the source** as `<file>.test.ts`, not in a separate tree.
- **The README is the module's Manual page.** It is published verbatim, so it is
  written for a reader of the site: what the module is for, when to reach for it,
  and how it fits the rest.

## Conventions worth copying

- **A `-3d` suffix means a mirrored *system* family**, never math: `motion` and
  `motion-3d`, `transform` and `transform-3d`. Changing one means changing its
  twin.
- **Value primitives live together.** Scalars and vector/rotation types share one
  module rather than splitting by dimension, so `math` holds `vec2*`, `vec3*`,
  `quat*` and `mat4*` alongside `clamp` and `lerp`.
- **Prefix by family, not by namespace.** Vector and rotation operations take a
  value plus a family prefix — `vec3Normalize`, `quatSlerp` — while scalars stay
  unprefixed.

## Check the surface before you build

Before writing a helper, check whether the engine already ships it:
[`docs/agent/engine-api.md`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/agent/engine-api.md)
is a generated one-line-per-symbol catalog of every export, with its signature.
Reinventing a shipped primitive is the most common way a module ends up with a
parallel API nobody asked for.

## See also

- [`component-store`](../../core/component-store/) — `simpleComponent`,
  `registryComponent`, and serialization.
- [`scheduler`](../../core/scheduler/) — what a `SchedulableSystem` declares.
- [The model](../../concepts/model/) — the primitives a module is built from.
- [Module index](../../getting-started/module-index/) — what already exists.
