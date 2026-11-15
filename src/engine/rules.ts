import { keptDie } from './dice';
import type { Archetype, CheckResult, DamageResult, RollMode, Stat, StatBlock } from './types';

export const DC = { easy: 10, moderate: 13, hard: 16, heroic: 19 } as const;
export type Difficulty = keyof typeof DC;

export const PROFICIENCY_BONUS = 2;
export const HEROIC_BONUS = 5;
export const STABILIZE_DC = 10;
export const MIN_MODIFIER = -1;
export const MAX_MODIFIER = 3;
/** With the +1 creation bump and the milestone boost a stat can reach this, never more. */
export const STAT_CAP = 4;
export const BASE_HP = 10;
export const BASE_DEFENSE = 10;

export function maxHpFor(stats: StatBlock, hpBonus: number): number {
  return Math.max(1, BASE_HP + stats.CON * 2 + hpBonus);
}

export function defenseFor(stats: StatBlock, defenseBonus: number): number {
  return BASE_DEFENSE + stats.DEX + defenseBonus;
}

/** Applies a +1 to one stat, respecting the cap. Returns a new block. */
export function bumpStat(stats: StatBlock, stat: Stat): StatBlock {
  return { ...stats, [stat]: Math.min(STAT_CAP, stats[stat] + 1) };
}

export function archetypeStatsValid(a: Archetype): boolean {
  return Object.values(a.stats).every((v) => Number.isInteger(v) && v >= MIN_MODIFIER && v <= MAX_MODIFIER);
}

export interface CheckInput {
  dice: number[];
  mode: RollMode;
  modifier: number;
  proficient: boolean;
  dc: number;
  bonus?: number;
}

/**
 * d20 + modifier (+2 if proficient) against a DC.
 * A natural 20 always succeeds (critical); a natural 1 always fails and adds a complication.
 */
export function resolveCheck(input: CheckInput): CheckResult {
  const natural = keptDie(input.dice, input.mode);
  const proficiency = input.proficient ? PROFICIENCY_BONUS : 0;
  const bonus = input.bonus ?? 0;
  const total = natural + input.modifier + proficiency + bonus;
  const crit = natural === 20;
  const complication = natural === 1;
  const success = crit || (!complication && total >= input.dc);
  return {
    dice: [...input.dice],
    natural,
    mode: input.mode,
    modifier: input.modifier,
    proficiency,
    bonus,
    total,
    dc: input.dc,
    success,
    crit,
    complication,
  };
}

/** An attack is a check against the target's Defense. Attack rolls are always proficient for party members. */
export function resolveAttack(input: Omit<CheckInput, 'dc'> & { defense: number }): CheckResult {
  return resolveCheck({ ...input, dc: input.defense });
}

/** Adds a flat bonus (a spent Heroic Point) to a finished check and re-evaluates it. */
export function addBonus(check: CheckResult, extra: number): CheckResult {
  const bonus = check.bonus + extra;
  const total = check.natural + check.modifier + check.proficiency + bonus;
  return { ...check, bonus, total, success: check.crit || (!check.complication && total >= check.dc) };
}

/** Weapon damage: die + modifier (+ bonus dice). A critical hit adds the die's maximum. Minimum 1. */
export function resolveDamage(input: {
  dice: number[];
  dieSize: number;
  modifier: number;
  crit: boolean;
  bonus?: number;
}): DamageResult {
  const bonus = (input.bonus ?? 0) + (input.crit ? input.dieSize : 0);
  const total = Math.max(1, input.dice.reduce((a, b) => a + b, 0) + input.modifier + bonus);
  return { dice: [...input.dice], modifier: input.modifier, bonus, total, crit: input.crit };
}

/** "17 + 2 + 2 prof = 21 vs DC 13" */
export function describeCheck(c: CheckResult, targetLabel = 'DC'): string {
  const parts = [String(c.natural)];
  if (c.modifier !== 0) parts.push(signed(c.modifier));
  if (c.proficiency) parts.push(`+ ${c.proficiency} prof`);
  if (c.bonus) parts.push(signed(c.bonus));
  const sum = parts.length > 1 ? `${parts.join(' ')} = ${c.total}` : String(c.total);
  return `${sum} vs ${targetLabel} ${c.dc}`;
}

function signed(n: number): string {
  return n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`;
}
