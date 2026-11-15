import { describe, expect, it } from 'vitest';
import { createScriptedRng, createSeededRng } from './rng';
import { submitDice } from './rolls';
import { createGame } from './state';
import { CAMPAIGN, FACE, SHARPSHOOTER, member, testGame } from './testing';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, applyToolCall, toolJsonSchema } from './tools';
import type { GameState } from './types';

const rng = createSeededRng(3);

function call(state: GameState, name: string, input: unknown, r = rng) {
  return applyToolCall(state, CAMPAIGN, { name, input }, r);
}
function ok(state: GameState, name: string, input: unknown, r = rng) {
  const out = call(state, name, input, r);
  if (!out.ok) throw new Error(String(out.result.error));
  return out;
}
function chips(out: ReturnType<typeof call>): string[] {
  return out.effects.flatMap((e) => (e.type === 'chip' ? [e.text] : []));
}

describe('tool definitions', () => {
  it('every tool has a description and a JSON schema', () => {
    for (const tool of TOOL_NAMES) {
      expect(TOOL_DESCRIPTIONS[tool].length).toBeGreaterThan(10);
      const schema = toolJsonSchema(tool);
      expect(schema.type).toBe('object');
      expect(schema.$schema).toBeUndefined();
    }
    expect(toolJsonSchema('request_roll').required).toEqual(['character', 'kind', 'reason']);
  });
});

describe('validation', () => {
  it('rejects unknown tools and bad input without throwing or changing state', () => {
    const g = testGame();
    const unknown = call(g, 'cast_fireball', {});
    expect(unknown).toMatchObject({ ok: false, state: g });
    expect(unknown.result.error).toMatch(/Unknown tool/);
    const bad = call(g, 'request_roll', { character: 'Mags', kind: 'dance' });
    expect(bad.ok).toBe(false);
    expect(bad.result.error).toMatch(/Invalid input for request_roll: kind/);
    expect(call(g, 'heal', undefined).ok).toBe(false);
  });
  it('blocks state changes after the campaign ends', () => {
    const g = ok(testGame(), 'end_campaign', { outcome: 'victory', ending: 'crowned', epilogue_hint: 'Dawn.' }).state;
    expect(call(g, 'heal', { target: 'Lyra', amount: 3, reason: 'x' }).result.error).toBe('The campaign has ended.');
    expect(call(g, 'request_image', { description: 'the crown at dawn' }).ok).toBe(true);
  });
});

describe('request_roll', () => {
  it('defers party rolls and resolves NPC rolls immediately', () => {
    const g = ok(testGame(), 'roster_add', { id: 'goblin' }).state;
    const deferred = ok(g, 'request_roll', { character: 'Mags', kind: 'check', stat: 'DEX', dc: 13, reason: 'sneak' });
    expect(deferred.pending?.rollerId).toBe('pc-mags');
    expect(deferred.state.pendingRoll).not.toBeNull();
    const npc = ok(g, 'request_roll', { character: 'goblin', kind: 'attack', target: 'Mags', reason: 'stab' }, createScriptedRng([18, 2]));
    expect(npc.report?.damage?.total).toBe(3);
    expect(npc.result).toMatchObject({ outcome: 'success', damage: 3 });
    expect(call(g, 'request_roll', { character: 'ghost', kind: 'check', reason: 'x' }).ok).toBe(false);
  });
});

describe('damage, healing and conditions', () => {
  it('applies flat and rolled damage', () => {
    const g = testGame();
    const flat = ok(g, 'apply_damage', { target: 'Lyra', amount: 4, reason: 'trap' });
    expect(flat.state.party[1]!.hp).toBe(12);
    expect(g.party[1]!.hp).toBe(16);
    const rolled = ok(flat.state, 'apply_damage', { target: 'Lyra', amount: '1d6+1', reason: 'fall' }, createScriptedRng([4]));
    expect(rolled.state.party[1]!.hp).toBe(7);
    expect(rolled.result.amount).toBe(5);
    expect(chips(rolled)).toEqual(['Lyra takes 5 damage (7/16 HP)']);
    const healed = ok(rolled.state, 'heal', { target: 'Lyra', amount: '3', reason: 'potion' });
    expect(healed.state.party[1]!.hp).toBe(10);
  });
  it('works on roster entries and rejects bad targets/amounts', () => {
    const g = ok(testGame(), 'roster_add', { id: 'goblin' }).state;
    const hit = ok(g, 'apply_damage', { target: 'goblin', amount: 3, reason: 'rockfall' });
    expect(hit.state.roster[0]!.hp).toBe(4);
    expect(ok(hit.state, 'heal', { target: 'goblin', amount: 2, reason: 'x' }).state.roster[0]!.hp).toBe(6);
    expect(call(g, 'apply_damage', { target: 'ghost', amount: 3, reason: 'x' }).ok).toBe(false);
    expect(call(g, 'apply_damage', { target: 'Lyra', amount: 'many', reason: 'x' }).result.error).toMatch(/not a number or dice/);
  });
  it('adds and removes conditions without duplicates', () => {
    let g = ok(testGame(), 'add_condition', { target: 'Mags', condition: 'Hidden' }).state;
    g = ok(g, 'add_condition', { target: 'mags', condition: 'hidden' }).state;
    expect(g.party[2]!.conditions).toEqual(['Hidden']);
    expect(call(g, 'remove_condition', { target: 'Mags', condition: 'Poisoned' }).ok).toBe(false);
    g = ok(g, 'remove_condition', { target: 'Mags', condition: 'HIDDEN' }).state;
    expect(g.party[2]!.conditions).toEqual([]);
    expect(call(g, 'add_condition', { target: 'ghost', condition: 'Hidden' }).ok).toBe(false);
  });
});

