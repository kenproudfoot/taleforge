import { describe, expect, it } from 'vitest';
import { createScriptedRng, createSeededRng } from './rng';
import { cancelPendingRoll, chooseHeroic, heroicOptions, requestRoll, submitDice, summarizeReport } from './rolls';
import { rosterEntryFromTemplate } from './state';
import { CAMPAIGN, testGame } from './testing';
import type { GameState } from './types';

const rng = createSeededRng(1);

function withGoblin(): GameState {
  const g = testGame();
  g.roster.push(rosterEntryFromTemplate(CAMPAIGN.cast[0]!));
  return g;
}

function start(g: GameState, req: Parameters<typeof requestRoll>[1]): GameState {
  const r = requestRoll(g, req, rng);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('checks', () => {
  it('runs a simple successful check', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 13, reason: 'pick the lock' });
    expect(g.pendingRoll).toMatchObject({ rollerId: 'pc-mags', stage: 'main', die: 20, diceCount: 1, dc: 13 });
    const step = submitDice(g, [10], rng);
    expect(step.report?.check).toMatchObject({ natural: 10, total: 15, success: true, proficiency: 2 });
    expect(step.state.pendingRoll).toBeNull();
    expect(step.effects[0]?.type).toBe('roll_report');
  });

  it('defaults the DC to moderate and the stat to WIS', () => {
    const g = start(testGame(), { character: 'Lyra', kind: 'save', reason: 'resist' });
    expect(g.pendingRoll).toMatchObject({ dc: 13, stat: 'WIS' });
  });

  it('records a named target on a check', () => {
    const g = start(withGoblin(), { character: 'Lyra', kind: 'check', stat: 'CHA', target: 'goblin', reason: 'bluff' });
    expect(g.pendingRoll).toMatchObject({ targetId: 'goblin', targetName: 'Goblin Scout' });
    const g2 = start(testGame(), { character: 'Lyra', kind: 'check', stat: 'CHA', target: 'the door', reason: 'bluff' });
    expect(g2.pendingRoll).toMatchObject({ targetId: null, targetName: 'the door' });
    const g3 = start(testGame(), { character: 'Lyra', kind: 'check', stat: 'CHA', target: 'Mags', reason: 'calm' });
    expect(g3.pendingRoll?.targetId).toBe('pc-mags');
  });

  it('advantage needs two dice and keeps the higher', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 16, reason: 'leap', advantage: 'advantage' });
    expect(g.pendingRoll?.diceCount).toBe(2);
    expect(() => submitDice(g, [5], rng)).toThrow(/expected 2 dice/);
    expect(submitDice(g, [5, 14], rng).report?.check.natural).toBe(14);
  });

  it('validates dice faces', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', reason: 'x' });
    expect(() => submitDice(g, [21], rng)).toThrow(/not a valid d20/);
    expect(() => submitDice(testGame(), [10], rng)).toThrow(/no roll is pending/);
  });

  it('rejects impossible requests', () => {
    const g = testGame();
    expect(requestRoll(g, { character: 'Nobody', kind: 'check', reason: 'x' }, rng)).toMatchObject({ ok: false });
    g.party[1]!.status = 'downed';
    const r = requestRoll(g, { character: 'Lyra', kind: 'check', reason: 'x' }, rng);
    expect(r.ok === false && r.error).toMatch(/downed/);
    const pending = start(testGame(), { character: 'Mags', kind: 'check', reason: 'x' });
    const again = requestRoll(pending, { character: 'Lyra', kind: 'check', reason: 'y' }, rng);
    expect(again.ok === false && again.error).toMatch(/already pending/);
    expect(cancelPendingRoll(pending).pendingRoll).toBeNull();
    const none = testGame();
    expect(cancelPendingRoll(none)).toBe(none);
  });
});

