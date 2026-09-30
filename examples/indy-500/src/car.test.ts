import type { Body } from './car';

import { describe, expect, it } from 'vitest';

import { bounceOffWalls, CAR_RADIUS, collideCars, MAX_REVERSE, MAX_SPEED, stepCar } from './car';
import { pointAt, TRACKS } from './track';

const DT = 1 / 60;
const car = (over: Partial<Body> = {}): Body => ({ heading: 0, speed: 0, x: 0, y: 0, ...over });

describe('drive model', () => {
  it('cannot turn while stationary', () => {
    const b = car();
    for (let i = 0; i < 60; i++)
      stepCar(b, 0, 1, DT);
    expect(b.heading).toBe(0);
  });

  it('accelerates smoothly toward top speed without exceeding it', () => {
    const b = car();
    let prev = 0;
    for (let i = 0; i < 600; i++) {
      stepCar(b, 1, 0, DT);
      expect(b.speed - prev).toBeLessThan(5);
      expect(b.speed).toBeLessThanOrEqual(MAX_SPEED);
      prev = b.speed;
    }
    expect(b.speed).toBeGreaterThan(MAX_SPEED * 0.95);
  });

  it('coasts to a stop when the pedal is released', () => {
    const b = car({ speed: 100 });
    for (let i = 0; i < 300; i++)
      stepCar(b, 0, 0, DT);
    expect(b.speed).toBe(0);
  });

  it('brakes harder than it coasts, then reverses up to a lower limit', () => {
    const b = car({ speed: 100 });
    stepCar(b, -1, 0, DT);
    expect(b.speed).toBeLessThan(100 - 5);
    for (let i = 0; i < 600; i++)
      stepCar(b, -1, 0, DT);
    expect(b.speed).toBeCloseTo(-MAX_REVERSE, 0);
  });

  it('steers the opposite way when reversing', () => {
    const fwd = car({ speed: 100 });
    const rev = car({ speed: -60 });
    stepCar(fwd, 0, 1, DT);
    stepCar(rev, 0, 1, DT);
    expect(fwd.heading).toBeGreaterThan(0);
    expect(rev.heading).toBeLessThan(0);
  });

  it('turns less at low speed than at high speed', () => {
    const slow = car({ speed: 20 });
    const fast = car({ speed: 200 });
    stepCar(slow, 0, 1, DT);
    stepCar(fast, 0, 1, DT);
    expect(slow.heading).toBeLessThan(fast.heading);
  });
});

describe('walls', () => {
  const track = TRACKS[0]!;

  it('leaves a car in the middle of the road alone', () => {
    const p = pointAt(track, 100);
    const b = car({ heading: Math.atan2(p.ty, p.tx), speed: 100, x: p.x, y: p.y });
    expect(bounceOffWalls(b, track)).toBe(0);
    expect(b.speed).toBe(100);
  });

  it('pushes a car back inside and takes speed off a head-on hit', () => {
    const p = pointAt(track, 100);
    // Heading straight out of the corridor, well past the boundary.
    const nx = -p.ty;
    const ny = p.tx;
    const b = car({ heading: Math.atan2(ny, nx), speed: 120, x: p.x + nx * (track.halfWidth + 5), y: p.y + ny * (track.halfWidth + 5) });
    const impact = bounceOffWalls(b, track);
    expect(impact).toBeGreaterThan(100);
    const dist = Math.hypot(b.x - p.x, b.y - p.y);
    expect(dist).toBeLessThanOrEqual(track.halfWidth - CAR_RADIUS + 0.5);
    expect(b.speed).toBeLessThan(0);
    expect(Math.abs(b.speed)).toBeLessThan(120);
  });
});

describe('car collisions', () => {
  it('ignores cars that are apart', () => {
    expect(collideCars(car(), car({ x: 100 }))).toBe(false);
  });

  it('separates overlapping cars', () => {
    const a = car({ x: 0 });
    const b = car({ x: 4 });
    expect(collideCars(a, b)).toBe(true);
    expect(b.x - a.x).toBeCloseTo(2 * CAR_RADIUS);
  });

  it('transfers momentum: a moving car shoves a stationary one', () => {
    const a = car({ speed: 100, x: 0 });
    const b = car({ x: 2 * CAR_RADIUS - 1 });
    collideCars(a, b);
    expect(b.speed).toBeGreaterThan(50);
    expect(a.speed).toBeLessThan(50);
  });
});
