import { describe, expect, it } from 'vitest';
import { beginTurn, computePacing, describeState, leastSpotlight, pacingNote, recordSpotlight } from './pacing';
import { rosterEntryFromTemplate } from './state';
import { CAMPAIGN, testGame } from './testing';

const MIN = 60_000;

describe('computePacing', () => {
  it('is on track inside the act budget', () => {
    const g = { ...testGame(), elapsedMs: 5 * MIN };
    expect(computePacing(g, CAMPAIGN)).toMatchObject({ status: 'on_track', actNumber: 1, actCount: 3, actMinutesLeft: 7, totalMinutesLeft: 40 });
  });
  it('flags an act that runs long', () => {
    const g = { ...testGame(), elapsedMs: 16 * MIN };
    expect(computePacing(g, CAMPAIGN).status).toBe('running_long');
  });
  it('flags being ahead of schedule', () => {
    const g = { ...testGame(), actIndex: 2, elapsedMs: 15 * MIN };
    expect(computePacing(g, CAMPAIGN).status).toBe('ahead');
  });
  it('calls for a wrap-up near and past the end', () => {
    expect(computePacing({ ...testGame(), actIndex: 2, elapsedMs: 42 * MIN }, CAMPAIGN).status).toBe('wrap_up');
    expect(computePacing({ ...testGame(), actIndex: 2, elapsedMs: 50 * MIN }, CAMPAIGN).status).toBe('wrap_up');
  });
  it('scales act budgets to the target length', () => {
    const scaled = { ...CAMPAIGN, targetMinutes: 90 };
    expect(computePacing({ ...testGame(), elapsedMs: 0 }, scaled).actMinutesLeft).toBe(24);
    const noBudget = { ...CAMPAIGN, acts: CAMPAIGN.acts.map((a) => ({ ...a, minutes: 0 })) };
    expect(computePacing(testGame(), noBudget).status).toBe('on_track');
  });
});

describe('spotlight', () => {
  it('reports the quietest able character once the gap is at least two turns', () => {
    let g = testGame();
    expect(leastSpotlight(g)).toBeNull();
    g = recordSpotlight(recordSpotlight(g, 'pc-brann'), 'pc-brann');
    g = recordSpotlight(g, 'pc-lyra');
    expect(g.spotlight).toEqual({ 'pc-brann': 2, 'pc-lyra': 1, 'pc-mags': 0 });
    expect(leastSpotlight(g)).toBe('Mags');
    g.party[2]!.status = 'out';
    expect(leastSpotlight(g)).toBeNull();
    expect(recordSpotlight(g, 'ghost')).toBe(g);
    g.party[1]!.status = 'out';
    expect(leastSpotlight(g)).toBeNull();
  });
});

describe('pacingNote', () => {
  it('describes the act, budget and remaining beats', () => {
    const g = { ...testGame(), elapsedMs: 5 * MIN, beatsCompleted: ['arrive'] };
    expect(pacingNote(g, CAMPAIGN)).toBe(
      'Act 1 of 3 ("The Road"); 5 of 45 min played. 7 min left in this act\'s budget. Beats left in this act: ambush.',
    );
  });
  it('pushes to close an act that runs long, and mentions spotlight and downed members', () => {
    let g = { ...testGame(), elapsedMs: 16 * MIN, beatsCompleted: ['arrive', 'ambush'] };
    g = recordSpotlight(recordSpotlight(g, 'pc-brann'), 'pc-brann');
    g.party[1]!.status = 'downed';
    g.party[1]!.downedTurnsLeft = 2;
    const note = pacingNote(g, CAMPAIGN);
    expect(note).toMatch(/4 min over budget/);
    expect(note).toMatch(/All beats of this act are done/);
    expect(note).toMatch(/Mags has had the least spotlight/);
    expect(note).toMatch(/Lyra is Downed \(2 turn\(s\)/);
  });
  it('steers to the climax at the end', () => {
    expect(pacingNote({ ...testGame(), actIndex: 2, elapsedMs: 42 * MIN }, CAMPAIGN)).toMatch(/Only 3 min left: go straight to the climax/);
    expect(pacingNote({ ...testGame(), actIndex: 2, elapsedMs: 47 * MIN }, CAMPAIGN)).toMatch(/Time is up/);
    expect(pacingNote({ ...testGame(), actIndex: 2, elapsedMs: 15 * MIN }, CAMPAIGN)).toMatch(/Ahead of schedule/);
  });
});

describe('beginTurn', () => {
  it('counts down Downed members until they are out', () => {
    const g = testGame();
    g.party[1]!.status = 'downed';
    g.party[1]!.downedTurnsLeft = 2;
    const one = beginTurn(g);
    expect(one.state.turn).toBe(1);
    expect(one.state.party[1]).toMatchObject({ status: 'downed', downedTurnsLeft: 1 });
    expect(one.lines).toEqual([]);
    const two = beginTurn(one.state);
    expect(two.state.party[1]!.status).toBe('out');
    expect(two.lines).toEqual(['Lyra is out of the fight']);
    expect(g.turn).toBe(0);
  });
});

describe('describeState', () => {
  it('summarizes the machine state for the DM', () => {
    const g = testGame();
    g.roster.push({ ...rosterEntryFromTemplate(CAMPAIGN.cast[0]!), conditions: ['Hidden'] });
    g.party[1]!.status = 'downed';
    g.party[1]!.conditions.push('Downed');
    g.party[0]!.signatureUsedInAct = 0;
    g.clues.push({ id: 'c1', text: 'Wet footprints' });
    g.items.push({ name: 'Key', description: '', holder: 'pc-mags' }, { name: 'Map', description: '', holder: 'party' });
    g.encounters.push({ id: 'ambush', outcome: 'won' });
    const text = describeState(g, CAMPAIGN);
    expect(text).toContain('Location: Mossford Village (village)');
    expect(text).toContain('- Brann Ironfoot [pc-brann] (Knight, played by Alex); HP 22/22; Defense 13; Heroic Points 1; Shield Wall used; Nerve 3/5');
    expect(text).toContain('DOWNED; conditions: Downed');
    expect(text).toContain('Torchlight: 6/6');
    expect(text).toContain('- Goblin Scout [goblin] (enemy) HP 7/7, Defense 12, Hidden');
    expect(text).toContain('Clues: Wet footprints');
    expect(text).toContain('Items: Key (Mags), Map (party)');
    expect(text).toContain('Encounters: ambush won');
    expect(describeState(testGame(), CAMPAIGN)).toContain('In the scene: no NPCs or enemies.');
  });
});
