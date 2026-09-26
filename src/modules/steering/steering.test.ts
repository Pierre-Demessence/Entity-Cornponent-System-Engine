import type { Vec2 } from '../math';

import { describe, expect, it } from 'vitest';

import {
  alignment,
  arrive,
  cohesion,
  combine,
  evade,
  flee,
  obstacleAvoidance,
  pathFollowing,
  pursue,
  seek,
  separation,
  truncate,
  wallFollowing,
  wander,
} from './steering';

const ZERO: Vec2 = { x: 0, y: 0 };

describe('truncate', () => {
  it('leaves a vector under the cap unchanged', () => {
    expect(truncate({ x: 3, y: 4 }, 10)).toEqual({ x: 3, y: 4 });
  });

  it('clamps magnitude to the cap, preserving direction', () => {
    const v = truncate({ x: 3, y: 4 }, 5); // magnitude 5 already → unchanged
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(5);
    const w = truncate({ x: 6, y: 8 }, 5); // magnitude 10 → halved
    expect(Math.hypot(w.x, w.y)).toBeCloseTo(5);
    expect(w.x).toBeCloseTo(3);
    expect(w.y).toBeCloseTo(4);
  });

  it('returns the zero vector untouched', () => {
    expect(truncate(ZERO, 5)).toEqual(ZERO);
  });
});

