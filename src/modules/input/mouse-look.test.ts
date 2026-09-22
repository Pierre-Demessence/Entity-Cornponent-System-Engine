import type { LockSource, MouseLookOptions, MouseLookTarget } from './mouse-look';

import { describe, expect, it, vi } from 'vitest';

import { MouseLookProvider } from './mouse-look';

type TestTarget = MouseLookTarget & { style: { cursor: string } };

interface TestRig {
  lockSource: LockSource;
  target: TestTarget;
  lock: (element: MouseLookTarget | null) => void;
}

/**
 * The DOM's pointer-lock API is absent in jsdom, so the provider takes its lock
 * source as an option and the tests drive it directly.
 */
function makeRig(initiallyLocked = false): TestRig {
  const target = new EventTarget() as TestTarget;
  target.style = { cursor: '' };
  target.requestPointerLock = vi.fn();

  const lockSource = new EventTarget() as LockSource;
  lockSource.pointerLockElement = null;
  lockSource.exitPointerLock = vi.fn();

  const lock = (element: MouseLookTarget | null): void => {
    lockSource.pointerLockElement = element as unknown as Element | null;
    lockSource.dispatchEvent(new Event('pointerlockchange'));
  };

  const rig: TestRig = { lock, lockSource, target };
  if (initiallyLocked)
    lock(target);
  return rig;
}

function motionEvent(movementX: number, movementY: number): Event {
  const e = new Event('pointermove');
  Object.assign(e, { movementX, movementY });
  return e;
}

function makeProvider(rig: TestRig, options: Partial<MouseLookOptions> = {}): MouseLookProvider {
  return new MouseLookProvider({ lockSource: rig.lockSource, target: rig.target, ...options });
}

