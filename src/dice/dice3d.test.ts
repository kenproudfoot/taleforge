import { describe, expect, it } from 'vitest';
import { CHI_SQUARE_CRITICAL_001, chiSquareUniform, createCryptoRng, createScriptedRng, createSeededRng } from '@/engine/rng';
import { dieShape, dot, hullFaces, labelsFor, readTop, rotate } from './geometry';
import type { DieType } from './geometry';
import { faceText, planRoll } from './plan';
import { quickRoll } from './roll';
import { simulateThrow, simulateUntilFlat } from './sim';

const TYPES: DieType[] = [4, 6, 8, 10, 12, 20];

function seeded(seed: number): () => number {
  const rng = createSeededRng(seed);
  return () => (rng.int(1_000_000) - 1) / 1_000_000;
}

describe('dice geometry', () => {
  it('each die has the right number of faces and vertices per face', () => {
    const expected: Record<DieType, [number, number]> = { 4: [4, 3], 6: [6, 4], 8: [8, 3], 10: [10, 4], 12: [12, 5], 20: [20, 3] };
    for (const type of TYPES) {
      const shape = dieShape(type);
      expect(shape.faces).toHaveLength(expected[type][0]);
      for (const face of shape.faces) expect(face.vertices).toHaveLength(expected[type][1]);
      expect(dieShape(type)).toBe(shape);
    }
  });
  it('faces are flat, point outward and wind counter-clockwise', () => {
    for (const type of TYPES) {
      const shape = dieShape(type);
      for (const face of shape.faces) {
        const offset = dot(face.normal, face.centroid);
        expect(offset).toBeGreaterThan(0.3);
        for (const index of face.vertices) expect(dot(face.normal, shape.vertices[index]!)).toBeCloseTo(offset, 5);
        const [a, b, c] = face.vertices.map((i) => shape.vertices[i]!) as unknown as [number[], number[], number[]];
        const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
        const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
        const n: [number, number, number] = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
        expect(dot(n, face.normal)).toBeGreaterThan(0);
      }
      expect(shape.inradius).toBeGreaterThan(0.3);
    }
  });
  it('ignores degenerate triples in the hull', () => {
    expect(hullFaces([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [0, 0, 1]])).toHaveLength(4);
  });
  it('reads the top face of a resting die and the top vertex of a d4', () => {
    const cube = dieShape(6);
    const identity: [number, number, number, number] = [0, 0, 0, 1];
    const top = readTop(cube, identity);
    expect(cube.faces[top.index]!.normal[1]).toBeCloseTo(1);
    expect(top.alignment).toBeCloseTo(1);
    // A quarter turn about X brings the +Z face to the top... or its opposite, depending on handedness.
    const s = Math.SQRT1_2;
    const turned = readTop(cube, [s, 0, 0, s]);
    expect(Math.abs(cube.faces[turned.index]!.normal[2])).toBeCloseTo(1);
    expect(rotate([0, 0, 1], [s, 0, 0, s])[1]).toBeCloseTo(-1);
    const d4 = dieShape(4);
    const reading = readTop(d4, identity);
    expect(d4.vertices[reading.index]![1]).toBe(Math.max(...d4.vertices.map((v) => v[1])));
  });
  it('labels faces so the landing face shows the chosen value, using every value exactly once', () => {
    for (const type of TYPES) {
      const base = type === 10 ? 0 : 1;
      for (let top = 0; top < type; top++) {
        for (let value = base; value < base + type; value++) {
          const labels = labelsFor(type, top, value);
          expect(labels[top]).toBe(value);
          expect([...labels].sort((a, b) => a - b)).toEqual(Array.from({ length: type }, (_, i) => i + base));
        }
      }
    }
  });
});