describe('roster', () => {
  it('adds cast entries by id, once', () => {
    const first = ok(testGame(), 'roster_add', { id: 'goblin' });
    expect(first.state.roster[0]).toMatchObject({ id: 'goblin', hp: 7, maxHp: 7, present: true, improvised: false });
    expect(first.effects.some((e) => e.type === 'roster_added')).toBe(true);
    const again = ok(first.state, 'roster_add', { id: 'goblin' });
    expect(again.state.roster).toHaveLength(1);
    expect(again.result.note).toBe('already in the scene');
  });
  it('brings back someone who left, keeping their state', () => {
    let g = ok(testGame(), 'roster_add', { id: 'elder' }).state;
    g = ok(g, 'roster_remove', { id: 'Elder Maren', reason: 'left' }).state;
    expect(g.roster[0]).toMatchObject({ present: false, status: 'left' });
    g = ok(g, 'roster_add', { id: 'elder' }).state;
    expect(g.roster[0]).toMatchObject({ present: true, status: 'active' });
    expect(call(g, 'roster_remove', { id: 'ghost', reason: 'fled' }).ok).toBe(false);
  });
  it('improvises NPCs with sensible defaults and unique ids', () => {
    let out = ok(testGame(), 'roster_add', { name: 'Bandit', role: 'enemy', look: 'scarred' });
    expect(out.state.roster[0]).toMatchObject({ id: 'bandit', hp: 10, defense: 12, improvised: true });
    expect(out.state.roster[0]!.attacks).toEqual([{ name: 'Attack', bonus: 3, damage: '1d6' }]);
    out = ok(out.state, 'roster_add', { name: 'Bandit', role: 'enemy' });
    expect(out.state.roster[1]!.id).toBe('bandit-2');
    out = ok(out.state, 'roster_add', { name: 'Old Fisher' });
    expect(out.state.roster[2]).toMatchObject({ role: 'neutral', hp: 8, attacks: [] });
    out = ok(out.state, 'roster_add', { name: 'Warlord', role: 'boss', attack_name: 'Maul', attack_bonus: 5, attack_damage: '2d6+2' });
    expect(out.state.roster[3]).toMatchObject({ hp: 30, defense: 14 });
    out = ok(out.state, 'roster_add', { id: 'made-up', name: 'Stray Dog' });
    expect(out.state.roster[4]!.id).toBe('made-up');
  });
  it('explains bad roster_add calls', () => {
    const g = testGame();
    expect(call(g, 'roster_add', { id: 'dragon' }).result.error).toMatch(/Cast ids: goblin, elder, king/);
    expect(call(g, 'roster_add', {}).result.error).toMatch(/cast id or a name/);
    expect(call(g, 'roster_add', { name: 'X', attack_damage: 'ouch' }).result.error).toMatch(/dice notation/);
  });
});

