// Scripts compile without the DOM lib; this test alone drives a (jsdom) DOM.
/// <reference lib="dom" />
/**
 * Executes the Manual's walkthroughs — the Introduction's example and the whole
 * tutorial — so an example that type-checks but fails at runtime (a precondition
 * the page skipped, such as `world.move` needing `enableSpatial`) fails
 * `npm test`. `doc-samples.test.ts` proves the same code compiles; this proves
 * it runs.
 *
 * Each walkthrough is written to a gitignored module under the repo and
 * imported, so its `@pierre/ecs` imports resolve the way a consumer's bundler
 * resolves them. The browser surface the tutorial touches — a 2D context and
 * `requestAnimationFrame` — is stubbed, and frames are pumped by hand.
 */
import type { MockInstance } from 'vitest';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isRunnable, pageSamples, ROOT } from './doc-samples';

const OUT_DIR = join(ROOT, 'scripts/.walkthroughs');

async function importWalkthrough(name: string, code: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `${name}.ts`);
  writeFileSync(path, code);
  await import(pathToFileURL(path).href);
}

function runnableCode(docRel: string): string {
  const samples = pageSamples(docRel).filter(s => isRunnable(s.code));
  expect(samples, `${docRel} has a runnable example`).toHaveLength(1);
  return samples[0].code;
}

/** A 2D context that records every method call and accepts every property write. */
function recordingContext(calls: string[]): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) => {
      if (typeof key !== 'string')
        return undefined;
      if (key in target)
        return target[key as keyof CanvasRenderingContext2D];
      return (...args: unknown[]) => {
        calls.push(`${key}(${args.join(',')})`);
      };
    },
    set: (target, key, value) => {
      (target as unknown as Record<PropertyKey, unknown>)[key] = value;
      return true;
    },
  });
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  // A tick source reports a throwing system through `console.error` rather than
  // rethrowing, so an error logged anywhere is a failed walkthrough.
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(() => {
  rmSync(OUT_DIR, { force: true, recursive: true });
});

describe('manual walkthroughs run', () => {
  it('the Introduction example runs and logs the entity', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await importWalkthrough('introduction', runnableCode('website/manual/getting-started/introduction.md'));
    expect(log).toHaveBeenCalled();
  });

  it('the tutorial runs, and the box it draws moves', async () => {
    const calls: string[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(recordingContext(calls) as unknown as ReturnType<HTMLCanvasElement['getContext']>);

    let queued: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queued.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});

    await importWalkthrough('tutorial', runnableCode('website/manual/guides/tutorial.md'));

    const frames: string[] = [];
    for (let frame = 1; frame <= 5; frame++) {
      const due = queued;
      queued = [];
      calls.length = 0;
      for (const cb of due)
        cb(frame * 16);
      frames.push(calls.join(';'));
    }

    expect(frames.at(-1)).toContain('fillRect');
    expect(frames.at(-1)).not.toBe(frames[1]);
  });
});
