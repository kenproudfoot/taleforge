import { describe, expect, it } from 'vitest';
import { DC, addBonus, archetypeStatsValid, bumpStat, defenseFor, describeCheck, maxHpFor, resolveAttack, resolveCheck, resolveDamage } from './rules';
import { BRUISER } from './testing';

describe('derived stats', () => {
  it('HP = 10 + CON x 2 + archetype bonus', () => {
    expect(maxHpFor(BRUISER.stats, BRUISER.hpBonus)).toBe(10 + 2 * 2 + 6);
    expect(maxHpFor({ ...BRUISER.stats, CON: -1 }, 0)).toBe(8);
  });
  it('Defense = 10 + DEX + armor', () => {
    expect(defenseFor(BRUISER.stats, 3)).toBe(13);
  });
  it('stat bumps respect the cap', () => {
    expect(bumpStat(BRUISER.stats, 'STR').STR).toBe(4);
    expect(bumpStat(bumpStat(BRUISER.stats, 'STR'), 'STR').STR).toBe(4);
    expect(bumpStat(BRUISER.stats, 'INT').INT).toBe(0);
  });
  it('validates archetype arrays', () => {
    expect(archetypeStatsValid(BRUISER)).toBe(true);
    expect(archetypeStatsValid({ ...BRUISER, stats: { ...BRUISER.stats, STR: 4 } })).toBe(false);
  });
  it('exposes the standard DCs', () => {
    expect(DC).toEqual({ easy: 10, moderate: 13, hard: 16, heroic: 19 });
  });
});

describe('resolveCheck', () => {
  it('adds modifier and proficiency', () => {
    const r = resolveCheck({ dice: [11], mode: 'normal', modifier: 2, proficient: true, dc: 15 });
    expect(r).toMatchObject({ natural: 11, total: 15, success: true, crit: false, complication: false, proficiency: 2 });
  });
  it('fails below the DC', () => {
    expect(resolveCheck({ dice: [10], mode: 'normal', modifier: 2, proficient: false, dc: 13 }).success).toBe(false);
  });
  it('natural 20 always succeeds and natural 1 always fails', () => {
    expect(resolveCheck({ dice: [20], mode: 'normal', modifier: -1, proficient: false, dc: 25 })).toMatchObject({ success: true, crit: true });
    expect(resolveCheck({ dice: [1], mode: 'normal', modifier: 10, proficient: true, dc: 5 })).toMatchObject({ success: false, complication: true });
  });
  it('applies advantage and disadvantage', () => {
    expect(resolveCheck({ dice: [3, 18], mode: 'advantage', modifier: 0, proficient: false, dc: 13 }).natural).toBe(18);
    expect(resolveCheck({ dice: [3, 18], mode: 'disadvantage', modifier: 0, proficient: false, dc: 13 }).natural).toBe(3);
  });
  it('heroic +5 can turn a failure around, but not a natural 1', () => {
    const fail = resolveCheck({ dice: [8], mode: 'normal', modifier: 1, proficient: false, dc: 13 });
    expect(addBonus(fail, 5)).toMatchObject({ total: 14, success: true, bonus: 5 });
    const botch = resolveCheck({ dice: [1], mode: 'normal', modifier: 3, proficient: true, dc: 8 });
    expect(addBonus(botch, 5).success).toBe(false);
  });
  it('attacks compare against Defense', () => {
    expect(resolveAttack({ dice: [12], mode: 'normal', modifier: 3, proficient: true, defense: 17 })).toMatchObject({ dc: 17, success: true });
  });
});

describe('resolveDamage', () => {
  it('adds die, modifier and bonus', () => {
    expect(resolveDamage({ dice: [5], dieSize: 8, modifier: 3, crit: false }).total).toBe(8);
    expect(resolveDamage({ dice: [5], dieSize: 8, modifier: 3, crit: false, bonus: 4 }).total).toBe(12);
  });
  it('a critical adds the die maximum', () => {
    expect(resolveDamage({ dice: [5], dieSize: 8, modifier: 3, crit: true }).total).toBe(16);
  });
  it('always deals at least 1', () => {
    expect(resolveDamage({ dice: [1], dieSize: 4, modifier: -1, crit: false }).total).toBe(1);
  });
});

describe('describeCheck', () => {
  it('shows the maths', () => {
    const r = resolveCheck({ dice: [17], mode: 'normal', modifier: 2, proficient: true, dc: 13 });
    expect(describeCheck(r)).toBe('17 + 2 + 2 prof = 21 vs DC 13');
    const neg = resolveCheck({ dice: [9], mode: 'normal', modifier: -1, proficient: false, dc: 10, bonus: 5 });
    expect(describeCheck(neg, 'Defense')).toBe('9 - 1 + 5 = 13 vs Defense 10');
    const flat = resolveCheck({ dice: [9], mode: 'normal', modifier: 0, proficient: false, dc: 10 });
    expect(describeCheck(flat)).toBe('9 vs DC 10');
  });
});