describe('scenes and music', () => {
  it('changes to known locations by id or name and sets the mood', () => {
    const out = ok(testGame(), 'scene_change', { location: 'cave' });
    expect(out.state).toMatchObject({ locationId: 'cave', musicMood: 'tension' });
    expect(out.effects).toEqual([
      { type: 'scene_changed', locationId: 'cave' },
      { type: 'music', mood: 'tension' },
    ]);
    expect(ok(testGame(), 'scene_change', { location: 'the drowned cave' }).state.locationId).toBe('cave');
  });
  it('supports improvised locations with a description', () => {
    expect(call(testGame(), 'scene_change', { location: 'attic' }).result.error).toMatch(/Known ids: village, cave/);
    const out = ok(testGame(), 'scene_change', { location: 'Dusty Attic', description: 'cobwebs and trunks' });
    expect(out.state.locationId).toBe('dusty-attic');
    expect(out.state.improvisedLocations).toHaveLength(1);
    const back = ok(out.state, 'scene_change', { location: 'Dusty Attic', description: 'again' });
    expect(back.state.improvisedLocations).toHaveLength(1);
  });
  it('overrides the mood and queues images', () => {
    const out = ok(testGame(), 'set_music_mood', { mood: 'combat' });
    expect(out.state.musicMood).toBe('combat');
    const img = ok(testGame(), 'request_image', { description: 'the vault opens' });
    expect(img.effects).toEqual([{ type: 'image_request', description: 'the vault opens', includeParty: true }]);
  });
});

describe('progress', () => {
  it('completes beats and advances the act when all are done', () => {
    let out = ok(testGame(), 'advance_progress', { beat: 'arrive', milestone: true });
    expect(out.state).toMatchObject({ beatsCompleted: ['arrive'], milestonesDone: 1, actIndex: 0 });
    out = ok(out.state, 'advance_progress', { beat: 'arrive' });
    expect(out.state.beatsCompleted).toEqual(['arrive']);
    out.state.party[1]!.status = 'out';
    out = ok(out.state, 'advance_progress', { beat: 'ambush' });
    expect(out.state.actIndex).toBe(1);
    expect(out.state.party[1]!.status).toBe('ok');
    expect(out.effects).toContainEqual({ type: 'act_advanced', actIndex: 1 });
    expect(out.effects).toContainEqual({ type: 'milestone_boost_available' });
    expect(chips(out)).toContain('Act 2: The Depths');
  });
  it('can force an act, never past the last, and caps milestones', () => {
    let g = testGame();
    for (let i = 0; i < 5; i++) g = ok(g, 'advance_progress', { advance_act: true, milestone: true }).state;
    expect(g.actIndex).toBe(2);
    expect(g.milestonesDone).toBe(4);
    expect(call(g, 'advance_progress', {}).ok).toBe(false);
  });
  it('records clues, items and encounters', () => {
    let g = ok(testGame(), 'record_clue', { text: 'A wet crown-shaped ring on the altar' }).state;
    expect(ok(g, 'record_clue', { text: 'A wet crown-shaped ring on the altar' }).result.note).toBe('already recorded');
    g = ok(g, 'record_clue', { id: 'Tide Marks', text: 'Tide marks above the door' }).state;
    expect(g.clues.map((c) => c.id)).toEqual(['clue-1', 'tide-marks']);
    g = ok(g, 'give_item', { name: 'Rusty Key', to: 'Mags' }).state;
    g = ok(g, 'give_item', { name: 'Map', description: 'Half burned', to: 'party' }).state;
    g = ok(g, 'give_item', { name: 'Rope' }).state;
    expect(g.items.map((i) => i.holder)).toEqual(['pc-mags', 'party', 'party']);
    expect(call(g, 'give_item', { name: 'Hat', to: 'ghost' }).ok).toBe(false);
    g = ok(g, 'remove_item', { name: 'rusty key' }).state;
    expect(g.items).toHaveLength(2);
    expect(call(g, 'remove_item', { name: 'Sword' }).result.error).toMatch(/Items: Map, Rope/);
    g = ok(g, 'encounter_result', { encounter_id: 'ambush', outcome: 'lost' }).state;
    g = ok(g, 'encounter_result', { encounter_id: 'ambush', outcome: 'won' }).state;
    expect(g.encounters).toEqual([{ id: 'ambush', outcome: 'won' }]);
  });
});

