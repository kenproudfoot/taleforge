import { describe, expect, it } from 'vitest';
import { damageParty, damageRoster, healParty, healRoster, recoverForNewAct, stabilize } from './health';
import { parseState, serializeState } from './schema';
import {
  applyMilestoneBoost,
  createGame,
  findCombatant,
  findPartyMember,
  findRosterEntry,
  goalProgress,
  locationName,
  milestoneBoostAvailable,
  rosterEntryFromTemplate,
  slugify,
  tick,
  totalBeats,
} from './state';
import { BRUISER, CAMPAIGN, member, testGame } from './testing';

describe('createGame', () => {
  it('builds party members from archetype + bump', () => {
    const g = testGame();
    const brann = g.party[0]!;
    expect(brann).toMatchObject({ maxHp: 22, hp: 22, defense: 13, heroicPoints: 1, status: 'ok' });
    expect(brann.stats.CON).toBe(3);
    expect(brann.resources).toEqual({ nerve: 3 });
    expect(g.partyResources).toEqual({ torchlight: 6 });
    expect(g.locationId).toBe('village');
    expect(g.musicMood).toBe('calm');
    expect(g.spotlight).toEqual({ 'pc-brann': 0, 'pc-lyra': 0, 'pc-mags': 0 });
  });
  it('puts the signature item first in the gear list', () => {
    const g = createGame(CAMPAIGN, [member(BRUISER, 'a', 'A')]);
    expect(g.party[0]!.gear).toEqual(['Longsword', 'Shield']);
  });
  it('rejects empty parties and duplicate ids', () => {
    expect(() => createGame(CAMPAIGN, [])).toThrow();
    expect(() => createGame(CAMPAIGN, [member(BRUISER, 'a', 'A'), member(BRUISER, 'a', 'B')])).toThrow(/unique/);
  });
  it('handles a campaign with no locations', () => {
    const g = createGame({ ...CAMPAIGN, locations: [] }, [member(BRUISER, 'a', 'A')]);
    expect(g.locationId).toBeNull();
    expect(locationName(g, CAMPAIGN)).toBe('Unknown');
  });
});

describe('lookups', () => {
  it('finds party members by id, name and first name', () => {
    const g = testGame();
    expect(findPartyMember(g, 'pc-brann')?.name).toBe('Brann Ironfoot');
    expect(findPartyMember(g, 'brann ironfoot')?.id).toBe('pc-brann');
    expect(findPartyMember(g, 'BRANN')?.id).toBe('pc-brann');
    expect(findPartyMember(g, 'Ironfoot')?.id).toBe('pc-brann');
    expect(findPartyMember(g, 'nobody')).toBeUndefined();
    expect(findPartyMember(g, '  ')).toBeUndefined();
  });
  it('finds roster entries, preferring those present', () => {
    const g = testGame();
    const gone = { ...rosterEntryFromTemplate(CAMPAIGN.cast[0]!), id: 'goblin-old', present: false };
    g.roster.push(gone, rosterEntryFromTemplate(CAMPAIGN.cast[0]!));
    expect(findRosterEntry(g, 'Goblin Scout')?.id).toBe('goblin');
    expect(findRosterEntry(g, 'goblin-old')?.id).toBe('goblin-old');
    expect(findCombatant(g, 'goblin')?.kind).toBe('roster');
    expect(findCombatant(g, 'Lyra')?.kind).toBe('party');
    expect(findCombatant(g, 'ghost')).toBeUndefined();
  });
  it('names locations, including improvised ones', () => {
    const g = testGame();
    expect(locationName(g, CAMPAIGN)).toBe('Mossford Village');
    g.improvisedLocations.push({ id: 'attic', name: 'Dusty Attic', description: '' });
    g.locationId = 'attic';
    expect(locationName(g, CAMPAIGN)).toBe('Dusty Attic');
    g.locationId = 'mystery';
    expect(locationName(g, CAMPAIGN)).toBe('mystery');
  });
  it('slugifies', () => {
    expect(slugify('The Drowned King!')).toBe('the-drowned-king');
    expect(slugify('!!!')).toBe('entry');
  });
});