describe('mouseLookProvider — lock lifecycle', () => {
  it('captures the pointer when asked', () => {
    const rig = makeRig();
    const look = makeProvider(rig);

    look.requestLock();

    expect(rig.target.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('leaves the capture gesture to the consumer', () => {
    const rig = makeRig();
    makeProvider(rig);

    // Binding "click to capture" is app UX — it interacts with firing in doom
    // and must exclude the right click in portal — so the provider claims no
    // gesture of its own. Both event targets are exercised: a gesture-picking
    // provider would realistically listen on the lock source, not just the
    // element it captures.
    for (const source of [rig.target, rig.lockSource]) {
      for (const type of ['pointerdown', 'mousedown', 'click', 'pointerup'])
        source.dispatchEvent(new Event(type));
    }

    expect(rig.target.requestPointerLock).not.toHaveBeenCalled();
  });

  it('is a no-op to request a lock it already holds', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    rig.lock(rig.target);

    look.requestLock();

    expect(rig.target.requestPointerLock).not.toHaveBeenCalled();
  });

  it('tracks the lock flag across lock and unlock', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    expect(look.state.locked).toBe(false);

    rig.lock(rig.target);
    expect(look.state.locked).toBe(true);

    rig.lock(null);
    expect(look.state.locked).toBe(false);
  });

  it('starts locked when the source already holds this target', () => {
    const rig = makeRig(true);

    expect(makeProvider(rig).state.locked).toBe(true);
  });

  it('does not treat another element holding the lock as ours', () => {
    const rig = makeRig();
    const look = makeProvider(rig);

    rig.lock(new EventTarget() as MouseLookTarget);

    expect(look.state.locked).toBe(false);
  });

  it('releases the lock on unlock, and not while unlocked', () => {
    const rig = makeRig();
    const look = makeProvider(rig);

    look.unlock();
    expect(rig.lockSource.exitPointerLock).not.toHaveBeenCalled();

    rig.lock(rig.target);
    look.unlock();
    expect(rig.lockSource.exitPointerLock).toHaveBeenCalledTimes(1);
  });
});

describe('mouseLookProvider — relative motion', () => {
  it('reports sensitivity-scaled deltas while locked', () => {
    const rig = makeRig();
    const look = makeProvider(rig, { sensitivity: 0.0022 });
    const deltas: Array<{ x: number; y: number }> = [];
    look.subscribe(d => deltas.push(d));

    rig.lock(rig.target);
    rig.lockSource.dispatchEvent(motionEvent(100, -50));

    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.x).toBeCloseTo(0.22, 10);
    expect(deltas[0]!.y).toBeCloseTo(-0.11, 10);
  });

  it('uses the default sensitivity when none is given', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    const deltas: number[] = [];
    look.subscribe(d => deltas.push(d.x));

    rig.lock(rig.target);
    rig.lockSource.dispatchEvent(motionEvent(100, 0));

    expect(deltas[0]).toBeCloseTo(0.22, 10);
  });

  it('ignores motion while unlocked', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    const deltas: unknown[] = [];
    look.subscribe(d => deltas.push(d));

    rig.lockSource.dispatchEvent(motionEvent(120, 80));

    expect(deltas).toHaveLength(0);
  });

  it('ignores motion once the lock is released', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    const deltas: unknown[] = [];
    look.subscribe(d => deltas.push(d));

    rig.lock(rig.target);
    rig.lockSource.dispatchEvent(motionEvent(10, 10));
    rig.lock(null);
    rig.lockSource.dispatchEvent(motionEvent(10, 10));

    expect(deltas).toHaveLength(1);
  });

  it('inverts only the vertical axis', () => {
    const rig = makeRig();
    const look = makeProvider(rig, { invertY: true, sensitivity: 1 });
    const deltas: Array<{ x: number; y: number }> = [];
    look.subscribe(d => deltas.push(d));

    rig.lock(rig.target);
    rig.lockSource.dispatchEvent(motionEvent(3, 5));

    expect(deltas[0]).toEqual({ x: 3, y: -5 });
  });

  it('ignores motion while a different element holds the lock', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    const deltas: unknown[] = [];
    look.subscribe(d => deltas.push(d));

    rig.lock(new EventTarget() as MouseLookTarget);
    rig.lockSource.dispatchEvent(motionEvent(30, 30));

    expect(deltas).toHaveLength(0);
  });

  it('stays silent for a zero-movement event', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    const deltas: unknown[] = [];
    look.subscribe(d => deltas.push(d));

    rig.lock(rig.target);
    rig.lockSource.dispatchEvent(motionEvent(0, 0));

    expect(deltas).toHaveLength(0);
  });

  it('treats a missing movement axis as zero rather than NaN', () => {
    const rig = makeRig();
    const look = makeProvider(rig, { sensitivity: 1 });
    const deltas: Array<{ x: number; y: number }> = [];
    look.subscribe(d => deltas.push(d));

    rig.lock(rig.target);
    // Only `movementX` present, as a synthetic event may be.
    const partial = new Event('pointermove');
    Object.assign(partial, { movementX: 3 });
    rig.lockSource.dispatchEvent(partial);

    expect(deltas).toEqual([{ x: 3, y: 0 }]);
  });

  it('stops delivering to an unsubscribed handler', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    const kept: unknown[] = [];
    const dropped: unknown[] = [];
    look.subscribe(d => kept.push(d));
    const unsubscribe = look.subscribe(d => dropped.push(d));

    rig.lock(rig.target);
    rig.lockSource.dispatchEvent(motionEvent(4, 4));
    unsubscribe();
    rig.lockSource.dispatchEvent(motionEvent(4, 4));

    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(1);
  });
});