describe('Heroic Points', () => {
  it('offers reroll and +5 after a failure, and +5 can save the roll', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 16, reason: 'leap' });
    const failed = submitDice(g, [8], rng); // 8 + 3 + 2 = 13 < 16
    expect(failed.report).toBeNull();
    expect(failed.state.pendingRoll?.stage).toBe('heroic');
    expect(heroicOptions(failed.state)).toEqual(['reroll', 'plus5']);
    expect(() => submitDice(failed.state, [10], rng)).toThrow(/Heroic Point/);
    const saved = chooseHeroic(failed.state, 'plus5');
    expect(saved.report?.check).toMatchObject({ total: 18, success: true });
    expect(saved.report?.heroicSpent).toBe('plus5');
    expect(saved.state.party[2]!.heroicPoints).toBe(0);
  });

  it('does not offer +5 when it would not be enough, or on a natural 1', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 19, reason: 'leap' });
    const failed = submitDice(g, [2], rng);
    expect(heroicOptions(failed.state)).toEqual(['reroll']);
    expect(() => chooseHeroic(failed.state, 'plus5')).toThrow(/not available/);
    const g2 = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 5, reason: 'leap' });
    expect(heroicOptions(submitDice(g2, [1], rng).state)).toEqual(['reroll']);
  });

  it('a reroll replaces the roll and cannot be repeated', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 16, reason: 'leap' });
    const failed = submitDice(g, [3], rng);
    const again = chooseHeroic(failed.state, 'reroll');
    expect(again.state.pendingRoll).toMatchObject({ stage: 'main', heroicSpent: 'reroll', main: null });
    const second = submitDice(again.state, [4], rng);
    expect(second.report?.check.success).toBe(false);
    expect(second.report?.heroicSpent).toBe('reroll');
  });

  it('accepting a failure keeps the point', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 16, reason: 'leap' });
    const done = chooseHeroic(submitDice(g, [3], rng).state, 'accept');
    expect(done.report?.check.success).toBe(false);
    expect(done.state.party[2]!.heroicPoints).toBe(1);
    expect(() => chooseHeroic(done.state, 'accept')).toThrow();
    expect(heroicOptions(done.state)).toEqual([]);
  });

  it('skips the prompt when the roller has no points', () => {
    const base = testGame();
    base.party[2]!.heroicPoints = 0;
    const g = start(base, { character: 'Mags', kind: 'check', stat: 'DEX', dc: 16, reason: 'leap' });
    expect(submitDice(g, [3], rng).report?.check.success).toBe(false);
  });
});

