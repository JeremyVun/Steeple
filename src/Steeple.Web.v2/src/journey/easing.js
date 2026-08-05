// Motion curves for the journey. Nothing here allocates.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeInOutQuint = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * The signature flight curve: a strong ease-in-out that arrives with a small
 * forward overshoot and settles. Exactly 0 at t=0 and 1 at t=1.
 */
export function flightEase(t) {
  const base = easeInOutQuint(t);
  const window = smoothstep(0.5, 0.78, t) * smoothstep(1.0, 0.86, t);
  return base - 0.052 * Math.sin(Math.PI * 2 * t) * window;
}

/** A flight that was interrupted mid-air keeps its momentum instead of stalling. */
export function retargetEase(t) {
  return easeOutQuint(t);
}

/** Frame-rate independent exponential approach. */
export const approach = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));
