/**
 * Pure helpers for depth maps (no DOM, no model): shared by the depth worker and the tests.
 * A depth map here is one byte per pixel, 255 = nearest, 0 = farthest.
 */

/** Longest side of a stored depth map. The parallax only needs soft shapes, so this keeps maps small and fast. */
export const DEPTH_MAX_SIDE = 640;

/** Output size for a depth map of an image `width` x `height`: same aspect, longest side at most DEPTH_MAX_SIDE. */
export function depthSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, DEPTH_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** One pass of a separable max (dilate) or mean (blur) filter of the given radius, along x then y. */
function separable(src: Uint8ClampedArray, w: number, h: number, radius: number, op: 'max' | 'mean'): Uint8ClampedArray {
  if (radius <= 0) return src;
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  const pass = (from: Uint8ClampedArray, to: Uint8ClampedArray, len: number, lines: number, at: (line: number, i: number) => number) => {
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < len; i++) {
        let acc = 0;
        let n = 0;
        for (let k = Math.max(0, i - radius); k <= Math.min(len - 1, i + radius); k++) {
          const v = from[at(line, k)]!;
          if (op === 'max') acc = v > acc ? v : acc;
          else acc += v;
          n++;
        }
        to[at(line, i)] = op === 'max' ? acc : Math.round(acc / n);
      }
    }
  };
  pass(src, tmp, w, h, (y, x) => y * w + x);
  pass(tmp, out, h, w, (x, y) => y * w + x);
  return out;
}

/**
 * Prepares a raw depth map for parallax. Dilating first pushes near objects slightly past their edges, so a
 * moving foreground drags its own pixels instead of tearing the background; the blur then removes steps
 * that would show as ripples.
 */
export function softenDepth(data: ArrayLike<number>, width: number, height: number, { dilate = 2, blur = 3 } = {}): Uint8ClampedArray {
  const src = Uint8ClampedArray.from(data);
  return separable(separable(src, width, height, dilate, 'max'), width, height, blur, 'mean');
}

/** Grey depth bytes to RGBA (for an ImageData). */
export function depthToRgba(depth: ArrayLike<number>): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(depth.length * 4);
  for (let i = 0; i < depth.length; i++) {
    const v = depth[i]!;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