describe('seek', () => {
  it('returns desired − velocity toward the target', () => {
    // At rest, from origin toward (10,0) at speed 5 → force = (5,0).
    expect(seek({ x: 0, y: 0 }, { x: 10, y: 0 }, ZERO, 5)).toEqual({ x: 5, y: 0 });
  });

  it('subtracts current velocity (steering, not desired velocity)', () => {
    // Already moving at full speed toward target → near-zero force.
    const f = seek({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, 5);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
  });
});

describe('flee', () => {
  it('steers directly away from the target', () => {
    expect(flee({ x: 0, y: 0 }, { x: 10, y: 0 }, ZERO, 5)).toEqual({ x: -5, y: 0 });
  });
});

describe('arrive', () => {
  it('requests full speed outside the slow radius', () => {
    const f = arrive({ x: 0, y: 0 }, { x: 100, y: 0 }, ZERO, 10, 20);
    expect(f.x).toBeCloseTo(10);
    expect(f.y).toBeCloseTo(0);
  });

  it('scales speed down linearly inside the slow radius', () => {
    // dist 10, slowRadius 20 → half speed.
    const f = arrive({ x: 0, y: 0 }, { x: 10, y: 0 }, ZERO, 10, 20);
    expect(f.x).toBeCloseTo(5);
  });

  it('brakes when exactly on the target', () => {
    const f = arrive({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: -4 }, 10, 20);
    expect(f).toEqual({ x: -3, y: 4 });
  });
});

describe('pursue / evade', () => {
  it('pursue leads a moving target', () => {
    // Target ahead on +x moving +y; predicted future point is up-and-right,
    // so the steering force has a positive y component.
    const f = pursue({ x: 0, y: 0 }, ZERO, { x: 10, y: 0 }, { x: 0, y: 10 }, 10);
    expect(f.y).toBeGreaterThan(0);
  });

  it('evade flees the predicted position', () => {
    const f = evade({ x: 0, y: 0 }, ZERO, { x: 10, y: 0 }, { x: 0, y: 10 }, 10);
    expect(f.x).toBeLessThan(0);
    expect(f.y).toBeLessThan(0);
  });

  it('with maxSpeed 0 there is no speed budget → zero force from rest', () => {
    // leadTime → 0, desired speed 0, and velocity is already zero. Assert
    // zero magnitude (component signs may be −0 after the subtraction).
    const p = pursue(ZERO, ZERO, { x: 10, y: 0 }, { x: 5, y: 5 }, 0);
    const e = evade(ZERO, ZERO, { x: 10, y: 0 }, { x: 5, y: 5 }, 0);
    expect(Math.hypot(p.x, p.y)).toBe(0);
    expect(Math.hypot(e.x, e.y)).toBe(0);
  });
});

describe('wander', () => {
  it('produces a bounded-speed force and mutates the angle', () => {
    const state = { angle: 0 };
    const f = wander({ x: 5, y: 0 }, state, { distance: 20, jitter: 0.5, radius: 10, random: () => 1 }, 5);
    expect(state.angle).toBeCloseTo(0.5); // (1*2-1)*0.5
    expect(Number.isFinite(f.x)).toBe(true);
    expect(Number.isFinite(f.y)).toBe(true);
  });

  it('falls back to +x heading when velocity is zero', () => {
    const state = { angle: 0 };
    const f = wander(ZERO, state, { distance: 20, jitter: 0, radius: 0, random: () => 0.5 }, 5);
    // radius 0 → desired points straight ahead (+x) → force (5,0) minus zero vel.
    expect(f.x).toBeCloseTo(5);
    expect(f.y).toBeCloseTo(0);
  });
});

describe('flocking trio', () => {
  it('separation steers away from crowding neighbours', () => {
    const neighbors = [{ position: { x: 1, y: 0 }, velocity: ZERO }];
    const f = separation({ x: 0, y: 0 }, neighbors, ZERO, 5);
    expect(f.x).toBeLessThan(0); // pushed −x, away from the neighbour at +x
  });

  it('separation weights closer neighbours more strongly (inverse distance)', () => {
    // A near neighbour above (+y) and a far neighbour to the left (−x). Each
    // pushes the agent directly away, and the 1/d² weighting makes the near
    // one dominate the summed direction — so the agent steers down (−y) far
    // more than right (+x). (Magnitude is normalised to maxSpeed by the force
    // model, so distance shows up in *direction*, not a single force's size.)
    const f = separation({ x: 0, y: 0 }, [
      { position: { x: 0, y: 2 }, velocity: ZERO },
      { position: { x: -20, y: 0 }, velocity: ZERO },
    ], ZERO, 5);
    expect(f.y).toBeLessThan(0);
    expect(Math.abs(f.y)).toBeGreaterThan(Math.abs(f.x));
  });

  it('alignment matches the average neighbour heading', () => {
    const neighbors = [
      { position: ZERO, velocity: { x: 10, y: 0 } },
      { position: ZERO, velocity: { x: 0, y: 10 } },
    ];
    const f = alignment(ZERO, neighbors, 5);
    // Average heading is up-right → force has positive x and y.
    expect(f.x).toBeGreaterThan(0);
    expect(f.y).toBeGreaterThan(0);
  });

  it('cohesion steers toward the neighbour centre of mass', () => {
    const neighbors = [
      { position: { x: 10, y: 0 }, velocity: ZERO },
      { position: { x: 10, y: 10 }, velocity: ZERO },
    ];
    const f = cohesion({ x: 0, y: 0 }, neighbors, ZERO, 5);
    expect(f.x).toBeGreaterThan(0);
    expect(f.y).toBeGreaterThan(0);
  });

  it('returns the zero vector when there are no neighbours', () => {
    expect(separation({ x: 0, y: 0 }, [], ZERO, 5)).toEqual(ZERO);
    expect(alignment(ZERO, [], 5)).toEqual(ZERO);
    expect(cohesion({ x: 0, y: 0 }, [], ZERO, 5)).toEqual(ZERO);
  });
});

describe('combine', () => {
  it('sums weighted forces and truncates to maxForce', () => {
    const f = combine([
      { force: { x: 10, y: 0 }, weight: 1 },
      { force: { x: 0, y: 10 }, weight: 1 },
    ], 100);
    expect(f.x).toBeCloseTo(10);
    expect(f.y).toBeCloseTo(10);
  });

  it('caps the blended force at maxForce', () => {
    const f = combine([{ force: { x: 30, y: 40 }, weight: 1 }], 5);
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(5);
  });

  it('applies weights', () => {
    const f = combine([{ force: { x: 10, y: 0 }, weight: 2 }], 100);
    expect(f.x).toBeCloseTo(20);
  });
});

describe('obstacleAvoidance', () => {
  it('returns zero when no obstacle is threatening', () => {
    const obstacles = [{ position: { x: 0, y: 100 }, radius: 5 }];
    expect(obstacleAvoidance({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles, 5, 50)).toEqual(ZERO);
  });

  it('pushes laterally away from a circle dead ahead', () => {
    // Moving +x; obstacle centred slightly above the path so the agent is pushed down.
    const obstacles = [{ position: { x: 20, y: 2 }, radius: 5 }];
    const f = obstacleAvoidance({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles, 5, 50);
    expect(f.y).toBeLessThan(0);
  });

  it('ignores obstacles behind the agent', () => {
    const obstacles = [{ position: { x: -20, y: 0 }, radius: 5 }];
    expect(obstacleAvoidance({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles, 5, 50)).toEqual(ZERO);
  });

  it('ignores obstacles beyond maxSeeAhead', () => {
    const obstacles = [{ position: { x: 100, y: 0 }, radius: 5 }];
    expect(obstacleAvoidance({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles, 5, 50)).toEqual(ZERO);
  });

  it('returns zero when the agent is stationary (no heading)', () => {
    const obstacles = [{ position: { x: 20, y: 0 }, radius: 5 }];
    expect(obstacleAvoidance({ x: 0, y: 0 }, ZERO, obstacles, 5, 50)).toEqual(ZERO);
  });

  it('picks the nearest of two obstacles ahead', () => {
    const near = { position: { x: 10, y: 3 }, radius: 5 };
    const far = { position: { x: 40, y: -3 }, radius: 5 };
    const f = obstacleAvoidance({ x: 0, y: 0 }, { x: 5, y: 0 }, [far, near], 5, 50);
    // Nearer obstacle sits above the path → pushed down.
    expect(f.y).toBeLessThan(0);
  });

  it('dodges laterally (not just brakes) for a head-on obstacle', () => {
    // Obstacle centre exactly on the heading ray → dodge perpendicular.
    const obstacles = [{ position: { x: 20, y: 0 }, radius: 5 }];
    const f = obstacleAvoidance({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles, 5, 50);
    expect(Math.abs(f.y)).toBeGreaterThan(0);
  });
});

describe('wallFollowing', () => {
  const wall = { end: { x: 100, y: 0 }, start: { x: 0, y: 0 } };

  it('returns zero when there are no walls', () => {
    expect(wallFollowing({ x: 0, y: 10 }, { x: 1, y: 0 }, [], { desiredDistance: 10, range: 30 }, 5)).toEqual(ZERO);
  });

  it('returns zero when the nearest wall is out of range', () => {
    const f = wallFollowing({ x: 50, y: 100 }, { x: 1, y: 0 }, [wall], { desiredDistance: 10, range: 30 }, 5);
    expect(f).toEqual(ZERO);
  });

  it('steers away when too close to the wall', () => {
    // Above the wall at distance 4, desired 10 → error negative → push up (+y).
    const f = wallFollowing({ x: 50, y: 4 }, { x: 1, y: 0 }, [wall], { desiredDistance: 10, range: 30 }, 5);
    expect(f.y).toBeGreaterThan(0);
  });

  it('steers toward the wall when too far (but within range)', () => {
    // Above the wall at distance 20, desired 10 → error positive → pull down (−y).
    const f = wallFollowing({ x: 50, y: 20 }, { x: 1, y: 0 }, [wall], { desiredDistance: 10, range: 30 }, 5);
    expect(f.y).toBeLessThan(0);
  });

  it('follows the wall in the direction of travel', () => {
    // At the desired distance, the tangential term dominates and tracks velocity sign.
    const forward = wallFollowing({ x: 50, y: 10 }, { x: 1, y: 0 }, [wall], { desiredDistance: 10, range: 30 }, 5);
    const backward = wallFollowing({ x: 50, y: 10 }, { x: -1, y: 0 }, [wall], { desiredDistance: 10, range: 30 }, 5);
    expect(Math.sign(forward.x)).toBe(1);
    expect(Math.sign(backward.x)).toBe(-1);
  });

  it('returns zero when sitting exactly on the wall', () => {
    const f = wallFollowing({ x: 50, y: 0 }, { x: 1, y: 0 }, [wall], { desiredDistance: 10, range: 30 }, 5);
    expect(f).toEqual(ZERO);
  });

  it('handles a degenerate zero-length wall without NaN', () => {
    const point = { end: { x: 50, y: 0 }, start: { x: 50, y: 0 } };
    const f = wallFollowing({ x: 50, y: 4 }, { x: 1, y: 0 }, [point], { desiredDistance: 10, range: 30 }, 5);
    expect(Number.isFinite(f.x)).toBe(true);
    expect(Number.isFinite(f.y)).toBe(true);
  });
});

describe('pathFollowing', () => {
  const path = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] as Vec2[], radius: 5 };

  it('returns zero for an empty path', () => {
    expect(pathFollowing({ x: 0, y: 0 }, { x: 1, y: 0 }, { points: [], radius: 5 }, 5, 10)).toEqual(ZERO);
  });

  it('seeks the single point of a one-point path', () => {
    const f = pathFollowing({ x: 0, y: 0 }, { x: 0, y: 1 }, { points: [{ x: 10, y: 0 }], radius: 5 }, 5, 10);
    expect(f.x).toBeGreaterThan(0);
  });

  it('returns zero while the predicted point stays within the corridor', () => {
    // Moving along the path on the path line → future point stays on it.
    const f = pathFollowing({ x: 50, y: 0 }, { x: 1, y: 0 }, path, 5, 10);
    expect(f).toEqual(ZERO);
  });

  it('seeks back when the predicted point strays off the corridor', () => {
    // Drifting up and away; future point is well above the path radius → steer down.
    const f = pathFollowing({ x: 50, y: 20 }, { x: 0, y: 1 }, path, 5, 10);
    expect(f.y).toBeLessThan(0);
  });

  it('returns a finite force when the agent is stationary', () => {
    const f = pathFollowing({ x: 50, y: 20 }, ZERO, path, 5, 10);
    expect(Number.isFinite(f.x)).toBe(true);
    expect(Number.isFinite(f.y)).toBe(true);
  });

  it('picks the correct segment of a multi-segment path at a bend', () => {
    // L-shaped path: right along x, then up along y. Agent near the vertical
    // leg but off to its right should be steered back toward that leg (−x).
    const bent = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] as Vec2[], radius: 5 };
    const f = pathFollowing({ x: 120, y: 50 }, { x: 0, y: 1 }, bent, 5, 10);
    expect(f.x).toBeLessThan(0);
  });
});
