import type { Vec2 } from '../math';

import { describe, expect, it } from 'vitest';

import { DragDrop } from './drag-drop';

interface Zone {
  name: string;
  h: number;
  w: number;
  x: number;
  y: number;
  accepts: (card: number) => boolean;
}

function zone(name: string, x: number, y: number, accepts: (card: number) => boolean = () => true): Zone {
  return { name, accepts, h: 10, w: 10, x, y };
}

function inZone(z: Zone, p: Vec2): boolean {
  return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
}

function makeDragDrop(zones: Zone[], extra: Partial<ConstructorParameters<typeof DragDrop<number, Zone>>[0]> = {}): DragDrop<number, Zone> {
  return new DragDrop<number, Zone>({
    contains: inZone,
    accepts: (z, card) => z.accepts(card),
    targets: () => zones,
    ...extra,
  });
}

describe('session', () => {
  it('has no session until begin, and none after end or cancel', () => {
    const dd = makeDragDrop([]);
    expect(dd.session).toBeNull();
    dd.begin(1, { x: 0, y: 0 });
    expect(dd.session?.payload).toBe(1);
    dd.end();
    expect(dd.session).toBeNull();

    dd.begin(1, { x: 0, y: 0 });
    dd.cancel();
    expect(dd.session).toBeNull();
    expect(dd.end()).toBeNull();
  });

  it('keeps the grab offset: position is pointer minus grab', () => {
    const dd = makeDragDrop([]);
    dd.begin(1, { x: 15, y: 25 }, { x: 10, y: 20 });
    expect(dd.session?.grab).toEqual({ x: 5, y: 5 });
    expect(dd.session?.position).toEqual({ x: 10, y: 20 });
    dd.move({ x: 100, y: 50 });
    expect(dd.session?.pointer).toEqual({ x: 100, y: 50 });
    expect(dd.session?.position).toEqual({ x: 95, y: 45 });
  });

  it('defaults origin to the pointer, so the item is held by its origin', () => {
    const dd = makeDragDrop([]);
    dd.begin(1, { x: 7, y: 8 });
    expect(dd.session?.grab).toEqual({ x: 0, y: 0 });
    expect(dd.session?.position).toEqual({ x: 7, y: 8 });
  });

  it('copies the points it is given', () => {
    const dd = makeDragDrop([]);
    const p = { x: 1, y: 1 };
    dd.begin(1, p);
    p.x = 50;
    dd.move(p);
    p.x = 99;
    expect(dd.session?.press).toEqual({ x: 1, y: 1 });
    expect(dd.session?.pointer).toEqual({ x: 50, y: 1 });
  });

  it('move without a session does nothing', () => {
    const dd = makeDragDrop([]);
    dd.move({ x: 1, y: 1 });
    expect(dd.session).toBeNull();
  });

  it('begin replaces a drag in progress', () => {
    const dd = makeDragDrop([zone('a', 0, 0)]);
    dd.begin(1, { x: 0, y: 0 });
    dd.begin(2, { x: 5, y: 5 });
    expect(dd.end()).toEqual({ payload: 2, target: expect.objectContaining({ name: 'a' }) });
  });
});

