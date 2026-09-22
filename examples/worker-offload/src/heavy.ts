/**
 * Deterministic, CPU-bound busywork — a stand-in for a real heavy job
 * (pathfinding a whole flow-field, procedural generation, image decode).
 * Cost scales linearly with `iterations`, so the harness slider tunes how
 * long the main thread is blocked.
 */
export function heavyJob(iterations: number): number {
  let acc = 0;
  for (let i = 1; i < iterations; i++) {
    acc += Math.sqrt(i) * Math.sin(i * 0.001);
  }
  return acc;
}
