import type { Rng } from './rng';
import type { DieSize, RollMode } from './types';

export const DIE_SIZES: DieSize[] = [4, 6, 8, 10, 12, 20, 100];

export interface DiceNotation {
  count: number;
  sides: number;
  modifier: number;
}

const NOTATION = /^\s*(\d{0,2})\s*d\s*(\d{1,3})\s*(?:([+-])\s*(\d{1,3}))?\s*$/i;

/** Parses "2d6+1", "d20", "1d8 - 1". A bare integer ("4") is a flat amount. Returns null if invalid. */
export function parseDice(text: string): DiceNotation | null {
  const flat = /^\s*(\d{1,3})\s*$/.exec(text);
  if (flat) return { count: 0, sides: 1, modifier: Number(flat[1]) };
  const m = NOTATION.exec(text);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const modifier = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
  if (count < 1 || count > 20 || sides < 2) return null;
  return { count, sides, modifier };
}

export function formatDice(n: DiceNotation): string {
  if (n.count === 0) return String(n.modifier);
  const mod = n.modifier === 0 ? '' : n.modifier > 0 ? `+${n.modifier}` : String(n.modifier);
  return `${n.count}d${n.sides}${mod}`;
}

export interface DiceRoll {
  rolls: number[];
  modifier: number;
  total: number;
}

/** Rolls a notation. Totals never drop below zero. */
export function rollDice(notation: DiceNotation | string, rng: Rng): DiceRoll {
  const n = typeof notation === 'string' ? parseDice(notation) : notation;
  if (!n) throw new Error(`invalid dice notation: ${String(notation)}`);
  const rolls = Array.from({ length: n.count }, () => rng.int(n.sides));
  const total = Math.max(0, rolls.reduce((a, b) => a + b, 0) + n.modifier);
  return { rolls, modifier: n.modifier, total };
}

/** How many d20s a roll mode needs. */
export function diceNeeded(mode: RollMode): number {
  return mode === 'normal' ? 1 : 2;
}

/** Picks the die that counts from the dice rolled under a roll mode. */
export function keptDie(dice: number[], mode: RollMode): number {
  if (dice.length === 0) throw new Error('no dice rolled');
  if (mode === 'advantage') return Math.max(...dice);
  if (mode === 'disadvantage') return Math.min(...dice);
  return dice[0]!;
}

/** Advantage and disadvantage cancel out. */
export function combineModes(a: RollMode, b: RollMode): RollMode {
  if (a === b) return a;
  if (a === 'normal') return b;
  if (b === 'normal') return a;
  return 'normal';
}

export function isValidFace(value: number, sides: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= sides;
}