describe('progress', () => {
  it('counts beats and milestones, capped until the end', () => {
    const g = testGame();
    expect(totalBeats(CAMPAIGN)).toBe(5);
    expect(goalProgress(g, CAMPAIGN)).toBe(0);
    g.milestonesDone = 2;
    expect(goalProgress(g, CAMPAIGN)).toBe(0.5);
    g.beatsCompleted = ['arrive', 'ambush', 'descend', 'riddle', 'unknown-beat'];
    expect(goalProgress(g, CAMPAIGN)).toBeCloseTo(0.76);
    g.milestonesDone = 4;
    expect(goalProgress(g, CAMPAIGN)).toBe(0.97);
    g.ended = { outcome: 'victory', ending: null, epilogueHint: '' };
    expect(goalProgress(g, CAMPAIGN)).toBe(1);
    g.ended = { outcome: 'defeat', ending: null, epilogueHint: '' };
    g.milestonesDone = 1;
    expect(goalProgress(g, CAMPAIGN)).toBeCloseTo(0.76);
  });
});

describe('milestone boost', () => {
  it('unlocks at the midpoint act, once per member', () => {
    let g = testGame();
    expect(milestoneBoostAvailable(g, CAMPAIGN, 'pc-lyra')).toBe(false);
    expect(() => applyMilestoneBoost(g, CAMPAIGN, 'pc-lyra', 'WIS')).toThrow();
    g.actIndex = 1;
    expect(milestoneBoostAvailable(g, CAMPAIGN, 'pc-lyra')).toBe(true);
    expect(milestoneBoostAvailable(g, CAMPAIGN, 'ghost')).toBe(false);
    g = applyMilestoneBoost(g, CAMPAIGN, 'pc-lyra', 'CON');
    expect(g.party[1]).toMatchObject({ maxHp: 18, hp: 18, milestoneBoostTaken: true });
    expect(milestoneBoostAvailable(g, CAMPAIGN, 'pc-lyra')).toBe(false);
    g = applyMilestoneBoost(g, CAMPAIGN, 'pc-mags', 'DEX');
    expect(g.party[2]).toMatchObject({ defense: 15 });
    g = applyMilestoneBoost(g, CAMPAIGN, 'pc-brann', 'CHA');
    expect(g.party[0]!.stats.CHA).toBe(2);
  });
});

describe('tick', () => {
  it('adds play time, but not after the end', () => {
    let g = tick(testGame(), 1500);
    expect(g.elapsedMs).toBe(1500);
    expect(tick(g, 0)).toBe(g);
    g = { ...g, ended: { outcome: 'victory', ending: null, epilogueHint: '' } };
    expect(tick(g, 1000).elapsedMs).toBe(1500);
  });
});

