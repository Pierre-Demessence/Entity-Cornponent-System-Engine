import type { GoapAction } from './goap';

import { describe, expect, it } from 'vitest';

import { plan } from './goap';

/** The canonical woodcutter action set. */
const ACTIONS: GoapAction[] = [
  { name: 'GetAxe', cost: 1, effects: { hasAxe: true }, preconditions: { hasAxe: false } },
  { name: 'GoToTree', cost: 1, effects: { atStore: false, atTree: true }, preconditions: {} },
  { name: 'ChopWood', cost: 1, effects: { hasWood: true }, preconditions: { atTree: true, hasAxe: true, hasWood: false } },
  { name: 'GoToStore', cost: 1, effects: { atStore: true, atTree: false }, preconditions: {} },
  { name: 'DropWood', cost: 1, effects: { delivered: true, hasWood: false }, preconditions: { atStore: true, hasWood: true } },
];

const GOAL = { delivered: true };

function names(p: GoapAction[] | null): string[] | null {
  return p && p.map(a => a.name);
}

describe('plan', () => {
  it('finds the full plan from an empty state', () => {
    expect(names(plan(ACTIONS, {}, GOAL))).toEqual([
      'GetAxe',
      'GoToTree',
      'ChopWood',
      'GoToStore',
      'DropWood',
    ]);
  });

  it('adapts to the world: drops GetAxe when the axe is already held', () => {
    const p = names(plan(ACTIONS, { atStore: true, hasAxe: true }, GOAL));
    expect(p).toEqual(['GoToTree', 'ChopWood', 'GoToStore', 'DropWood']);
    expect(p).not.toContain('GetAxe');
  });

  it('returns an empty plan when the goal already holds', () => {
    expect(plan(ACTIONS, { delivered: true }, GOAL)).toEqual([]);
  });

  it('returns null when the goal is unreachable', () => {
    // Remove DropWood → nothing can set `delivered`.
    const noDrop = ACTIONS.filter(a => a.name !== 'DropWood');
    expect(plan(noDrop, {}, GOAL)).toBeNull();
  });

  it('prefers the cheaper of two routes to the same goal', () => {
    const actions: GoapAction[] = [
      { name: 'Cheap', cost: 1, effects: { done: true }, preconditions: {} },
      { name: 'Pricey', cost: 5, effects: { done: true }, preconditions: {} },
    ];
    expect(names(plan(actions, {}, { done: true }))).toEqual(['Cheap']);
  });

  it('chooses a lower-cost multi-step route over a higher-cost shortcut', () => {
    const actions: GoapAction[] = [
      { name: 'Direct', cost: 10, effects: { goal: true }, preconditions: {} },
      { name: 'StepA', cost: 1, effects: { a: true }, preconditions: {} },
      { name: 'StepB', cost: 1, effects: { goal: true }, preconditions: { a: true } },
    ];
    expect(names(plan(actions, {}, { goal: true }))).toEqual(['StepA', 'StepB']);
  });

  it('treats false and absent facts as equivalent', () => {
    // Precondition hasAxe:false is met by both {} and { hasAxe: false }.
    const p1 = names(plan(ACTIONS, {}, GOAL));
    const p2 = names(plan(ACTIONS, { hasAxe: false }, GOAL));
    expect(p1).toEqual(p2);
  });

  it('does not loop on no-op actions', () => {
    // An action whose effect is already satisfied must not cycle forever.
    const actions: GoapAction[] = [
      { name: 'NoOp', cost: 1, effects: { x: false }, preconditions: {} },
      { name: 'Do', cost: 1, effects: { goal: true }, preconditions: {} },
    ];
    expect(names(plan(actions, {}, { goal: true }))).toEqual(['Do']);
  });

  it('keeps the true side of a mixed true/false effect', () => {
    // The truthy-key hash must not drop `done:true` just because the same
    // action also sets `temp:false`.
    const actions: GoapAction[] = [
      { name: 'Mixed', cost: 1, effects: { done: true, temp: false }, preconditions: {} },
    ];
    expect(names(plan(actions, { temp: true }, { done: true }))).toEqual(['Mixed']);
  });
});
