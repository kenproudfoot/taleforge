// Pure geometry for the polyhedral dice: vertices, convex-hull faces, and face labelling.
// No three.js or physics imports, so it is unit-testable in isolation.

export type Vec3 = [number, number, number];
export type DieType = 4 | 6 | 8 | 10 | 12 | 20;

export interface Face {
  /** Vertex indices in counter-clockwise order seen from outside. */
  vertices: number[];
  normal: Vec3;
  centroid: Vec3;
}

export interface DieShape {
  type: DieType;
  vertices: Vec3[];
  faces: Face[];
  /** Distance from the centre to a face (the die's inradius). */
  inradius: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const PHI = (1 + Math.sqrt(5)) / 2;

function rawVertices(type: DieType): Vec3[] {
  switch (type) {
    case 4:
      return [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
    case 6:
      return [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    case 8:
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 10: {
      // Pentagonal trapezohedron: two apexes and a zig-zag ring. This height makes every kite face flat.
      const c = Math.cos(Math.PI / 5);
      const h = (1 - c) / (1 + c);
      const ring: Vec3[] = Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5;
        return [Math.cos(a), Math.sin(a), i % 2 ? h : -h];
      });
      return [...ring, [0, 0, 1], [0, 0, -1]];
    }
    case 12: {
      const r = 1 / PHI;
      return [
        [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1], [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
        [0, -r, -PHI], [0, -r, PHI], [0, r, -PHI], [0, r, PHI], [-r, -PHI, 0], [-r, PHI, 0], [r, -PHI, 0], [r, PHI, 0],
        [-PHI, 0, -r], [PHI, 0, -r], [-PHI, 0, r], [PHI, 0, r],
      ];
    }
    case 20:
      return [
        [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
        [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
      ];
  }
}

/** Convex hull faces by brute force (fine for at most 20 vertices): every supporting plane becomes one polygon. */
export function hullFaces(vertices: Vec3[]): Face[] {
  const faces: Face[] = [];
  const eps = 1e-6;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        let normal = cross(sub(vertices[j]!, vertices[i]!), sub(vertices[k]!, vertices[i]!));
        if (length(normal) < eps) continue;
        normal = normalize(normal);
        const offset = dot(normal, vertices[i]!);
        const side = vertices.map((v) => dot(normal, v) - offset);
        const positive = side.some((s) => s > eps);
        const negative = side.some((s) => s < -eps);
        if (positive && negative) continue;
        if (positive) normal = [-normal[0], -normal[1], -normal[2]];
        if (faces.some((f) => dot(f.normal, normal) > 1 - 1e-5)) continue;
        const on = side.flatMap((s, index) => (Math.abs(s) <= eps ? [index] : []));
        const centroid = on.reduce<Vec3>((acc, index) => [acc[0] + vertices[index]![0] / on.length, acc[1] + vertices[index]![1] / on.length, acc[2] + vertices[index]![2] / on.length], [0, 0, 0]);
        // Order the polygon counter-clockwise around the outward normal.
        const u = normalize(sub(vertices[on[0]!]!, centroid));
        const w = cross(normal, u);
        const ordered = [...on].sort((a, b) => {
          const pa = sub(vertices[a]!, centroid);
          const pb = sub(vertices[b]!, centroid);
          return Math.atan2(dot(pa, w), dot(pa, u)) - Math.atan2(dot(pb, w), dot(pb, u));
        });
        faces.push({ vertices: ordered, normal, centroid });
      }
    }
  }
  return faces;
}

const TARGET_RADIUS: Record<DieType, number> = { 4: 1.15, 6: 1.0, 8: 1.05, 10: 1.05, 12: 1.1, 20: 1.15 };
const cache = new Map<DieType, DieShape>();

/** The shape of a die, scaled so that all dice look a similar size on the table. */
export function dieShape(type: DieType): DieShape {
  const hit = cache.get(type);
  if (hit) return hit;
  const raw = rawVertices(type);
  const circumradius = Math.max(...raw.map(length));
  const scale = TARGET_RADIUS[type] / circumradius;
  const vertices = raw.map((v): Vec3 => [v[0] * scale, v[1] * scale, v[2] * scale]);
  const faces = hullFaces(vertices);
  const shape: DieShape = { type, vertices, faces, inradius: Math.min(...faces.map((f) => dot(f.normal, f.centroid))) };
  cache.set(type, shape);
  return shape;
}

/** Rotates a vector by a quaternion (x, y, z, w). */
export function rotate(v: Vec3, q: [number, number, number, number]): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

export interface TopReading {
  /** Index of the result element: the upward face, or for a d4 the top vertex. */
  index: number;
  /** How squarely it points up (1 = perfectly flat on the table). */
  alignment: number;
}

/** Which face of a resting die points up (for a d4: which vertex is on top). Up is +Y. */
export function readTop(shape: DieShape, quaternion: [number, number, number, number]): TopReading {
  let best = { index: 0, alignment: -Infinity };
  if (shape.type === 4) {
    shape.vertices.forEach((v, index) => {
      const alignment = rotate(normalize(v), quaternion)[1];
      if (alignment > best.alignment) best = { index, alignment };
    });
    return best;
  }
  shape.faces.forEach((f, index) => {
    const alignment = rotate(f.normal, quaternion)[1];
    if (alignment > best.alignment) best = { index, alignment };
  });
  return best;
}

/** Number of distinct results on a die (faces, or vertices for a d4). */
export function resultCount(type: DieType): number {
  return type;
}

/**
 * Assigns a value to every face (or d4 vertex) so that the element that will land on top shows `value`.
 * The physics decides the motion; a cryptographic RNG decides the value; this ties the two together.
 * Values run 1..n (a d10 uses 0..9 and passes value 0 for a ten).
 */
export function labelsFor(type: DieType, topIndex: number, value: number): number[] {
  const n = resultCount(type);
  const base = type === 10 ? 0 : 1;
  return Array.from({ length: n }, (_, i) => ((((i - topIndex + (value - base)) % n) + n) % n) + base);
}
