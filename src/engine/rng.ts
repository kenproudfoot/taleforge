/** A source of fair integer rolls. `int(n)` returns a uniform integer in 1..n. */
export interface Rng {
  int(sides: number): number;
}

type RandomFill = (array: Uint32Array<ArrayBuffer>) => unknown;

/**
 * Cryptographically strong RNG. Uses rejection sampling so every face is exactly equally likely
 * (a plain modulo would slightly favour low faces).
 */
export function createCryptoRng(fill: RandomFill = (a) => globalThis.crypto.getRandomValues(a)): Rng {
  // Random words are fetched in batches: one getRandomValues call per roll is needlessly slow.
  const buf = new Uint32Array(new ArrayBuffer(4 * 256));
  let next = buf.length;
  const word = () => {
    if (next >= buf.length) {
      fill(buf);
      next = 0;
    }
    return buf[next++]!;
  };
  return {
    int(sides: number): number {
      assertSides(sides);
      const limit = Math.floor(0x1_0000_0000 / sides) * sides;
      for (;;) {
        const value = word();
        if (value < limit) return (value % sides) + 1;
      }
    },
  };
}

/** Deterministic RNG (mulberry32) for tests and reproducible simulations. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int(sides: number): number {
      assertSides(sides);
      return Math.floor(next() * sides) + 1;
    },
  };
}

/** RNG that replays a fixed list of results; throws when exhausted. For scripted tests. */
export function createScriptedRng(values: number[]): Rng {
  const queue = [...values];
  return {
    int(sides: number): number {
      assertSides(sides);
      const v = queue.shift();
      if (v === undefined) throw new Error('scripted RNG exhausted');
      if (v < 1 || v > sides) throw new Error(`scripted value ${v} is not on a d${sides}`);
      return v;
    },
  };
}

function assertSides(sides: number): void {
  if (!Number.isInteger(sides) || sides < 1) throw new Error(`invalid die size: ${sides}`);
}

/** Pearson chi-square statistic for observed face counts against a uniform expectation. */
export function chiSquareUniform(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
}

/**
 * Chi-square critical values at p = 0.001 by degrees of freedom (faces - 1).
 * A fair die exceeds these only one time in a thousand.
 */
export const CHI_SQUARE_CRITICAL_001: Record<number, number> = {
  3: 16.266,
  5: 20.515,
  7: 24.322,
  9: 27.877,
  11: 31.264,
  19: 43.82,
  99: 148.23,
};