describe('party attacks', () => {
  it('a hit asks for the weapon die, then applies damage', () => {
    const g = start(withGoblin(), { character: 'Brann', kind: 'attack', target: 'Goblin Scout', reason: 'cleave' });
    expect(g.pendingRoll).toMatchObject({ stat: 'STR', dc: 12, targetId: 'goblin' });
    const hit = submitDice(g, [9], rng); // 9 + 3 + 2 = 14 vs 12
    expect(hit.report).toBeNull();
    expect(hit.state.pendingRoll).toMatchObject({ stage: 'damage', die: 10, diceCount: 1 });
    const done = submitDice(hit.state, [4], rng); // 4 + 3
    expect(done.report?.damage).toMatchObject({ total: 7, crit: false });
    expect(done.report?.consequences).toEqual(['Goblin Scout takes 7 damage (0/7 HP)', 'Goblin Scout is defeated']);
    expect(done.state.roster[0]).toMatchObject({ hp: 0, status: 'defeated' });
  });

  it('a critical hit adds the die maximum', () => {
    const g = start(withGoblin(), { character: 'Brann', kind: 'attack', target: 'goblin', reason: 'cleave' });
    const done = submitDice(submitDice(g, [20], rng).state, [2], rng);
    expect(done.report?.damage).toMatchObject({ total: 15, crit: true });
  });

  it('a miss ends the roll with no damage', () => {
    const base = withGoblin();
    base.party[0]!.heroicPoints = 0;
    const g = start(base, { character: 'Brann', kind: 'attack', target: 'goblin', reason: 'cleave' });
    const miss = submitDice(g, [2], rng);
    expect(miss.report).toMatchObject({ damage: null });
    expect(miss.state.roster[0]!.hp).toBe(7);
  });

  it('needs a valid, active target', () => {
    const g = withGoblin();
    expect(requestRoll(g, { character: 'Brann', kind: 'attack', reason: 'x' }, rng)).toMatchObject({ ok: false, error: 'An attack needs a target.' });
    const unknown = requestRoll(g, { character: 'Brann', kind: 'attack', target: 'dragon', reason: 'x' }, rng);
    expect(unknown.ok === false && unknown.error).toMatch(/roster_add/);
    g.roster[0]!.status = 'defeated';
    const dead = requestRoll(g, { character: 'Brann', kind: 'attack', target: 'goblin', reason: 'x' }, rng);
    expect(dead.ok === false && dead.error).toMatch(/already defeated/);
  });

  it('boons apply to the next roll and the next hit', () => {
    const base = withGoblin();
    base.roster[0]!.hp = base.roster[0]!.maxHp = 60;
    base.party[2]!.boons.push(
      { type: 'next_roll', advantage: true, bonus: 2, source: 'Shadow Step' },
      { type: 'damage_bonus', dice: '2d6', source: 'Deadeye' },
    );
    const g = start(base, { character: 'Mags', kind: 'attack', target: 'goblin', reason: 'backstab' });
    expect(g.pendingRoll).toMatchObject({ mode: 'advantage', bonus: 2, diceCount: 2 });
    const hit = submitDice(g, [4, 11], rng);
    expect(hit.state.pendingRoll).toMatchObject({ stage: 'damage', damageBonusDice: '2d6' });
    const done = submitDice(hit.state, [3], createScriptedRng([6, 5]));
    expect(done.report?.damage?.total).toBe(3 + 3 + 11);
    expect(done.report?.notes).toEqual(['Shadow Step', 'Deadeye (+2d6)']);
    expect(done.state.party[2]!.boons).toEqual([]);
  });

  it('a boon and disadvantage cancel out', () => {
    const base = testGame();
    base.party[2]!.boons.push({ type: 'next_roll', advantage: true, bonus: 0, source: 'Shadow Step' });
    const g = start(base, { character: 'Mags', kind: 'check', stat: 'DEX', reason: 'x', advantage: 'disadvantage' });
    expect(g.pendingRoll).toMatchObject({ mode: 'normal', diceCount: 1 });
  });
});

describe('stabilize', () => {
  it('a WIS DC 10 check stabilizes a Downed ally', () => {
    const base = testGame();
    base.party[0]!.status = 'downed';
    base.party[0]!.hp = 0;
    base.party[0]!.downedTurnsLeft = 2;
    const g = start(base, { character: 'Lyra', kind: 'check', purpose: 'stabilize', reason: 'bind the wound' });
    expect(g.pendingRoll).toMatchObject({ stat: 'WIS', dc: 10, targetId: 'pc-brann' });
    const done = submitDice(g, [6], rng);
    expect(done.report?.consequences).toEqual(['Brann Ironfoot is stabilized']);
    expect(done.state.party[0]!.status).toBe('stable');
  });
  it('fails cleanly when nobody is down', () => {
    const r = requestRoll(testGame(), { character: 'Lyra', kind: 'check', purpose: 'stabilize', reason: 'x' }, rng);
    expect(r.ok === false && r.error).toMatch(/no one to stabilize/);
    const r2 = requestRoll(testGame(), { character: 'Lyra', kind: 'check', purpose: 'stabilize', target: 'Mags', reason: 'x' }, rng);
    expect(r2.ok).toBe(false);
  });
});