describe('damage and healing', () => {
  it('downs a party member at 0 HP, then knocks them out if hit again', () => {
    const g = testGame();
    const lyra = g.party[1]!;
    expect(damageParty(g, lyra, 0)).toEqual([]);
    expect(damageParty(g, lyra, 5)[0]).toBe('Lyra takes 5 damage (11/16 HP)');
    const lines = damageParty(g, lyra, 99);
    expect(lyra).toMatchObject({ hp: 0, status: 'downed', downedTurnsLeft: 3 });
    expect(lyra.conditions).toContain('Downed');
    expect(lines.join(' ')).toMatch(/Downed/);
    expect(damageParty(g, lyra, 3).join(' ')).toMatch(/out of the fight/);
    expect(lyra.status).toBe('out');
    expect(damageParty(g, lyra, 3)).toEqual([]);
  });
  it('a guard boon soaks damage for any party member', () => {
    const g = testGame();
    g.party[0]!.boons.push({ type: 'guard', amount: 8, source: 'Shield Wall' });
    const lines = damageParty(g, g.party[1]!, 5);
    expect(lines).toEqual(["Brann Ironfoot's Shield Wall blocks 5 damage"]);
    expect(g.party[1]!.hp).toBe(16);
    expect(g.party[0]!.boons).toHaveLength(0);
    g.party[0]!.boons.push({ type: 'guard', amount: 8, source: 'Shield Wall' });
    damageParty(g, g.party[1]!, 10);
    expect(g.party[1]!.hp).toBe(14);
  });
  it('healing caps at max HP and revives', () => {
    const g = testGame();
    const lyra = g.party[1]!;
    damageParty(g, lyra, 99);
    expect(healParty(lyra, 0, CAMPAIGN)).toEqual([]);
    const lines = healParty(lyra, 6, CAMPAIGN);
    expect(lyra).toMatchObject({ hp: 6, status: 'ok' });
    expect(lyra.conditions).not.toContain('Downed');
    expect(lines).toHaveLength(2);
    healParty(lyra, 999, CAMPAIGN);
    expect(lyra.hp).toBe(16);
  });
  it('permadeath blocks healing the dead', () => {
    const g = testGame();
    const lyra = g.party[1]!;
    lyra.status = 'out';
    lyra.hp = 0;
    expect(healParty(lyra, 5, { ...CAMPAIGN, permadeath: true })).toEqual(['Lyra is beyond healing']);
    expect(lyra.hp).toBe(0);
  });
  it('stabilizing stops the countdown', () => {
    const g = testGame();
    const lyra = g.party[1]!;
    expect(stabilize(lyra)).toEqual([]);
    damageParty(g, lyra, 99);
    expect(stabilize(lyra)).toEqual(['Lyra is stabilized']);
    expect(lyra).toMatchObject({ status: 'stable', downedTurnsLeft: 0 });
  });
  it('roster entries are defeated at 0 HP', () => {
    const goblin = rosterEntryFromTemplate(CAMPAIGN.cast[0]!);
    expect(damageRoster(goblin, 3)).toEqual(['Goblin Scout takes 3 damage (4/7 HP)']);
    expect(healRoster(goblin, 99)).toEqual(['Goblin Scout heals 3 (7/7 HP)']);
    expect(damageRoster(goblin, 20)).toEqual(['Goblin Scout takes 20 damage (0/7 HP)', 'Goblin Scout is defeated']);
    expect(damageRoster(goblin, 5)).toEqual([]);
    expect(healRoster(goblin, 5)).toEqual([]);
  });
  it('a new act brings fallen members back at half HP unless permadeath', () => {
    const g = testGame();
    g.party[1]!.status = 'out';
    g.party[1]!.hp = 0;
    g.party[2]!.status = 'stable';
    g.party[2]!.hp = 0;
    expect(recoverForNewAct(g, CAMPAIGN)).toHaveLength(2);
    expect(g.party[1]).toMatchObject({ status: 'ok', hp: 8 });
    expect(g.party[2]).toMatchObject({ status: 'ok', hp: 7 });
    g.party[1]!.status = 'out';
    expect(recoverForNewAct(g, { ...CAMPAIGN, permadeath: true })).toEqual([]);
  });
});

describe('save schema', () => {
  it('round-trips a game state exactly', () => {
    const g = testGame();
    g.roster.push(rosterEntryFromTemplate(CAMPAIGN.cast[0]!));
    g.party[0]!.boons.push({ type: 'guard', amount: 8, source: 'Shield Wall' });
    expect(parseState(serializeState(g))).toEqual(g);
    expect(parseState(JSON.parse(serializeState(g)))).toEqual(g);
  });
  it('rejects corrupt saves with a readable message', () => {
    expect(() => parseState('{"version":2}')).toThrow(/Not a valid TaleForge game state/);
    const g = testGame() as unknown as Record<string, unknown>;
    expect(() => parseState({ ...g, party: [] })).toThrow(/party/);
  });
});
