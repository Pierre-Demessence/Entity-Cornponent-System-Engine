import type { EntityId } from '#entity-id';
import type { ComponentDef, TagDef } from '#index';
import type { Scene3DEntry } from './render-scene3d';
import type { SceneGraph } from './scene-graph';

import { describe, expect, it, vi } from 'vitest';

import { simpleComponent } from '#index';
import { eid } from '#test-utils';
import { EcsWorld } from '#world';

import { Scene3DRenderer } from './render-scene3d';

interface Pos { x: number; y: number; z: number }
interface Size { s: number }
interface FakeObject { id: EntityId; position: Pos; scale: number }

const PosDef: ComponentDef<Pos> = simpleComponent<Pos>('pos', { x: 'number', y: 'number', z: 'number' });
const SizeDef: ComponentDef<Size> = simpleComponent<Size>('size', { s: 'number' });
const BodyTag: TagDef = { name: 'body' };
const DoorTag: TagDef = { name: 'door' };

class FakeGraph implements SceneGraph<FakeObject> {
  readonly children = new Set<FakeObject>();
  readonly add = vi.fn((object: FakeObject) => {
    this.children.add(object);
  });

  readonly remove = vi.fn((object: FakeObject) => {
    this.children.delete(object);
  });
}

function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PosDef);
  world.registerComponent(SizeDef);
  world.registerTag(BodyTag);
  world.registerTag(DoorTag);
  return world;
}

function spawnBody(world: EcsWorld, pos: Pos, size = 1): EntityId {
  const id = world.createEntity();
  world.getStore(PosDef).set(id, pos);
  world.getStore(SizeDef).set(id, { s: size });
  world.getTag(BodyTag).add(id);
  return id;
}

function bodyRenderer(): Scene3DRenderer<FakeObject, [Pos, Size]> {
  return new Scene3DRenderer({
    create: ([id]) => ({ id, position: { x: 0, y: 0, z: 0 }, scale: 0 }),
    select: w => w.query(PosDef, SizeDef).withTag(w.getTag(BodyTag)).without(w.getTag(DoorTag)),
    sync: (object, [, p, size]) => {
      object.position = { ...p };
      object.scale = size.s;
    },
  });
}

