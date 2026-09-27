import type { ComponentDef, TagDef } from '#component-store';

import { describe, expect, it } from 'vitest';

import { simpleComponent } from '#component-store';
import { EcsWorld } from '#world';

const PosDef = simpleComponent('pos', { x: 'number', y: 'number' }) as ComponentDef<unknown>;
const VelDef = simpleComponent('vel', { dx: 'number', dy: 'number' }) as ComponentDef<unknown>;
const LabelDef = simpleComponent('label', { text: 'string' }) as ComponentDef<unknown>;
const FrozenTag: TagDef = { name: 'frozen' };
const HiddenTag: TagDef = { name: 'hidden' };

function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PosDef);
  w.registerComponent(VelDef);
  w.registerComponent(LabelDef);
  w.registerTag(FrozenTag);
  w.registerTag(HiddenTag);
  return w;
}

function queryIds(w: EcsWorld, defs: ComponentDef<unknown>[], required: TagDef[], excluded: TagDef[]): number[] {
  let q = (w.query as (...d: ComponentDef<unknown>[]) => ReturnType<EcsWorld['query']>)(...defs);
  for (const t of required) q = q.withTag(w.getTag(t));
  for (const t of excluded) q = q.without(w.getTag(t));
  return q.run().map(r => r[0]).sort((a, b) => a - b);
}

function bruteForce(w: EcsWorld, defs: ComponentDef<unknown>[], required: TagDef[], excluded: TagDef[], ids: number[]): number[] {
  return ids.filter((id) => {
    for (const def of defs) {
      if (!w.getStore(def).has(id))
        return false;
    }
    for (const t of required) {
      if (!w.getTag(t).has(id))
        return false;
    }
    for (const t of excluded) {
      if (w.getTag(t).has(id))
        return false;
    }
    return true;
  }).sort((a, b) => a - b);
}

describe('archetype cache (world integration)', () => {
  it('matches brute-force scan across random worlds and query shapes', () => {
    // Deterministic LCG so a failure is reproducible; parity holds for any data.
    let seed = 0x2545_F491;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7FFF_FFFF;
      return seed / 0x7FFF_FFFF;
    };

    const w = makeWorld();
    const ids: number[] = [];
    for (let i = 0; i < 400; i++) {
      const id = w.createEntity();
      ids.push(id);
      if (rand() < 0.7)
        w.getStore(PosDef).set(id, { x: rand(), y: rand() });
      if (rand() < 0.5)
        w.getStore(VelDef).set(id, { dx: rand(), dy: rand() });
      if (rand() < 0.3)
        w.getStore(LabelDef).set(id, { text: 'e' });
      if (rand() < 0.4)
        w.getTag(FrozenTag).add(id);
      if (rand() < 0.2)
        w.getTag(HiddenTag).add(id);
    }

    const shapes: { defs: ComponentDef<unknown>[]; excluded: TagDef[]; required: TagDef[] }[] = [
      { defs: [PosDef], excluded: [], required: [] },
      { defs: [PosDef, VelDef], excluded: [], required: [] },
      { defs: [PosDef, VelDef, LabelDef], excluded: [], required: [] },
      { defs: [PosDef], excluded: [], required: [FrozenTag] },
      { defs: [PosDef], excluded: [HiddenTag], required: [] },
      { defs: [PosDef, VelDef], excluded: [HiddenTag], required: [FrozenTag] },
      { defs: [VelDef], excluded: [FrozenTag, HiddenTag], required: [] },
    ];
    for (const { defs, excluded, required } of shapes) {
      expect(queryIds(w, defs, required, excluded))
        .toEqual(bruteForce(w, defs, required, excluded, ids));
    }
  });

  it('reflects component add and removal', () => {
    const w = makeWorld();
    const id = w.createEntity();
    expect(queryIds(w, [PosDef], [], [])).toEqual([]);
    w.getStore(PosDef).set(id, { x: 1, y: 2 });
    expect(queryIds(w, [PosDef], [], [])).toEqual([id]);
    w.getStore(PosDef).delete(id);
    expect(queryIds(w, [PosDef], [], [])).toEqual([]);
  });

  it('a value replace keeps the entity in results (no archetype thrash)', () => {
    const w = makeWorld();
    const id = w.createEntity();
    w.getStore(PosDef).set(id, { x: 1, y: 2 });
    w.getStore(PosDef).set(id, { x: 9, y: 9 });
    expect(queryIds(w, [PosDef], [], [])).toEqual([id]);
  });

  it('destroyEntity removes the entity from every query', () => {
    const w = makeWorld();
    const id = w.createEntity();
    w.getStore(PosDef).set(id, { x: 1, y: 2 });
    w.getTag(FrozenTag).add(id);
    w.destroyEntity(id);
    expect(queryIds(w, [PosDef], [], [])).toEqual([]);
    expect(queryIds(w, [PosDef], [FrozenTag], [])).toEqual([]);
  });

  it('clearAll empties queries but keeps registrations usable', () => {
    const w = makeWorld();
    const id = w.createEntity();
    w.getStore(PosDef).set(id, { x: 1, y: 2 });
    w.clearAll();
    expect(queryIds(w, [PosDef], [], [])).toEqual([]);
    const id2 = w.createEntity();
    w.getStore(PosDef).set(id2, { x: 3, y: 4 });
    expect(queryIds(w, [PosDef], [], [])).toEqual([id2]);
  });

  it('rebuilds the index after loadJSON', () => {
    const source = makeWorld();
    const id = source.createEntity();
    source.getStore(PosDef).set(id, { x: 1, y: 2 });
    source.getStore(VelDef).set(id, { dx: 5, dy: 6 });
    source.getTag(FrozenTag).add(id);

    const target = makeWorld();
    target.loadJSON(source.toJSON());
    expect(queryIds(target, [PosDef, VelDef], [FrozenTag], [])).toEqual([id]);
    expect(queryIds(target, [PosDef], [], [FrozenTag])).toEqual([]);
  });

  it('clears stale archetype entries when loadJSON reloads a non-empty world', () => {
    const source = makeWorld();
    const kept = source.createEntity();
    source.getStore(VelDef).set(kept, { dx: 1, dy: 1 });

    const target = makeWorld();
    // Pre-existing entity that the payload does NOT contain — its component and
    // tag bits must not linger after the reload (else a query yields a row with
    // no data).
    const stale = target.createEntity();
    target.getStore(PosDef).set(stale, { x: 7, y: 8 });
    target.getTag(HiddenTag).add(stale);

    target.loadJSON(source.toJSON());

    expect(queryIds(target, [PosDef], [], [])).toEqual([]);
    expect(queryIds(target, [VelDef], [], [])).toEqual([kept]);
    expect(queryIds(target, [VelDef], [HiddenTag], [])).toEqual([]);
  });

  it('tag removal re-includes an entity excluded by that tag', () => {
    const w = makeWorld();
    const id = w.createEntity();
    w.getStore(PosDef).set(id, { x: 1, y: 2 });
    w.getTag(HiddenTag).add(id);
    expect(queryIds(w, [PosDef], [], [HiddenTag])).toEqual([]);
    w.getTag(HiddenTag).delete(id);
    expect(queryIds(w, [PosDef], [], [HiddenTag])).toEqual([id]);
  });
});