describe('roll planning', () => {
  it('takes every value from the RNG and maps it onto dice', () => {
    expect(planRoll(20, 2, createScriptedRng([17, 3]))).toEqual({
      values: [17, 3],
      dice: [
        { type: 20, face: 17, style: 'normal' },
        { type: 20, face: 3, style: 'normal' },
      ],
    });
    expect(planRoll(10, 1, createScriptedRng([10])).dice).toEqual([{ type: 10, face: 0, style: 'normal' }]);
    expect(planRoll(100, 1, createScriptedRng([47])).dice).toEqual([
      { type: 10, face: 4, style: 'tens' },
      { type: 10, face: 7, style: 'normal' },
    ]);
    expect(planRoll(100, 1, createScriptedRng([100])).dice.map((d) => d.face)).toEqual([0, 0]);
    expect(planRoll(100, 1, createScriptedRng([5])).dice.map((d) => d.face)).toEqual([0, 5]);
  });
  it('digital results are uniform for every die (chi-square, p=0.001)', () => {
    const rng = createCryptoRng();
    for (const die of [4, 6, 8, 10, 12, 20, 100]) {
      const counts = new Array<number>(die).fill(0);
      for (let i = 0; i < die * 1000; i++) counts[planRoll(die, 1, rng).values[0]! - 1]!++;
      expect(chiSquareUniform(counts)).toBeLessThan(CHI_SQUARE_CRITICAL_001[die - 1]!);
    }
  });
  it('writes face text, marking sixes and nines and the tens die', () => {
    expect(faceText({ type: 20, face: 1, style: 'normal' }, 6)).toBe('6.');
    expect(faceText({ type: 20, face: 1, style: 'normal' }, 19)).toBe('19');
    expect(faceText({ type: 6, face: 1, style: 'normal' }, 6)).toBe('6');
    expect(faceText({ type: 10, face: 1, style: 'normal' }, 9)).toBe('9.');
    expect(faceText({ type: 10, face: 1, style: 'tens' }, 0)).toBe('00');
    expect(faceText({ type: 10, face: 1, style: 'tens' }, 7)).toBe('70');
  });
  it('quickRoll returns valid faces', async () => {
    const values = await quickRoll(20, 2);
    expect(values).toHaveLength(2);
    for (const v of values) expect(v >= 1 && v <= 20).toBe(true);
  });
});

describe('physics simulation', () => {
  it('every die type tumbles, stays in the tray and comes to rest flat', () => {
    for (const type of TYPES) {
      const sim = simulateUntilFlat([type], { strength: 1, direction: 0 }, seeded(type * 7 + 1));
      expect(sim.settled).toBe(true);
      expect(sim.frames.length).toBeGreaterThan(40);
      expect(sim.top[0]).toBeGreaterThanOrEqual(0);
      expect(sim.top[0]).toBeLessThan(type);
      const last = sim.frames.at(-1)![0]!;
      expect(Math.abs(last.p[0])).toBeLessThan(5.3);
      expect(Math.abs(last.p[2])).toBeLessThan(3.5);
      expect(last.p[1]).toBeGreaterThan(0.2);
      expect(last.p[1]).toBeLessThan(1.3);
      expect(readTop(dieShape(type), last.q).alignment).toBeGreaterThan(0.985);
      expect(sim.impacts.length).toBeGreaterThan(0);
    }
  });
  it('is reproducible from its random stream and varies with it', () => {
    const a = simulateThrow([20, 20], { strength: 1.2, direction: 0.2 }, seeded(42));
    const b = simulateThrow([20, 20], { strength: 1.2, direction: 0.2 }, seeded(42));
    const c = simulateThrow([20, 20], { strength: 1.2, direction: 0.2 }, seeded(43));
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
    expect(a.frames.at(-1)).not.toEqual(c.frames.at(-1));
    expect(a.frames[0]).toHaveLength(2);
  });
  it('the landing face plus the label mapping always shows the planned value', () => {
    const rng = createSeededRng(9);
    for (let i = 0; i < 12; i++) {
      const plan = planRoll(20, 1, rng);
      const sim = simulateUntilFlat([20], { strength: 0.6 + (i % 5) * 0.2, direction: (i % 3) * 0.3 - 0.3 }, seeded(100 + i));
      const labels = labelsFor(20, sim.top[0]!, plan.dice[0]!.face);
      const reading = readTop(dieShape(20), sim.frames.at(-1)![0]!.q);
      expect(labels[reading.index]).toBe(plan.values[0]);
    }
  });
});
