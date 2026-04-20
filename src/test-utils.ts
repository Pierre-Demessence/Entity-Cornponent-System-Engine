import type { ComponentDef, TagDef } from './component-store';
import type { EntityId } from './entity-id';

import { EcsWorld } from './world';

/**
 * Convenience subclass of `EcsWorld` intended for unit tests. Provides no
 * extra behaviour — it exists so test code can `new TestWorld()` without
 * building a project-specific subclass just to exercise the ECS primitives.
 *
 * Register components and tags on the instance like you would on any other
 * world: `world.registerComponent(PositionDef)`.
 */
export class TestWorld extends EcsWorld {}

/** Create a fresh `TestWorld`. Equivalent to `new TestWorld()` but reads better in tests. */
export function createTestWorld(): TestWorld {
  return new TestWorld();
}

/**
 * Fluent builder for assembling entities in tests against an arbitrary
 * `EcsWorld`. Domain-neutral — callers pass the `ComponentDef` / `TagDef`
 * they've registered. Mirrors game-specific builders (e.g. Roguelike's
 * `EntityBuilder`) but without baking in any components or tags.
 *
 * @example
 * ```ts
 * const world = createTestWorld();
 * const Pos = world.registerComponent(PositionDef);
 * const Blocker = world.registerTag({ name: 'blocker' });
 *
 * const id = new GenericEntityBuilder(world)
 *   .with(PositionDef, { x: 3, y: 4 })
 *   .tag({ name: 'blocker' })
 *   .build();
 * ```
 */
export class GenericEntityBuilder<W extends EcsWorld = EcsWorld> {
  readonly id: EntityId;
  private readonly world: W;

  constructor(world: W, id?: EntityId) {
    this.world = world;
    this.id = id ?? world.createEntity();
  }

  /** Finalise and return the entity id. */
  build(): EntityId {
    return this.id;
  }

  /** Add a tag to this entity. Returns `this` for chaining. */
  tag(def: TagDef): this {
    this.world.getTag(def).add(this.id);
    return this;
  }

  /** Set a component on this entity. Returns `this` for chaining. */
  with<T>(def: ComponentDef<T>, value: T): this {
    this.world.getStore(def).set(this.id, value);
    return this;
  }
}

/** Shorthand for `new GenericEntityBuilder(world)`. */
export function entity<W extends EcsWorld>(world: W): GenericEntityBuilder<W> {
  return new GenericEntityBuilder(world);
}
