/**
 * Maths for the 2.5D scene pictures (pure, no DOM): the picture is drawn by a shader that shifts every pixel by
 * its depth, so near things slide further than far things as the view tilts.
 */

/** Largest view shift, in texture widths: big enough to read as depth, small enough that edges hold together. */
export const PARALLAX_AMPLITUDE = 0.035;
/** The picture is drawn slightly enlarged, so a shifted view never shows past its border. */
export const PARALLAX_ZOOM = 1.06;
/** The depth (0 far .. 1 near) that stays still: things nearer swing one way, things farther the other. */
export const PARALLAX_FOCUS = 0.5;
/** Seconds for the fade from a flat picture to the moving one. */
export const PARALLAX_EASE_IN = 1.4;

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The slow idle sway, as a fraction of the full amplitude: side to side over 9 s, up and down a little over
 * 13 s, so the path never quite repeats.
 */
export function sway(t: number): Vec2 {
  return { x: Math.sin((2 * Math.PI * t) / 9), y: 0.45 * Math.sin((2 * Math.PI * t) / 13 + 1) };
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** A pointer at (px, py) inside a box of size (w, h) -> a view direction in [-1, 1]². */
export function pointerTilt(px: number, py: number, w: number, h: number): Vec2 {
  return { x: clamp1((px / Math.max(1, w)) * 2 - 1), y: clamp1((py / Math.max(1, h)) * 2 - 1) };
}

/**
 * Device orientation -> a view direction in [-1, 1]². `gamma` is left/right tilt, `beta` front/back; `rest` is
 * the beta the player held the device at when tilting started, so any comfortable angle is the centre.
 */
export function deviceTilt(gamma: number, beta: number, rest: number): Vec2 {
  return { x: clamp1(gamma / 25), y: clamp1((beta - rest) / 25) };
}

/** Moves `current` toward `target` smoothly, independent of frame rate. */
export function follow(current: Vec2, target: Vec2, dt: number, rate = 3): Vec2 {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return { x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k };
}

/** Smoothstep 0..1 over the ease-in: how far the flat picture has turned into the moving one. */
export function easeIn(elapsed: number, duration = PARALLAX_EASE_IN): number {
  const t = Math.max(0, Math.min(1, elapsed / duration));
  return t * t * (3 - 2 * t);
}

/**
 * Texture-space scale that makes a picture of aspect `image` (w/h) cover a canvas of aspect `canvas`, like
 * CSS object-fit: cover. One axis is 1, the other is cropped (< 1).
 */
export function coverScale(canvas: number, image: number): Vec2 {
  if (!(canvas > 0) || !(image > 0)) return { x: 1, y: 1 };
  return image > canvas ? { x: canvas / image, y: 1 } : { x: 1, y: image / canvas };
}

export const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * Each pixel looks up the depth where it will land and shifts by it; a few fixed-point steps settle that
 * circular lookup, which keeps near edges crisp instead of doubled.
 */
export const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uOffset;
uniform vec2 uScale;
uniform float uZoom;
uniform float uFocus;
void main() {
  vec2 base = (vUv - 0.5) * uScale / uZoom + 0.5;
  vec2 uv = base;
  for (int i = 0; i < 6; i++) {
    float d = texture2D(uDepth, clamp(uv, 0.0, 1.0)).r;
    uv = base - uOffset * (d - uFocus);
  }
  gl_FragColor = texture2D(uImage, clamp(uv, 0.0, 1.0));
}`;

/**
 * iOS asks before a page may read the tilt sensors, and only in answer to a tap. Call this from a click
 * handler; elsewhere it does nothing. Resolves true when tilt events will arrive.
 */
export async function requestTiltPermission(): Promise<boolean> {
  const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!DOE) return false;
  if (typeof DOE.requestPermission !== 'function') return true;
  try {
    return (await DOE.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
