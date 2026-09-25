---
title: API reference
description: Every public export of @pierre/ecs, with its full type signature and a link to the exact source line.
---

Every public export of `@pierre/ecs`, with its full type signature, its JSDoc
summary, and a link to the exact source line.

Entries are grouped by import path:

- `@pierre/ecs/*` — the domain-neutral core: world, component stores, queries,
  scheduler, event bus, templates, tick.
- `@pierre/ecs/modules/*` — opt-in modules. Each is a separate subpath, so
  unused modules stay out of your bundle.

Use the search box to find a symbol, or the sidebar to browse.

:::note[Pre-release]
The API is still shifting as it is validated across a suite of example games,
and it is not published to npm.
:::

Looking for concepts rather than signatures? The [Manual](../manual/) explains
what each module is for and when to reach for it.
