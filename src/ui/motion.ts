"use client";

/** Motion helpers that respect prefers-reduced-motion. */
export function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Critically damped-ish spring step for numbers (stiffness 300, damping 30, mass 1).
 * Returns the next value and velocity after dt seconds.
 */
export function springStep(value: number, velocity: number, target: number, dt: number, stiffness = 300, damping = 30): [number, number] {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  let x = value;
  let v = velocity;
  for (let i = 0; i < steps; i++) {
    const a = -stiffness * (x - target) - damping * v;
    v += a * h;
    x += v * h;
  }
  return [x, v];
}
