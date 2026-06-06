/**
 * Easing functions — the Robert Penner canon set used by every tween system
 * (Godot `Tween`, Unity DOTween, Pixi / Phaser, GSAP). Each maps normalized
 * time `t ∈ [0, 1]` to an eased progress, which you compose with a value
 * interpolation: `lerp(from, to, easeInOutQuad(t))`.
 *
 * Pure, domain-free, zero-dependency. `back` and `elastic` deliberately
 * overshoot `[0, 1]`; clamp the result if your target can't exceed its bounds.
 */

/** Maps normalized time `t ∈ [0, 1]` to eased progress (may overshoot for back/elastic). */
export type Easing = (t: number) => number;

const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;
const ELASTIC_C4 = (2 * Math.PI) / 3;
const ELASTIC_C5 = (2 * Math.PI) / 4.5;
const BOUNCE_N1 = 7.5625;
const BOUNCE_D1 = 2.75;

/** Identity — constant-speed interpolation. */
export const linear: Easing = t => t;

export const easeInQuad: Easing = t => t * t;
export const easeOutQuad: Easing = t => 1 - (1 - t) * (1 - t);
export const easeInOutQuad: Easing = t =>
  t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;

export const easeInCubic: Easing = t => t * t * t;
export const easeOutCubic: Easing = t => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = t =>
  t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;

export const easeInQuart: Easing = t => t ** 4;
export const easeOutQuart: Easing = t => 1 - (1 - t) ** 4;
export const easeInOutQuart: Easing = t =>
  t < 0.5 ? 8 * t ** 4 : 1 - ((-2 * t + 2) ** 4) / 2;

export const easeInQuint: Easing = t => t ** 5;
export const easeOutQuint: Easing = t => 1 - (1 - t) ** 5;
export const easeInOutQuint: Easing = t =>
  t < 0.5 ? 16 * t ** 5 : 1 - ((-2 * t + 2) ** 5) / 2;

export const easeInSine: Easing = t => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: Easing = t => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: Easing = t => -(Math.cos(Math.PI * t) - 1) / 2;

export const easeInExpo: Easing = t => (t === 0 ? 0 : 2 ** (10 * t - 10));
export const easeOutExpo: Easing = t => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
export const easeInOutExpo: Easing = (t) => {
  if (t === 0)
    return 0;
  if (t === 1)
    return 1;
  return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
};

export const easeInCirc: Easing = t => 1 - Math.sqrt(1 - t ** 2);
export const easeOutCirc: Easing = t => Math.sqrt(1 - (t - 1) ** 2);
export const easeInOutCirc: Easing = t =>
  t < 0.5
    ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
    : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;

export const easeInBack: Easing = t => BACK_C3 * t * t * t - BACK_C1 * t * t;
export const easeOutBack: Easing = t => 1 + BACK_C3 * (t - 1) ** 3 + BACK_C1 * (t - 1) ** 2;
export const easeInOutBack: Easing = t =>
  t < 0.5
    ? ((2 * t) ** 2 * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
    : ((2 * t - 2) ** 2 * ((BACK_C2 + 1) * (t * 2 - 2) + BACK_C2) + 2) / 2;

export const easeInElastic: Easing = (t) => {
  if (t === 0)
    return 0;
  if (t === 1)
    return 1;
  return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ELASTIC_C4);
};
export const easeOutElastic: Easing = (t) => {
  if (t === 0)
    return 0;
  if (t === 1)
    return 1;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1;
};
export const easeInOutElastic: Easing = (t) => {
  if (t === 0)
    return 0;
  if (t === 1)
    return 1;
  return t < 0.5
    ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
    : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1;
};

export const easeOutBounce: Easing = (t) => {
  let x = t;
  if (x < 1 / BOUNCE_D1)
    return BOUNCE_N1 * x * x;
  if (x < 2 / BOUNCE_D1) {
    x -= 1.5 / BOUNCE_D1;
    return BOUNCE_N1 * x * x + 0.75;
  }
  if (x < 2.5 / BOUNCE_D1) {
    x -= 2.25 / BOUNCE_D1;
    return BOUNCE_N1 * x * x + 0.9375;
  }
  x -= 2.625 / BOUNCE_D1;
  return BOUNCE_N1 * x * x + 0.984375;
};
export const easeInBounce: Easing = t => 1 - easeOutBounce(1 - t);
export const easeInOutBounce: Easing = t =>
  t < 0.5
    ? (1 - easeOutBounce(1 - 2 * t)) / 2
    : (1 + easeOutBounce(2 * t - 1)) / 2;