describe('signature abilities', () => {
  it('guard: reduces the next damage, once per act', () => {
    const used = ok(testGame(), 'use_signature', { character: 'Brann' });
    expect(used.state.party[0]!.boons).toEqual([{ type: 'guard', amount: 8, source: 'Shield Wall' }]);
    expect(call(used.state, 'use_signature', { character: 'Brann' }).result.error).toMatch(/already used Shield Wall this act/);
    const nextAct = ok(used.state, 'advance_progress', { advance_act: true }).state;
    expect(call(nextAct, 'use_signature', { character: 'Brann' }).ok).toBe(true);
  });
  it('heal: heals the target or the user', () => {
    let g = ok(testGame(), 'apply_damage', { target: 'Brann', amount: 15, reason: 'x' }).state;
    const out = ok(g, 'use_signature', { character: 'Lyra', target: 'Brann' }, createScriptedRng([5]));
    expect(out.state.party[0]!.hp).toBe(15);
    expect(call(g, 'use_signature', { character: 'Lyra', target: 'ghost' }).ok).toBe(false);
    g = ok(g, 'apply_damage', { target: 'Lyra', amount: 6, reason: 'x' }).state;
    expect(ok(g, 'use_signature', { character: 'Lyra' }, createScriptedRng([1])).state.party[1]!.hp).toBe(14);
  });
  it('next_roll and damage_bonus create boons; narrative just reports', () => {
    const mags = ok(testGame(), 'use_signature', { character: 'Mags' });
    expect(mags.state.party[2]!.boons[0]).toMatchObject({ type: 'next_roll', advantage: true, bonus: 2 });
    expect(mags.result.effect).toBe("Mags's next roll gets advantage and +2");
    const g = createGame(CAMPAIGN, [member(SHARPSHOOTER, 'a', 'Ash'), member(FACE, 'b', 'Bo')]);
    expect(ok(g, 'use_signature', { character: 'Ash' }).state.party[0]!.boons[0]).toMatchObject({ type: 'damage_bonus', dice: '2d6' });
    expect(ok(g, 'use_signature', { character: 'Bo' }).result.effect).toMatch(/narrative/);
  });
  it('rejects unknown or incapacitated users', () => {
    const g = testGame();
    expect(call(g, 'use_signature', { character: 'ghost' }).ok).toBe(false);
    g.party[0]!.status = 'downed';
    expect(call(g, 'use_signature', { character: 'Brann' }).result.error).toMatch(/downed/);
  });
});

describe('heroic points and resources', () => {
  it('awards heroic points up to three', () => {
    let g = testGame();
    g = ok(g, 'award_heroic_point', { character: 'Lyra', reason: 'great speech' }).state;
    g = ok(g, 'award_heroic_point', { character: 'Lyra', reason: 'again' }).state;
    const capped = ok(g, 'award_heroic_point', { character: 'Lyra', reason: 'more' });
    expect(capped.state.party[1]!.heroicPoints).toBe(3);
    expect(capped.result.note).toMatch(/maximum/);
    expect(call(g, 'award_heroic_point', { character: 'ghost', reason: 'x' }).ok).toBe(false);
  });
  it('adjusts party and character resources within bounds', () => {
    let out = ok(testGame(), 'adjust_resource', { resource: 'torchlight', delta: -2, reason: 'time passes' });
    expect(out.state.partyResources.torchlight).toBe(4);
    out = ok(out.state, 'adjust_resource', { resource: 'Torchlight', delta: -9, reason: 'wind' });
    expect(out.result).toMatchObject({ value: 0, warning: 'Torchlight has run out' });
    out = ok(out.state, 'adjust_resource', { resource: 'nerve', delta: 5, target: 'Mags', reason: 'pep talk' });
    expect(out.state.party[2]!.resources.nerve).toBe(5);
    out = ok(out.state, 'adjust_resource', { resource: 'nerve', delta: -9, target: 'Mags', reason: 'terror' });
    expect(out.result.warning).toBe("Mags's Nerve has run out");
    expect(call(out.state, 'adjust_resource', { resource: 'nerve', delta: 1, reason: 'x' }).result.error).toMatch(/give a target/);
    expect(call(out.state, 'adjust_resource', { resource: 'nerve', delta: 1, target: 'ghost', reason: 'x' }).ok).toBe(false);
    expect(call(out.state, 'adjust_resource', { resource: 'mana', delta: 1, reason: 'x' }).result.error).toMatch(/Resources: torchlight, nerve/);
  });
});

describe('end_campaign', () => {
  it('ends the game with the right music', () => {
    const win = ok(testGame(), 'end_campaign', { outcome: 'bittersweet', epilogue_hint: 'The crown sinks.' });
    expect(win.state.ended).toEqual({ outcome: 'bittersweet', ending: null, epilogueHint: 'The crown sinks.' });
    expect(win.state.musicMood).toBe('triumph');
    expect(win.effects).toContainEqual({ type: 'campaign_ended', outcome: 'bittersweet' });
    expect(ok(testGame(), 'end_campaign', { outcome: 'defeat', epilogue_hint: 'Dark.' }).state.musicMood).toBe('defeat');
  });
  it('waits for a pending roll', () => {
    const g = ok(testGame(), 'request_roll', { character: 'Mags', kind: 'check', reason: 'x' }).state;
    expect(call(g, 'end_campaign', { outcome: 'victory', epilogue_hint: 'x' }).result.error).toMatch(/pending roll/);
    const done = submitDice(g, [15], rng).state;
    expect(call(done, 'end_campaign', { outcome: 'victory', epilogue_hint: 'x' }).ok).toBe(true);
  });
});
