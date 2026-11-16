import type { ThrowParams } from './sim';

/** One pointer position while the dice are held (screen pixels, milliseconds). */
export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

/** Only the last moments before release count: a slow carry followed by a quick flick is a hard throw. */
export const FLICK_WINDOW_MS = 90;
/** Every throw is at least this hard, so dice never just dribble out of the hand. */
export const MIN_STRENGTH = 1;
export const MAX_STRENGTH = 1.6;
/** Pointer speed (px/ms) that gives the hardest throw. */
const FULL_SPEED = 2.4;
const MAX_ANGLE = 0.8;

/**
 * Turns the end of a drag into a throw. Speed comes from the pointer's motion over the last FLICK_WINDOW_MS
 * (not the whole drag), and the direction follows the flick: up the screen is away from the player. A drag
 * that ends without moving (or moves toward the player) still throws firmly, straight across the tray.
 */
export function throwFromGesture(samples: PointerSample[], random: () => number): ThrowParams {
  const last = samples[samples.length - 1];
  if (!last) return buttonThrow(random);
  const recent = samples.filter((s) => last.t - s.t <= FLICK_WINDOW_MS);
  const first = recent[0] ?? last;
  const dt = Math.max(16, last.t - first.t);
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  const strength = MIN_STRENGTH + (MAX_STRENGTH - MIN_STRENGTH) * Math.min(1, speed / FULL_SPEED);
  // Only a flick with some upward motion sets the direction; otherwise throw across with a little wobble.
  const direction = vy < -0.05 ? clamp(Math.atan2(vx, -vy), -MAX_ANGLE, MAX_ANGLE) : (random() - 0.5) * 0.5;
  return { strength, direction };
}

/** The Throw button and the Space key: a firm throw with a little variety. */
export function buttonThrow(random: () => number): ThrowParams {
  return { strength: 1.15 + random() * 0.3, direction: (random() - 0.5) * 0.5 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