describe('NPC rolls', () => {
  it('enemy attacks are rolled and applied by the engine', () => {
    const r = requestRoll(withGoblin(), { character: 'goblin', kind: 'attack', target: 'Lyra', reason: 'stab' }, createScriptedRng([15, 4]));
    if (!r.ok || r.deferred) throw new Error('expected an immediate report');
    expect(r.report.check).toMatchObject({ natural: 15, total: 18, dc: 12, success: true });
    expect(r.report.damage?.total).toBe(5);
    expect(r.state.party[1]!.hp).toBe(11);
    expect(r.state.pendingRoll).toBeNull();
    expect(summarizeReport(r.report)).toMatchObject({ roller: 'Goblin Scout', outcome: 'success', damage: 5 });
  });
  it('can pick a named attack, and misses do nothing', () => {
    const r = requestRoll(withGoblin(), { character: 'goblin', kind: 'attack', target: 'Brann', attack: 'sling', reason: 'x' }, createScriptedRng([3]));
    if (!r.ok || r.deferred) throw new Error('expected an immediate report');
    expect(r.report.check).toMatchObject({ modifier: 2, success: false });
    expect(r.state.party[0]!.hp).toBe(22);
    expect(summarizeReport(r.report).outcome).toBe('failure');
  });
  it('crits add the die maximum and can target other NPCs', () => {
    const g = withGoblin();
    g.roster.push(rosterEntryFromTemplate(CAMPAIGN.cast[1]!));
    const r = requestRoll(g, { character: 'goblin', kind: 'attack', target: 'Elder Maren', reason: 'x', advantage: 'advantage' }, createScriptedRng([2, 20, 3]));
    if (!r.ok || r.deferred) throw new Error('expected an immediate report');
    expect(r.report.damage?.total).toBe(3 + 1 + 6);
    expect(r.state.roster[1]).toMatchObject({ hp: 0, status: 'defeated' });
    expect(summarizeReport(r.report).outcome).toBe('critical success');
  });
  it('NPC checks use their stats', () => {
    const r = requestRoll(withGoblin(), { character: 'goblin', kind: 'check', stat: 'DEX', dc: 12, reason: 'sneak' }, createScriptedRng([1]));
    if (!r.ok || r.deferred) throw new Error('expected an immediate report');
    expect(r.report.check).toMatchObject({ modifier: 2, complication: true });
    expect(summarizeReport(r.report).outcome).toBe('failure with a complication');
    const r2 = requestRoll(withGoblin(), { character: 'goblin', kind: 'save', reason: 'hold on' }, createScriptedRng([14]));
    expect(r2.ok && !r2.deferred && r2.report.check.success).toBe(true);
  });
  it('rejects invalid NPC attacks', () => {
    const g = withGoblin();
    expect(requestRoll(g, { character: 'goblin', kind: 'attack', reason: 'x' }, rng).ok).toBe(false);
    expect(requestRoll(g, { character: 'goblin', kind: 'attack', target: 'ghost', reason: 'x' }, rng).ok).toBe(false);
    g.roster.push(rosterEntryFromTemplate(CAMPAIGN.cast[1]!));
    const unarmed = requestRoll(g, { character: 'elder', kind: 'attack', target: 'Lyra', reason: 'x' }, rng);
    expect(unarmed.ok === false && unarmed.error).toMatch(/no attacks/);
    g.roster[0]!.attacks[0]!.damage = 'lots';
    const bad = requestRoll(g, { character: 'goblin', kind: 'attack', target: 'Lyra', reason: 'x' }, createScriptedRng([19]));
    expect(bad.ok === false && bad.error).toMatch(/invalid damage/);
    g.roster[0]!.status = 'fled';
    expect(requestRoll(g, { character: 'goblin-scout', kind: 'check', reason: 'x' }, rng).ok).toBe(false);
  });
});

describe('summarizeReport', () => {
  it('includes heroic spending', () => {
    const g = start(testGame(), { character: 'Mags', kind: 'check', stat: 'DEX', dc: 16, reason: 'leap' });
    const saved = chooseHeroic(submitDice(g, [8], rng).state, 'plus5');
    expect(summarizeReport(saved.report!)).toMatchObject({ heroic_point: 'plus5', outcome: 'success' });
  });
});