describe('@pierre/ecs/modules/render-scene3d', () => {
  it('creates one object per entity once and syncs it every frame with the typed row', () => {
    const world = makeWorld();
    const graph = new FakeGraph();
    const create = vi.fn(([id]: Scene3DEntry<[Pos]>) => ({ id, position: { x: 0, y: 0, z: 0 }, scale: 1 }));
    const sync = vi.fn((object: FakeObject, [, p]: Scene3DEntry<[Pos]>) => {
      object.position = { ...p };
    });
    const renderer = new Scene3DRenderer({ create, sync, select: w => w.query(PosDef) });
    const id = spawnBody(world, { x: 1, y: 2, z: 3 });

    renderer.render({ graph, world });
    world.getStore(PosDef).set(id, { x: 4, y: 5, z: 6 });
    renderer.render({ graph, world });

    expect(create).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(graph.add).toHaveBeenCalledTimes(1);
    const [object] = graph.children;
    expect(object?.id).toBe(id);
    expect(object?.position).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('reaps an entity that leaves the selection, whatever the reason', () => {
    const world = makeWorld();
    const graph = new FakeGraph();
    const renderer = bodyRenderer();
    const untagged = spawnBody(world, { x: 0, y: 0, z: 0 });
    const unsized = spawnBody(world, { x: 1, y: 0, z: 0 });
    const excluded = spawnBody(world, { x: 2, y: 0, z: 0 });
    const destroyed = spawnBody(world, { x: 3, y: 0, z: 0 });
    const kept = spawnBody(world, { x: 4, y: 0, z: 0 });

    renderer.render({ graph, world });
    expect(graph.children.size).toBe(5);

    world.getTag(BodyTag).delete(untagged);
    world.getStore(SizeDef).delete(unsized);
    world.getTag(DoorTag).add(excluded);
    world.destroyEntity(destroyed);
    renderer.render({ graph, world });

    expect(graph.remove).toHaveBeenCalledTimes(4);
    expect([...graph.children].map(o => o.id)).toEqual([kept]);
  });

  it('builds a fresh object when an entity re-enters the selection', () => {
    const world = makeWorld();
    const graph = new FakeGraph();
    const renderer = bodyRenderer();
    const id = spawnBody(world, { x: 0, y: 0, z: 0 });

    renderer.render({ graph, world });
    const first = [...graph.children][0];
    world.getTag(BodyTag).delete(id);
    renderer.render({ graph, world });
    expect(renderer.get(id)).toBeUndefined();
    world.getTag(BodyTag).add(id);
    renderer.render({ graph, world });

    const second = [...graph.children][0];
    expect(graph.children.size).toBe(1);
    expect(second).not.toBe(first);
    expect(renderer.get(id)).toBe(second);
  });

  it('gives an entity carrying an excluded tag no object from that pass', () => {
    const world = makeWorld();
    const graph = new FakeGraph();
    const id = spawnBody(world, { x: 0, y: 0, z: 0 });
    world.getTag(DoorTag).add(id);

    bodyRenderer().render({ graph, world });

    expect(graph.add).not.toHaveBeenCalled();
  });

  it('dispose removes every object, and a reused id after clearAll is built anew', () => {
    const world = makeWorld();
    const graph = new FakeGraph();
    const create = vi.fn(([id, , size]: Scene3DEntry<[Pos, Size]>) => ({ id, position: { x: 0, y: 0, z: 0 }, scale: size.s }));
    const renderer = new Scene3DRenderer({ create, select: w => w.query(PosDef, SizeDef) });
    const before = spawnBody(world, { x: 0, y: 0, z: 0 }, 1);
    spawnBody(world, { x: 1, y: 0, z: 0 }, 1);
    renderer.render({ graph, world });

    world.clearAll();
    renderer.dispose(graph);
    expect(graph.children.size).toBe(0);

    const after = spawnBody(world, { x: 0, y: 0, z: 0 }, 7);
    renderer.render({ graph, world });

    expect(after).toBe(before);
    expect(create).toHaveBeenCalledTimes(3);
    expect([...graph.children][0]?.scale).toBe(7);
  });

  describe('remove option', () => {
    function removingRenderer(remove: (object: FakeObject, id: EntityId, world: EcsWorld) => void) {
      return new Scene3DRenderer<FakeObject, [Pos]>({
        remove,
        create: ([id]) => ({ id, position: { x: 0, y: 0, z: 0 }, scale: 1 }),
        select: w => w.query(PosDef).withTag(w.getTag(BodyTag)),
      });
    }

    it('is called once, after graph.remove, when an entity leaves the selection', () => {
      const world = makeWorld();
      const graph = new FakeGraph();
      const remove = vi.fn((object: FakeObject) => {
        expect(graph.children.has(object)).toBe(false);
      });
      const renderer = removingRenderer(remove);
      const id = spawnBody(world, { x: 0, y: 0, z: 0 });
      renderer.render({ graph, world });
      const [object] = graph.children;

      world.getTag(BodyTag).delete(id);
      renderer.render({ graph, world });
      renderer.render({ graph, world });

      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith(object, id, world);
    });

    it('is not called while the entity stays selected', () => {
      const world = makeWorld();
      const graph = new FakeGraph();
      const remove = vi.fn();
      const renderer = removingRenderer(remove);
      spawnBody(world, { x: 0, y: 0, z: 0 });

      renderer.render({ graph, world });
      renderer.render({ graph, world });

      expect(remove).not.toHaveBeenCalled();
    });

    it('is called for every held object on dispose, and not again afterwards', () => {
      const world = makeWorld();
      const graph = new FakeGraph();
      const remove = vi.fn();
      const renderer = removingRenderer(remove);
      const a = spawnBody(world, { x: 0, y: 0, z: 0 });
      const b = spawnBody(world, { x: 1, y: 0, z: 0 });
      renderer.render({ graph, world });

      renderer.dispose(graph);
      renderer.render({ graph: new FakeGraph(), world: makeWorld() });

      expect(remove).toHaveBeenCalledTimes(2);
      expect(remove.mock.calls.map(c => c[1])).toEqual([a, b]);
      expect(remove.mock.calls.every(c => c[2] === world)).toBe(true);
    });
  });

  it('accepts any iterable of entries, not only a query', () => {
    const world = makeWorld();
    const graph = new FakeGraph();
    const entries: Array<Scene3DEntry<[number]>> = [[eid(10), 1], [eid(11), 2]];
    const renderer = new Scene3DRenderer<FakeObject, [number]>({
      create: ([id, scale]) => ({ id, position: { x: 0, y: 0, z: 0 }, scale }),
      select: () => entries,
    });

    renderer.render({ graph, world });

    expect([...graph.children].map(o => [o.id, o.scale])).toEqual([[10, 1], [11, 2]]);
  });

  it('calls select once per world and re-iterates its result every frame', () => {
    const world = makeWorld();
    const graph = new FakeGraph();
    const select = vi.fn((w: EcsWorld) => w.query(PosDef));
    const renderer = new Scene3DRenderer<FakeObject, [Pos]>({
      select,
      create: ([id, position]) => ({ id, position, scale: 1 }),
    });

    spawnBody(world, { x: 0, y: 0, z: 0 });
    renderer.render({ graph, world });
    spawnBody(world, { x: 1, y: 0, z: 0 });
    renderer.render({ graph, world });
    expect(select).toHaveBeenCalledOnce();
    expect(graph.children.size).toBe(2);

    const other = makeWorld();
    renderer.render({ graph, world: other });
    expect(select).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenLastCalledWith(other);
    expect(graph.children.size).toBe(0);
  });
});
