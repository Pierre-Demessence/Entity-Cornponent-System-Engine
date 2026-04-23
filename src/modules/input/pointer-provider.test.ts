import type { InputRawEvent } from '#input-source';

import type { PointerTarget } from './pointer-provider';

import { describe, expect, it } from 'vitest';

import { createInput } from './input-state';
import { Key } from './key-codes';
import { KeyboardProvider } from './keyboard-provider';
import { Pointer, PointerProvider } from './pointer-provider';

function makeTarget(
  rect: { height: number; left: number; top: number; width: number },
  extras: Partial<{ height: number; width: number }> = {},
): PointerTarget & { height?: number; width?: number } {
  const target = new EventTarget() as PointerTarget & {
    height?: number;
    width?: number;
  };
  (target as { getBoundingClientRect: () => typeof rect }).getBoundingClientRect
    = () => rect;
  if (extras.width !== undefined)
    target.width = extras.width;
  if (extras.height !== undefined)
    target.height = extras.height;
  return target;
}

function pointerEvent(
  type: string,
  fields: Partial<{ button: number; clientX: number; clientY: number }> = {},
): Event {
  const e = new Event(type);
  Object.assign(e, { button: 0, clientX: 0, clientY: 0, ...fields });
  return e;
}

describe('pointerProvider', () => {
  it('tracks position in target-local pixels by default', () => {
    const target = makeTarget({ height: 200, left: 50, top: 20, width: 400 });
    const p = new PointerProvider({ target, windowTarget: new EventTarget() });

    target.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 70 }));

    expect(p.state.clientX).toBe(150);
    expect(p.state.clientY).toBe(70);
    expect(p.state.x).toBe(100);
    expect(p.state.y).toBe(50);
  });

  it('scales to canvas-internal pixels when target has numeric width/height', () => {
    const target = makeTarget(
      { height: 300, left: 0, top: 0, width: 600 },
      { height: 600, width: 1200 },
    );
    const p = new PointerProvider({ target, windowTarget: new EventTarget() });

    target.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 150 }));

    expect(p.state.x).toBe(600);
    expect(p.state.y).toBe(300);
  });

  it('falls back to unscaled local coordinates when target rect size is zero', () => {
    const target = makeTarget(
      { height: 0, left: 0, top: 0, width: 0 },
      { height: 600, width: 1200 },
    );
    const p = new PointerProvider({ target, windowTarget: new EventTarget() });

    target.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 25 }));

    expect(p.state.x).toBe(40);
    expect(p.state.y).toBe(25);
  });

  it('honours a custom projector override', () => {
    const target = makeTarget({ height: 100, left: 0, top: 0, width: 100 });
    const p = new PointerProvider({
      target,
      windowTarget: new EventTarget(),
      project: ev => ({ x: ev.clientX * 2, y: ev.clientY * 2 }),
    });

    target.dispatchEvent(pointerEvent('pointermove', { clientX: 10, clientY: 20 }));

    expect(p.state.clientX).toBe(10);
    expect(p.state.clientY).toBe(20);
    expect(p.state.x).toBe(20);
    expect(p.state.y).toBe(40);
  });

  it('seeds state from options.initialPosition before the first move', () => {
    const target = makeTarget({ height: 100, left: 0, top: 0, width: 100 });
    const p = new PointerProvider({
      initialPosition: { x: 42, y: 7 },
      target,
      windowTarget: new EventTarget(),
    });

    expect(p.state.clientX).toBe(0);
    expect(p.state.clientY).toBe(0);
    expect(p.state.x).toBe(42);
    expect(p.state.y).toBe(7);
  });

  it('tracks over flag via pointerenter / pointerleave', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const p = new PointerProvider({ target, windowTarget: new EventTarget() });

    expect(p.state.over).toBe(false);
    target.dispatchEvent(pointerEvent('pointerenter'));
    expect(p.state.over).toBe(true);
    target.dispatchEvent(pointerEvent('pointerleave'));
    expect(p.state.over).toBe(false);
  });

  it('emits Pointer.Left / Middle / Right for the three default buttons', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const win = new EventTarget();
    const p = new PointerProvider({ target, windowTarget: win });
    const received: InputRawEvent[] = [];
    p.subscribe(r => received.push(r));

    target.dispatchEvent(pointerEvent('pointerdown', { button: 0 }));
    win.dispatchEvent(pointerEvent('pointerup', { button: 0 }));
    target.dispatchEvent(pointerEvent('pointerdown', { button: 1 }));
    target.dispatchEvent(pointerEvent('pointerdown', { button: 2 }));

    expect(received).toEqual([
      { code: Pointer.LeftButton, kind: 'down' },
      { code: Pointer.LeftButton, kind: 'up' },
      { code: Pointer.MiddleButton, kind: 'down' },
      { code: Pointer.RightButton, kind: 'down' },
    ]);
  });

  it('ignores buttons not listed in options.buttons', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const p = new PointerProvider({
      buttons: [0],
      target,
      windowTarget: new EventTarget(),
    });
    const received: InputRawEvent[] = [];
    p.subscribe(r => received.push(r));

    target.dispatchEvent(pointerEvent('pointerdown', { button: 2 }));
    target.dispatchEvent(pointerEvent('pointerdown', { button: 0 }));

    expect(received).toEqual([{ code: Pointer.LeftButton, kind: 'down' }]);
  });

  it('catches pointerup fired on the window target (release off-canvas)', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const win = new EventTarget();
    const p = new PointerProvider({ target, windowTarget: win });
    const received: InputRawEvent[] = [];
    p.subscribe(r => received.push(r));

    target.dispatchEvent(pointerEvent('pointerdown', { button: 0 }));
    win.dispatchEvent(pointerEvent('pointerup', { button: 0, clientX: 17, clientY: 8 }));

    expect(received).toEqual([
      { code: Pointer.LeftButton, kind: 'down' },
      { code: Pointer.LeftButton, kind: 'up' },
    ]);
    expect(p.state.clientX).toBe(17);
    expect(p.state.clientY).toBe(8);
    expect(p.state.x).toBe(17);
    expect(p.state.y).toBe(8);
  });

  it('preventDefaults contextmenu when right button is reported', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const p = new PointerProvider({ target, windowTarget: new EventTarget() });
    const ctx = pointerEvent('contextmenu');
    let prevented = false;
    Object.assign(ctx, {
      preventDefault: () => {
        prevented = true;
      },
    });

    target.dispatchEvent(ctx);

    expect(prevented).toBe(true);
    p.dispose();
  });

  it('does not preventDefault contextmenu when preventContextMenu is false', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const p = new PointerProvider({
      preventContextMenu: false,
      target,
      windowTarget: new EventTarget(),
    });
    const ctx = pointerEvent('contextmenu');
    let prevented = false;
    Object.assign(ctx, {
      preventDefault: () => {
        prevented = true;
      },
    });

    target.dispatchEvent(ctx);

    expect(prevented).toBe(false);
    p.dispose();
  });

  it('dispose removes all listeners', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const win = new EventTarget();
    const p = new PointerProvider({ target, windowTarget: win });
    const received: InputRawEvent[] = [];
    p.subscribe(r => received.push(r));

    p.dispose();
    target.dispatchEvent(pointerEvent('pointerdown', { button: 0 }));
    win.dispatchEvent(pointerEvent('pointerup', { button: 0 }));
    target.dispatchEvent(pointerEvent('pointerenter'));

    expect(received).toEqual([]);
  });

  it('dispose is idempotent', () => {
    const target = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const p = new PointerProvider({ target, windowTarget: new EventTarget() });
    p.dispose();
    expect(() => p.dispose()).not.toThrow();
  });

  it('integrates with createInput for mixed keyboard + pointer action maps', () => {
    const kbTarget = new EventTarget();
    const ptrTarget = makeTarget({ height: 10, left: 0, top: 0, width: 10 });
    const keyboard = new KeyboardProvider({ preventDefaultCodes: [], target: kbTarget });
    const pointer = new PointerProvider({
      target: ptrTarget,
      windowTarget: new EventTarget(),
    });
    const input = createInput<'fire'>(
      { fire: [Key.Space, Pointer.LeftButton] },
      [keyboard, pointer],
    );

    const kd = new Event('keydown');
    Object.assign(kd, { code: 'Space', repeat: false });
    kbTarget.dispatchEvent(kd);
    expect(input.isDown('fire')).toBe(true);

    const ku = new Event('keyup');
    Object.assign(ku, { code: 'Space', repeat: false });
    kbTarget.dispatchEvent(ku);
    expect(input.isDown('fire')).toBe(false);

    ptrTarget.dispatchEvent(pointerEvent('pointerdown', { button: 0 }));
    expect(input.isDown('fire')).toBe(true);

    input.dispose();
  });
});