describe('drop resolution', () => {
  it('drops on the target under the pointer', () => {
    const dd = makeDragDrop([zone('a', 0, 0), zone('b', 20, 0)]);
    dd.begin(1, { x: 5, y: 5 });
    const result = dd.end({ x: 25, y: 5 });
    expect(result?.payload).toBe(1);
    expect(result?.target?.name).toBe('b');
  });

  it('returns a null target over empty space, so the caller snaps back', () => {
    const dd = makeDragDrop([zone('a', 0, 0)]);
    dd.begin(1, { x: 5, y: 5 });
    expect(dd.end({ x: 500, y: 500 })).toEqual({ payload: 1, target: null });
  });

  it('skips a target that contains the probe but rejects the payload', () => {
    const odd = zone('odd', 0, 0, card => card % 2 === 1);
    const any = zone('any', 0, 0);
    const dd = makeDragDrop([odd, any]);
    dd.begin(2, { x: 5, y: 5 });
    expect(dd.end()?.target?.name).toBe('any');
    dd.begin(3, { x: 5, y: 5 });
    expect(dd.end()?.target?.name).toBe('odd');
  });

  it('picks the first target in priority order when several match', () => {
    const dd = makeDragDrop([zone('first', 0, 0), zone('second', 5, 5)]);
    dd.begin(1, { x: 7, y: 7 });
    expect(dd.end()?.target?.name).toBe('first');
  });

  it('re-reads targets on every lookup', () => {
    const zones: Zone[] = [];
    const dd = makeDragDrop(zones);
    dd.begin(1, { x: 5, y: 5 });
    expect(dd.hovered).toBeNull();
    zones.push(zone('late', 0, 0));
    expect(dd.hovered?.name).toBe('late');
  });

  it('hovered follows the pointer', () => {
    const dd = makeDragDrop([zone('a', 0, 0), zone('b', 20, 0)]);
    dd.begin(1, { x: 5, y: 5 });
    expect(dd.hovered?.name).toBe('a');
    dd.move({ x: 25, y: 5 });
    expect(dd.hovered?.name).toBe('b');
    dd.move({ x: 15, y: 5 });
    expect(dd.hovered).toBeNull();
  });
});

describe('probe', () => {
  // Grabbed 8 px right of the item's origin; the pointer lands in 'right' while
  // the item's origin lands in 'left'.
  const setupProbe = (probe: ConstructorParameters<typeof DragDrop<number, Zone>>[0]['probe']): DragDrop<number, Zone> => {
    const dd = makeDragDrop([zone('left', 0, 0), zone('right', 11, 0)], { probe });
    dd.begin(1, { x: 8, y: 5 }, { x: 0, y: 5 });
    dd.move({ x: 12, y: 5 });
    return dd;
  };

  it('tests at the pointer by default', () => {
    expect(setupProbe(undefined).end()?.target?.name).toBe('right');
  });

  it('\'origin\' tests at the item\'s origin', () => {
    expect(setupProbe('origin').end()?.target?.name).toBe('left');
  });

  it('a function derives the point from the session', () => {
    const dd = setupProbe(s => ({ x: s.position.x + 20, y: s.position.y }));
    expect(dd.end()?.target).toBeNull();
    const centre = setupProbe(s => ({ x: s.position.x + 7, y: s.position.y }));
    expect(centre.end()?.target?.name).toBe('right');
  });
});

describe('threshold', () => {
  it('a release below the threshold is a click: no drop result', () => {
    const dd = makeDragDrop([zone('a', 0, 0)], { threshold: 4 });
    dd.begin(1, { x: 5, y: 5 });
    expect(dd.session?.started).toBe(false);
    expect(dd.hovered).toBeNull();
    dd.move({ x: 7, y: 7 });
    expect(dd.session?.started).toBe(false);
    expect(dd.end()).toBeNull();
    expect(dd.session).toBeNull();
  });

  it('starts once the pointer has moved the threshold, and stays started', () => {
    const dd = makeDragDrop([zone('a', 0, 0)], { threshold: 4 });
    dd.begin(1, { x: 1, y: 1 });
    dd.move({ x: 5, y: 1 });
    expect(dd.session?.started).toBe(true);
    dd.move({ x: 1, y: 1 });
    expect(dd.session?.started).toBe(true);
    expect(dd.end()?.target?.name).toBe('a');
  });

  it('counts the final pointer passed to end', () => {
    const dd = makeDragDrop([zone('a', 0, 0), zone('b', 20, 0)], { threshold: 4 });
    dd.begin(1, { x: 5, y: 5 });
    expect(dd.end({ x: 25, y: 5 })?.target?.name).toBe('b');
  });

  it('defaults to 0: started at the press', () => {
    const dd = makeDragDrop([]);
    dd.begin(1, { x: 0, y: 0 });
    expect(dd.session?.started).toBe(true);
  });
});