describe('mouseLookProvider — cursor and teardown', () => {
  it('toggles the cursor on lock change when configured', () => {
    const rig = makeRig();
    makeProvider(rig, { cursor: { locked: 'none', unlocked: 'grab' } });

    expect(rig.target.style.cursor).toBe('grab');

    rig.lock(rig.target);
    expect(rig.target.style.cursor).toBe('none');

    rig.lock(null);
    expect(rig.target.style.cursor).toBe('grab');
  });

  it('leaves the cursor alone when not configured', () => {
    const rig = makeRig();
    rig.target.style.cursor = 'crosshair';
    makeProvider(rig);

    rig.lock(rig.target);

    expect(rig.target.style.cursor).toBe('crosshair');
  });

  it('detaches every listener and releases the lock on dispose', () => {
    const rig = makeRig();
    const look = makeProvider(rig, { cursor: { locked: 'none', unlocked: 'grab' } });
    const deltas: unknown[] = [];
    look.subscribe(d => deltas.push(d));
    rig.lock(rig.target);

    look.dispose();

    expect(rig.lockSource.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(look.state.locked).toBe(false);
    // Restored before the exit, because the lock-change listener is already gone.
    expect(rig.target.style.cursor).toBe('grab');

    rig.lockSource.dispatchEvent(motionEvent(9, 9));
    expect(deltas).toHaveLength(0);

    // The lock-change listener is detached too, so a later lock cannot re-arm it.
    rig.lock(rig.target);
    expect(look.state.locked).toBe(false);
  });

  it('is idempotent to dispose twice', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    rig.lock(rig.target);

    look.dispose();
    look.dispose();

    expect(rig.lockSource.exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it('does not release a lock it never held', () => {
    const rig = makeRig();
    const look = makeProvider(rig);

    look.dispose();

    expect(rig.lockSource.exitPointerLock).not.toHaveBeenCalled();
  });

  it('does not capture after dispose', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    look.dispose();

    look.requestLock();

    expect(rig.target.requestPointerLock).not.toHaveBeenCalled();
  });

  it('ignores unlock after dispose', () => {
    const rig = makeRig();
    const look = makeProvider(rig);
    rig.lock(rig.target);

    look.dispose();
    // The rig never clears `pointerLockElement`, so an unfenced unlock would
    // issue a second exit here.
    look.unlock();

    expect(rig.lockSource.exitPointerLock).toHaveBeenCalledTimes(1);
  });
});

describe('mouseLookProvider — missing browser APIs', () => {
  it('never reports locked without a lock source', () => {
    const rig = makeRig();
    const look = new MouseLookProvider({ lockSource: null, target: rig.target });

    expect(look.state.locked).toBe(false);
    expect(() => look.requestLock()).not.toThrow();
    expect(() => look.unlock()).not.toThrow();
    expect(() => look.dispose()).not.toThrow();
  });

  it('refuses to capture when it cannot observe the lock', () => {
    const rig = makeRig();
    const look = new MouseLookProvider({ lockSource: null, target: rig.target });

    look.requestLock();

    // Capturing blind would strand the pointer with no way to release it.
    expect(rig.target.requestPointerLock).not.toHaveBeenCalled();
  });

  it('tolerates a target with no requestPointerLock', () => {
    const rig = makeRig();
    rig.target.requestPointerLock = undefined;
    const look = makeProvider(rig);

    expect(() => look.requestLock()).not.toThrow();
  });

  it('tolerates a target with no style when a cursor is configured', () => {
    const rig = makeRig();
    const bare = new EventTarget() as MouseLookTarget;
    const look = new MouseLookProvider({
      cursor: { locked: 'none', unlocked: 'grab' },
      lockSource: rig.lockSource,
      target: bare,
    });

    rig.lock(bare);

    expect(look.state.locked).toBe(true);
    expect(() => look.dispose()).not.toThrow();
  });

  it('swallows a rejected lock request', async () => {
    const rig = makeRig();
    rig.target.requestPointerLock = () => Promise.reject(new Error('gesture denied'));
    const look = makeProvider(rig);

    expect(() => look.requestLock()).not.toThrow();
    // Let the rejection settle: an unattached catch surfaces as an unhandled
    // rejection, which vitest fails the run on.
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('survives an engine that throws synchronously', () => {
    const rig = makeRig();
    rig.target.requestPointerLock = () => {
      throw new Error('not allowed');
    };
    const look = makeProvider(rig);

    expect(() => look.requestLock()).not.toThrow();
  });
});
