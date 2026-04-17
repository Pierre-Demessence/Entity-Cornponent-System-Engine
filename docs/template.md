---
post_title: "EntityTemplate & World.spawn()"
author1: pierre
post_slug: ecs-template
microsoft_alias: n/a
featured_image: n/a
categories: []
tags: [ecs, architecture]
ai_note: AI-assisted
summary: Declarative entity templates and the spawn() method for data-driven entity creation.
post_date: 2025-07-14
---

## EntityTemplate

Defined in `src/ecs/template.ts`. Engine-agnostic — no knowledge of
specific component types.

```ts
interface EntityTemplate {
  readonly name: string;
  readonly components?: Readonly<Record<string, unknown>>;
  readonly tags?: readonly string[];
}
```

- **name** — Human-readable identifier (e.g. `"orc"`, `"healPotion"`)
- **components** — Keys are registered `ComponentDef` names,
  values are component data
- **tags** — Registered `TagDef` names to add to the entity

## World.spawn()

```ts
world.spawn(template: EntityTemplate, overrides?: Record<string, unknown>): EntityId
```

1. Creates a new entity via `world.createEntity()`
2. Iterates `template.components` — resolves each store by name
   via `storeByName`, shallow-merges with matching override, calls
   `store.set()`
3. Iterates `template.tags` — resolves each tag store via `tagByName`,
   calls `store.add()`
4. Throws if a component or tag name is not registered

### Overrides

Pass runtime data (e.g. position) that varies per spawn call:

```ts
world.spawn(orcTemplate, { positions: { x: 5, y: 10 } });
```

Override values are spread over the template's component data,
so partial overrides work.

### Caveats

- **Shallow merge only** — Nested structures cannot be partially
  overridden. Overriding a single field inside `equipments` requires
  passing the entire `equipments` object.
- **Runtime validation** — Component/tag name typos (e.g. `renderable`
  vs `renderables`) are caught at spawn time, not compile time. This
  is a trade-off for dynamic registration.
- **Template names** — Must be unique within each template array.
  Duplicate names cause `find()` to return the first match silently.

```
