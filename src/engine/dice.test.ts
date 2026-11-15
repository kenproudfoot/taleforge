import { describe, expect, it } from 'vitest';
import { DIE_SIZES, combineModes, diceNeeded, formatDice, isValidFace, keptDie, parseDice, rollDice } from './dice';
import { CHI_SQUARE_CRITICAL_001, chiSquareUniform, createCryptoRng, createScriptedRng, createSeededRng } from './rng';

describe('parseDice', () => {
  it('parses standard notation', () => {
    expect(parseDice('2d6+1')).toEqual({ count: 2, sides: 6, modifier: 1 });
    expect(parseDice('d20')).toEqual({ count: 1, sides: 20, modifier: 0 });
    expect(parseDice(' 1D8 - 1 ')).toEqual({ count: 1, sides: 8, modifier: -1 });
    expect(parseDice('4')).toEqual({ count: 0, sides: 1, modifier: 4 });
  });
  it('rejects nonsense', () => {
    for (const bad of ['', 'abc', '0d6', '2d1', 'd', '2d6+', '99d6', '1d6+1d4']) expect(parseDice(bad)).toBeNull();
  });
  it('formats back to text', () => {
    expect(formatDice({ count: 2, sides: 6, modifier: 1 })).toBe('2d6+1');
    expect(formatDice({ count: 1, sides: 8, modifier: -1 })).toBe('1d8-1');
    expect(formatDice({ count: 1, sides: 20, modifier: 0 })).toBe('1d20');
    expect(formatDice({ count: 0, sides: 1, modifier: 4 })).toBe('4');
  });
});

describe('rollDice', () => {
  it('sums rolls and modifier', () => {
    expect(rollDice('2d6+1', createScriptedRng([3, 4]))).toEqual({ rolls: [3, 4], modifier: 1, total: 8 });
    expect(rollDice('5', createScriptedRng([])).total).toBe(5);
  });
  it('never goes below zero', () => {
    expect(rollDice('1d4-3', createScriptedRng([1])).total).toBe(0);
  });
  it('throws on invalid notation', () => {
    expect(() => rollDice('nope', createSeededRng(1))).toThrow(/invalid dice notation/);
  });
});

describe('roll modes', () => {
  it('keeps the right die', () => {
    expect(keptDie([4, 17], 'advantage')).toBe(17);
    expect(keptDie([4, 17], 'disadvantage')).toBe(4);
    expect(keptDie([9], 'normal')).toBe(9);
    expect(() => keptDie([], 'normal')).toThrow();
  });
  it('knows how many dice are needed', () => {
    expect(diceNeeded('normal')).toBe(1);
    expect(diceNeeded('advantage')).toBe(2);
    expect(diceNeeded('disadvantage')).toBe(2);
  });
  it('advantage and disadvantage cancel', () => {
    expect(combineModes('advantage', 'disadvantage')).toBe('normal');
    expect(combineModes('normal', 'advantage')).toBe('advantage');
    expect(combineModes('disadvantage', 'normal')).toBe('disadvantage');
    expect(combineModes('advantage', 'advantage')).toBe('advantage');
  });
  it('validates faces', () => {
    expect(isValidFace(20, 20)).toBe(true);
    expect(isValidFace(0, 20)).toBe(false);
    expect(isValidFace(21, 20)).toBe(false);
    expect(isValidFace(2.5, 20)).toBe(false);
  });
});

describe('RNG fairness', () => {
  it('crypto RNG stays in range and is uniform for every die (chi-square, p=0.001)', { timeout: 30_000 }, () => {
    const rng = createCryptoRng();
    for (const sides of DIE_SIZES) {
      const n = sides * 2000;
      const counts = new Array<number>(sides).fill(0);
      for (let i = 0; i < n; i++) {
        const v = rng.int(sides);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(sides);
        counts[v - 1]!++;
      }
      expect(counts.every((c) => c > 0)).toBe(true);
      expect(chiSquareUniform(counts)).toBeLessThan(CHI_SQUARE_CRITICAL_001[sides - 1]!);
    }
  });

  it('seeded RNG is uniform and deterministic', () => {
    const counts = new Array<number>(20).fill(0);
    const rng = createSeededRng(42);
    for (let i = 0; i < 40_000; i++) counts[rng.int(20) - 1]!++;
    expect(chiSquareUniform(counts)).toBeLessThan(CHI_SQUARE_CRITICAL_001[19]!);
    const a = createSeededRng(7);
    const b = createSeededRng(7);
    expect(Array.from({ length: 10 }, () => a.int(20))).toEqual(Array.from({ length: 10 }, () => b.int(20)));
  });

  it('the chi-square test catches a loaded die', () => {
    const counts = new Array<number>(20).fill(1000);
    counts[19] = 1400;
    expect(chiSquareUniform(counts)).toBeGreaterThan(CHI_SQUARE_CRITICAL_001[19]!);
  });

  it('rejection sampling discards values that would bias the result', () => {
    // 0xFFFFFFFF is above the largest multiple of 20 that fits in 32 bits, so it must be re-drawn.
    let calls = 0;
    const rng = createCryptoRng((a) => {
      calls++;
      a.fill(0);
      a[0] = 0xffffffff;
      a[1] = 39;
    });
    expect(rng.int(20)).toBe(20);
    expect(rng.int(20)).toBe(1);
    expect(calls).toBe(1);
  });

  it('rejects invalid die sizes and scripted misuse', () => {
    expect(() => createCryptoRng().int(0)).toThrow();
    expect(() => createSeededRng(1).int(1.5)).toThrow();
    expect(() => createScriptedRng([]).int(6)).toThrow(/exhausted/);
    expect(() => createScriptedRng([7]).int(6)).toThrow(/not on a d6/);
  });
});
