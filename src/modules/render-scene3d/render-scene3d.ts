import type { EntityId } from '#entity-id';
import type { Renderer } from '#renderer';
import type { EcsWorld } from '#world';
import type { SceneGraph } from './scene-graph';

/** The context a {@link Scene3DRenderer} pass reconciles into: the scene `graph` and the `world`. */
export interface Scene3DRenderContext<TObject> {
  graph: SceneGraph<TObject>;
  world: EcsWorld;
}

/** One selected entity: its id followed by the component values `select` yields. */
export type Scene3DEntry<TRow extends unknown[]> = [EntityId, ...TRow];

/** {@link Scene3DRenderer} options: which entities to draw, how to build an object for one, and how to update it. */
export interface Scene3DRendererOptions<TObject, TRow extends unknown[]> {
  /**
   * Builds the object for an entity on the first frame it is selected. Owned
   * geometry and materials stay the caller's to dispose.
   */
  create: (entry: Scene3DEntry<TRow>, world: EcsWorld) => TObject;
  /**
   * Called once per object right after it is removed from the graph — when
   * its entity leaves the selection, and for every held object on
   * {@link Scene3DRenderer.dispose}. Release or recycle what `create` built
   * (geometries, materials, pooled meshes) here. `world` is the one passed to
   * the most recent `render`.
   */
  remove?: (object: TObject, entityId: EntityId, world: EcsWorld) => void;
  /**
   * The entities this pass draws, re-evaluated every frame — typically
   * `world.query(...)` narrowed with `.withTag(...)` / `.without(...)`. An
   * entity absent from the result has its object removed from the graph.
   */
  select: (world: EcsWorld) => Iterable<Scene3DEntry<TRow>>;
  /** Updates an entity's object every frame it is selected, including the frame it was created. */
  sync?: (object: TObject, entry: Scene3DEntry<TRow>, world: EcsWorld) => void;
}

/**
 * A `Renderer` that keeps one scene-graph object per selected entity: created
 * on first selection, synced every frame, and removed from the graph once the
 * entity stops matching. Generic over the object type — pass a three.js
 * `Scene` as the graph and build `Mesh` / `Sprite` objects in `create`.
 *
 * It owns existence only. Drawing the scene, the camera, the canvas and GPU
 * resources stay with the caller. Entity ids restart after
 * `world.clearAll()` or `world.loadJSON(...)`; call {@link dispose} then, so
 * a reused id is not matched to the previous entity's object.
 */
export class Scene3DRenderer<TObject, TRow extends unknown[] = unknown[]>
implements Renderer<Scene3DRenderContext<TObject>> {
  private readonly objects = new Map<EntityId, TObject>();
  private readonly options: Scene3DRendererOptions<TObject, TRow>;
  private readonly seen = new Set<EntityId>();
  private world: EcsWorld | undefined;

  constructor(options: Scene3DRendererOptions<TObject, TRow>) {
    this.options = options;
  }

  /**
   * Remove every tracked object from `graph` (calling the `remove` option for
   * each) and forget it; the next `render` recreates what is still selected.
   */
  dispose(graph: SceneGraph<TObject>): void {
    const { remove } = this.options;
    const world = this.world;
    for (const [id, object] of this.objects) {
      graph.remove(object);
      // Objects exist only after a render, so `world` is set whenever this loop runs.
      if (world !== undefined)
        remove?.(object, id, world);
    }
    this.objects.clear();
    this.seen.clear();
  }

  /** The object this pass currently holds for `entityId`, if the entity was selected on the last `render`. */
  get(entityId: EntityId): TObject | undefined {
    return this.objects.get(entityId);
  }

  render({ graph, world }: Scene3DRenderContext<TObject>): void {
    const { create, remove, select, sync } = this.options;
    this.world = world;
    for (const entry of select(world)) {
      const id = entry[0];
      let object = this.objects.get(id);
      if (object === undefined) {
        object = create(entry, world);
        this.objects.set(id, object);
        graph.add(object);
      }
      sync?.(object, entry, world);
      this.seen.add(id);
    }
    for (const [id, object] of this.objects) {
      if (this.seen.has(id))
        continue;
      graph.remove(object);
      this.objects.delete(id);
      remove?.(object, id, world);
    }
    this.seen.clear();
  }
}
