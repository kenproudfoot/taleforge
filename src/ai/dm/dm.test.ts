import { beforeEach, describe, expect, it } from 'vitest';
import { createScriptedRng, createSeededRng } from '@/engine/rng';
import { chooseHeroic, submitDice } from '@/engine/rolls';
import type { PendingRoll, RollReport } from '@/engine/types';
import { buildParty, emptyAnswers, missingAnswers } from '@/game/characters';
import type { Session } from '@/game/session';
import { createSession, formatClock, summarizeSession, usesPhysicalDice } from '@/game/session';
import { testAnswers, testSession, testWorld } from '@/game/testing';
import { resetDbForTests } from '@/storage/db';
import { deleteSession, listSessions, loadSession, parseSession, saveSession } from '@/storage/sessions';
import { createMockProvider } from '../providers/mock';
import type { MockScript } from '../providers/mock';
import { ProviderError } from '../providers/types';
import type { ChatMessage } from '../providers/types';
import { COMPACT_AT_TURNS, KEEP_TURNS, buildMessages, compactHistory, isTurnStart, playerBlock, stateBlock } from './context';
import { addressedMember, parseNarration, plainNarration } from './narration';
import { DM_TOOLS, MAX_STEPS, runDmTurn } from './orchestrator';
import type { DmDeps } from './orchestrator';
import { buildSystemPrompt, describeMember } from './prompt';

const world = testWorld();

function harness(script: MockScript, options: { dice?: number[][]; heroic?: 'accept' | 'plus5' } = {}) {
  let session: Session = testSession();
  const provider = createMockProvider(script);
  const dice = [...(options.dice ?? [])];
  const rolls: PendingRoll[] = [];
  const effects: string[] = [];
  const rng = createSeededRng(5);
  const deps: DmDeps = {
    provider,
    model: 'mock-dm',
    effort: 'low',
    price: { inputPerM: 2, outputPerM: 10 },
    system: buildSystemPrompt(world.core, world.pack, session.state),
    campaign: world.campaign,
    rng,
    getSession: () => session,
    setSession: (change) => {
      session = change(session);
    },
    async awaitRoll(pending) {
      rolls.push(pending);
      let report: RollReport | null = null;
      // Play the roll the way the UI does: feed dice until the engine reports it finished.
      for (let guard = 0; guard < 6 && !report; guard++) {
        const p = session.state.pendingRoll!;
        const step = p.stage === 'heroic' ? chooseHeroic(session.state, options.heroic ?? 'accept') : submitDice(session.state, dice.shift() ?? [10], rng);
        session = { ...session, state: step.state };
        report = step.report;
      }
      return report!;
    },
    onEffect: (e) => effects.push(e.type),
  };
  return { deps, provider, rolls, effects, get session() { return session; } };
}

describe('system prompt', () => {
  const system = buildSystemPrompt(world.core, world.pack, testSession().state);
  const text = system[0]!.text;
  it('is one cached block containing style, rules, campaign, cast, secrets and the party', () => {
    expect(system).toHaveLength(1);
    expect(system[0]!.cache).toBe(true);
    expect(text).toContain('You are the Dungeon Master for "The Sunken Crown"');
    expect(text).toContain('played aloud by 2 player(s)');
    expect(text).toContain('«Name: line»');
    expect(text).toContain('Heroic Points');
    expect(text).toContain('Beat "gate-of-bells":');
    expect(text).toContain('Ending "the-bell-rings":');
    expect(text).toContain('- drowned-king: The Drowned King (boss).');
    expect(text).toContain('Tide Blade +6 for 1d10+3');
    expect(text).toContain('- causeway: The Dead Tide Causeway. Leads to: brinewick, drowned-gate.');
    expect(text).toContain('Resource "tide" (Tide, shared by the party, starts at 6 of 6)');
    expect(text).toContain('## SECRETS (Dungeon Master only)');
    expect(text).toContain('Reveal when: The party reads the steward\'s ledger');
  });
  it('describes each party member, including companions and re-skinned abilities', () => {
    expect(text).toContain('### Lyra Vance (Healer), played by Sam');
    expect(text).toContain('Signature ability (once per act): Mending Hands.');
    expect(text).toContain('Companion: Biscuit, a scruffy terrier');
    expect(text).toContain('Signature item: A notched war-axe');
    expect(describeMember(testSession().state.party[1]!)).toContain('Stats: STR +3, DEX +0, CON +3');
  });
  it('contains no volatile state, so it can be cached', () => {
    const later = testSession();
    later.state.elapsedMs = 999_999;
    later.state.party[0]!.hp = 1;
    later.state.turn = 12;
    expect(buildSystemPrompt(world.core, world.pack, later.state)).toEqual(system);
  });
});

describe('turn messages', () => {
  const s = testSession();
  it('formats player input and the start/resume cues', () => {
    expect(playerBlock({ type: 'players', messages: [{ characterId: 'pc-brann', text: 'I kick the door.' }] }, s.state)).toBe('<players>\nBrann (played by Alex): I kick the door.\n</players>');
    expect(playerBlock({ type: 'players', messages: [{ characterId: 'nobody', text: 'Hello?' }] }, s.state)).toContain('Hello?');
    expect(playerBlock({ type: 'start' }, s.state)).toMatch(/session begins/);
    expect(playerBlock({ type: 'resume' }, s.state)).toMatch(/resumes/);
  });
  it('builds the state block from the engine', () => {
    const block = stateBlock(s.state, world.campaign);
    expect(block).toContain('<game_state>\nLocation: Brinewick Shingle (brinewick)');
    expect(block).toContain('Tide: 6/6');
    expect(block).toContain('<pacing>\nAct 1 of 3 ("The Dead Tide")');
  });
  it('attaches the frozen state to the current turn start only, after the summary', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'turn one' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: [{ type: 'text', text: 'turn two' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'heal', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 't', name: 'heal', content: '{}' }] },
    ];
    const out = buildMessages(history, 'They crossed the causeway.', 'STATE');
    expect(out).toHaveLength(7);
    expect(out[0]!.content[0]).toMatchObject({ text: expect.stringContaining('<story_so_far>\nThey crossed the causeway.') });
    expect(out[1]!.role).toBe('assistant');
    expect(out[2]).toBe(history[0]);
    expect(out[4]!.content).toEqual([{ type: 'text', text: 'STATE' }, { type: 'text', text: 'turn two' }]);
    expect(out[6]).toBe(history[4]);
    expect(buildMessages(history, '  ', 'STATE')).toHaveLength(5);
    expect(isTurnStart(history[4]!)).toBe(false);
  });
});

describe('narration', () => {
  it('splits NPC speech from narration', () => {
    expect(parseNarration('The elder turns. «Elder Maren: You came. Thank the tides.» Rain falls. «Pip: This way!»')).toEqual([
      { type: 'narration', text: 'The elder turns.' },
      { type: 'speech', speaker: 'Elder Maren', text: 'You came. Thank the tides.' },
      { type: 'narration', text: 'Rain falls.' },
      { type: 'speech', speaker: 'Pip', text: 'This way!' },
    ]);
    expect(parseNarration('No speech here.')).toEqual([{ type: 'narration', text: 'No speech here.' }]);
    expect(parseNarration('Cut off «Pip: wait')).toEqual([{ type: 'narration', text: 'Cut off «Pip: wait' }]);
    expect(parseNarration('«Pip: »')).toEqual([]);
    expect(plainNarration('He nods. «Pip: Follow me.»')).toBe('He nods. Pip says: "Follow me."');
  });
  it('finds who the DM addressed last', () => {
    const state = testSession().state;
    expect(addressedMember('The fog thickens around you both. Lyra, what do you do?', state)).toBe('pc-lyra-vance');
    expect(addressedMember('Lyra steadies herself. The wight lunges. Brann, it is on you!', state)).toBe('pc-brann');
    expect(addressedMember('Brann grunts. «Pip: Lyra, look out!» What do you all do?', state)).toBeNull();
    expect(addressedMember('What does the party do?', state)).toBeNull();
    state.party[0]!.status = 'downed';
    expect(addressedMember('Lyra, what do you do?', state)).toBeNull();
  });
});

describe('runDmTurn', () => {
  it('opens the game: streams narration into the chat and records history', async () => {
    const h = harness([{ text: 'Dusk in Brinewick. The bay is leaving. Lyra, what do you do?' }]);
    const result = await runDmTurn(h.deps, { type: 'start' });
    expect(result).toEqual({ ok: true, addressed: 'pc-lyra-vance' });
    expect(h.session.chat).toEqual([{ id: expect.any(String), kind: 'dm', text: 'Dusk in Brinewick. The bay is leaving. Lyra, what do you do?' }]);
    expect(h.session.history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(h.session.history[0]!.content[0]).toMatchObject({ text: expect.stringContaining('session begins') });
    expect(h.session.state.turn).toBe(1);
    const req = h.provider.requests[0]!;
    expect(req.tools).toBe(DM_TOOLS);
    expect(req.tools).toHaveLength(19);
    expect(req.effort).toBe('low');
    expect(req.messages[0]!.content[0]).toMatchObject({ text: expect.stringContaining('<game_state>') });
    expect(h.session.history[0]!.content).toHaveLength(1);
    expect(h.session.usage.dm.inputTokens).toBe(100);
    expect(h.session.costUsd).toBeGreaterThan(0);
    expect(h.session.ledger).toEqual([
      { at: expect.any(Number), turn: 1, kind: 'dm', provider: 'mock', model: expect.any(String), usage: expect.objectContaining({ inputTokens: 100 }), costUsd: h.session.costUsd },
    ]);
  });

  it('applies tool calls, feeds results back and keeps the state block frozen within the turn', async () => {
    const h = harness([
      { text: 'You set out across the stone.', toolCalls: [{ name: 'scene_change', input: { location: 'causeway' } }, { name: 'adjust_resource', input: { resource: 'tide', delta: -1, reason: 'crossing' } }, { name: 'advance_progress', input: { beat: 'brinewick-at-dusk' } }] },
      { text: 'Fog closes in. Brann, you hear something wet.' },
    ]);
    const result = await runDmTurn(h.deps, { type: 'players', messages: [{ characterId: 'pc-lyra-vance', text: 'We go.' }] });
    expect(result).toEqual({ ok: true, addressed: 'pc-brann' });
    expect(h.session.state).toMatchObject({ locationId: 'causeway', musicMood: 'tension', beatsCompleted: ['brinewick-at-dusk'] });
    expect(h.session.state.partyResources.tide).toBe(5);
    expect(h.session.state.spotlight['pc-lyra-vance']).toBe(1);
    expect(h.session.chat.map((e) => e.kind)).toEqual(['player', 'dm', 'chip', 'dm']);
    expect(h.effects).toEqual(['scene_changed', 'music', 'chip']);
    expect(h.session.history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(h.session.history[2]!.content).toHaveLength(3);
    expect(h.session.history[2]!.content[0]).toMatchObject({ type: 'tool_result', name: 'scene_change', content: '{"location":"causeway","name":"The Dead Tide Causeway"}' });
    const [first, second] = h.provider.requests;
    expect(second!.messages).toHaveLength(3);
    // Same frozen state in both requests even though the location changed in between.
    expect(second!.messages[0]).toEqual(first!.messages[0]);
    expect(JSON.stringify(second!.messages[0])).toContain('Brinewick Shingle');
  });

  it('replays thinking blocks only within the turn that produced them', async () => {
    const thinking = (n: number) => ({ provider: 'anthropic' as const, model: 'mock-dm', content: [{ type: 'thinking', thinking: `plan ${n}`, signature: `sig-${n}` }] });
    const h = harness([
      { text: 'You set out.', toolCalls: [{ name: 'scene_change', input: { location: 'causeway' } }], raw: thinking(1) },
      { text: 'Fog closes in. Brann?', raw: thinking(2) },
      { text: 'The bell rings. Lyra?', raw: thinking(3) },
    ]);
    await runDmTurn(h.deps, { type: 'players', messages: [{ characterId: 'pc-lyra-vance', text: 'We go.' }] });
    // Inside the turn, the second request carries the first reply's thinking unchanged.
    expect(h.provider.requests[1]!.messages[1]!.raw).toEqual(thinking(1));
    await runDmTurn(h.deps, { type: 'players', messages: [{ characterId: 'pc-brann', text: 'I listen.' }] });
    // The next turn moves the state snapshot, so the earlier turn's thinking is no longer sent.
    const next = h.provider.requests[2]!.messages;
    expect(next.filter((m) => m.raw)).toEqual([]);
    expect(h.session.history.filter((m) => m.raw).map((m) => m.raw)).toEqual([thinking(3)]);
  });

  it('pauses for a player roll and hands the engine result back to the model', async () => {
    const h = harness(
      [
        { text: 'The lock is rusted shut.', toolCalls: [{ name: 'request_roll', input: { character: 'Brann', kind: 'check', stat: 'STR', dc: 13, reason: 'force the gate' } }] },
        { text: 'The gate shrieks open.' },
      ],
      { dice: [[12]] },
    );
    await runDmTurn(h.deps, { type: 'players', messages: [{ characterId: 'pc-brann', text: 'I force it.' }] });
    expect(h.rolls).toHaveLength(1);
    expect(h.rolls[0]).toMatchObject({ rollerId: 'pc-brann', stat: 'STR', dc: 13 });
    expect(h.session.state.pendingRoll).toBeNull();
    expect(h.session.chat.map((e) => e.kind)).toEqual(['player', 'dm', 'roll', 'dm']);
    const result = JSON.parse((h.session.history[2]!.content[0] as { content: string }).content);
    expect(result).toMatchObject({ roller: 'Brann', natural: 12, total: 17, against: 13, outcome: 'success' });
    expect(h.effects).toEqual(['roll_requested', 'roll_report']);
  });

  it('runs an attack through hit, damage and enemy response', async () => {
    const h = harness(
      [
        { toolCalls: [{ name: 'roster_add', input: { id: 'tide-wight' } }] },
        { text: 'A wight claws out of the silt!', toolCalls: [{ name: 'request_roll', input: { character: 'Brann', kind: 'attack', target: 'tide-wight', reason: 'axe swing' } }] },
        { text: 'It reels and swipes back.', toolCalls: [{ name: 'request_roll', input: { character: 'tide-wight', kind: 'attack', target: 'Lyra Vance', reason: 'boat-hook' } }] },
        { text: 'Lyra, you are bleeding. What now?' },
      ],
      { dice: [[15], [2]] },
    );
    h.deps.rng = createScriptedRng([18, 4]);
    await runDmTurn(h.deps, { type: 'players', messages: [{ characterId: 'pc-brann', text: 'Attack!' }] });
    const wight = h.session.state.roster[0]!;
    expect(wight).toMatchObject({ id: 'tide-wight', hp: 4, status: 'active' });
    expect(h.session.state.party[0]!.hp).toBe(h.session.state.party[0]!.maxHp - 5);
    expect(h.session.chat.map((e) => e.kind)).toEqual(['player', 'chip', 'dm', 'roll', 'chip', 'dm', 'roll', 'chip', 'dm']);
    expect(h.provider.requests).toHaveLength(4);
  });

  it('reports invalid tool calls to the model as errors and carries on', async () => {
    const h = harness([{ toolCalls: [{ name: 'cast_fireball', input: {} }, { name: 'heal', input: { target: 'Nobody', amount: 3, reason: 'x' } }] }, { text: 'Never mind. Brann?' }]);
    const result = await runDmTurn(h.deps, { type: 'start' });
    expect(result.ok).toBe(true);
    const results = h.session.history[2]!.content as Array<{ isError?: boolean; content: string }>;
    expect(results.map((r) => r.isError)).toEqual([true, true]);
    expect(results[0]!.content).toContain('Unknown tool');
  });

  it('restores the session and adds an error entry when the provider fails', async () => {
    const h = harness([{ text: 'Partial narration', toolCalls: [{ name: 'scene_change', input: { location: 'causeway' } }] }, { error: new ProviderError('rate_limit', 'slow down', 429) }]);
    const before = h.session;
    const result = await runDmTurn(h.deps, { type: 'players', messages: [{ characterId: 'pc-brann', text: 'Go.' }] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rate limiting/);
    expect(h.session.state).toEqual(before.state);
    expect(h.session.history).toEqual([]);
    expect(h.session.chat).toEqual([{ id: expect.any(String), kind: 'error', text: expect.stringMatching(/rate limiting/) }]);
    expect(h.session.usage.dm.inputTokens).toBe(100);
  });

  it('treats refusals and empty truncated replies as errors, and aborts silently', async () => {
    const refused = harness([{ text: '', stopReason: 'refusal' }]);
    expect((await runDmTurn(refused.deps, { type: 'start' })).error).toMatch(/declined/);
    const cut = harness([{ text: '', stopReason: 'max_tokens' }]);
    expect((await runDmTurn(cut.deps, { type: 'start' })).error).toMatch(/cut off/);
    const aborted = harness([{ text: 'hello' }]);
    const ac = new AbortController();
    ac.abort();
    aborted.deps.signal = ac.signal;
    expect((await runDmTurn(aborted.deps, { type: 'start' })).ok).toBe(false);
    expect(aborted.session.chat).toEqual([]);
  });

  it('stops after MAX_STEPS tool loops and ends the campaign cleanly', async () => {
    const looping = harness(() => ({ toolCalls: [{ name: 'set_music_mood', input: { mood: 'combat' } }] }));
    expect((await runDmTurn(looping.deps, { type: 'start' })).ok).toBe(true);
    expect(looping.provider.requests).toHaveLength(MAX_STEPS);
    const ending = harness([{ text: 'The bell rings.', toolCalls: [{ name: 'end_campaign', input: { outcome: 'victory', ending: 'the-bell-rings', epilogue_hint: 'Dawn.' } }] }, { text: 'Dawn breaks over Brinewick. Lyra, you did it.' }]);
    const result = await runDmTurn(ending.deps, { type: 'start' });
    expect(result).toEqual({ ok: true, addressed: null });
    expect(ending.session.state.ended?.outcome).toBe('victory');
    expect(ending.effects).toContain('campaign_ended');
  });

  it('counts down Downed characters at the start of each turn', async () => {
    const h = harness([{ text: 'ok' }]);
    h.deps.setSession((s) => {
      const state = structuredClone(s.state);
      state.party[0]!.status = 'downed';
      state.party[0]!.downedTurnsLeft = 1;
      return { ...s, state };
    });
    await runDmTurn(h.deps, { type: 'start' });
    expect(h.session.chat[0]).toMatchObject({ kind: 'chip', text: 'Lyra Vance is out of the fight' });
  });
});

describe('history compaction', () => {
  function longHistory(turns: number): ChatMessage[] {
    return Array.from({ length: turns }, (_, i) => [
      { role: 'user' as const, content: [{ type: 'text' as const, text: `turn ${i + 1}` }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: `reply ${i + 1}` }, { type: 'tool_use' as const, id: `t${i}`, name: 'heal', input: { n: i } }] },
      { role: 'user' as const, content: [{ type: 'tool_result' as const, toolUseId: `t${i}`, name: 'heal', content: 'ok' }] },
    ]).flat();
  }
  it('does nothing below the threshold', async () => {
    const helper = createMockProvider([]);
    expect(await compactHistory(longHistory(COMPACT_AT_TURNS), '', { provider: helper, model: 'h' })).toBeNull();
    expect(helper.requests).toHaveLength(0);
  });
  it('folds old turns into the summary and keeps the recent ones verbatim', async () => {
    const helper = createMockProvider([{ text: '- The party crossed the causeway.\n- Varr is ahead.' }]);
    const history = longHistory(COMPACT_AT_TURNS + 2);
    const result = await compactHistory(history, 'Earlier: they met Maren.', { provider: helper, model: 'h' });
    expect(result!.summary).toBe('- The party crossed the causeway.\n- Varr is ahead.');
    expect(result!.history.filter(isTurnStart)).toHaveLength(KEEP_TURNS);
    expect(result!.history[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'turn 9' }] });
    const prompt = (helper.requests[0]!.messages[0]!.content[0] as { text: string }).text;
    expect(prompt).toContain('Summary so far:\nEarlier: they met Maren.');
    expect(prompt).toContain('TABLE: turn 1\nDM: reply 1\nDM used heal: {"n":0}\nRESULT of heal: ok');
    expect(prompt).not.toContain('turn 9');
    expect(helper.requests[0]!.tools).toBeUndefined();
  });
  it('keeps everything if the helper returns nothing', async () => {
    expect(await compactHistory(longHistory(20), '', { provider: createMockProvider([{ text: '  ' }]), model: 'h' })).toBeNull();
  });
});

describe('characters and sessions', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });
  it('builds a party, including full-member companions with unique ids', () => {
    const answers = testAnswers();
    answers[1]!.companion = { name: 'Biscuit', description: 'a scruffy terrier', fullMember: true, archetype: 'infiltrator' };
    answers.push({ ...emptyAnswers(2), playerName: 'Jo', archetype: 'face', name: 'Brann', bump: 'CHA' });
    const party = buildParty(answers, world.archetypes, world.campaign);
    expect(party.map((p) => [p.id, p.archetypeName, p.isCompanion, p.playerName])).toEqual([
      ['pc-lyra-vance', 'Healer', false, 'Sam'],
      ['pc-brann', 'Knight', false, 'Alex'],
      ['pc-biscuit', 'Rogue', true, 'Alex'],
      ['pc-brann-2', 'Bard', false, 'Jo'],
    ]);
    expect(party[1]!.gear[0]).toBe('A notched war-axe');
    expect(party[2]!.profile.trait).toBe('Loyal companion of Brann');
  });
  it('lists what is missing and refuses incomplete characters', () => {
    expect(missingAnswers(emptyAnswers(0))).toEqual(['Player name', 'Archetype', 'Character name', 'Stat boost']);
    const a = { ...testAnswers()[0]!, companion: { name: '', description: '', fullMember: true, archetype: '' } };
    expect(missingAnswers(a)).toEqual(['Companion name', 'Companion archetype']);
    expect(() => buildParty([emptyAnswers(0)], world.archetypes, world.campaign)).toThrow(/is missing: Player name/);
    expect(() => buildParty([{ ...testAnswers()[0]!, archetype: 'wizard' }], world.archetypes, world.campaign)).toThrow(/Unknown archetype "wizard"/);
  });
  it('saves, lists, loads and deletes sessions, dropping provider-private data', async () => {
    const s = testSession();
    s.history.push({ role: 'assistant', content: [{ type: 'text', text: 'hi' }], raw: { provider: 'anthropic', model: 'm', content: [{ type: 'thinking' }] } });
    s.chat.push({ id: 'c1', kind: 'dm', text: 'hi' });
    await saveSession(s);
    const loaded = (await loadSession(s.id))!;
    expect(loaded.history[0]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'hi' }] });
    expect(loaded.state).toEqual(s.state);
    expect(loaded.chat).toEqual(s.chat);
    const other = createSession({ ...s, state: s.state, campaignTitle: 'Other', dm: s.dm, diceMode: 'physical' });
    await saveSession(other);
    const list = await listSessions();
    expect(list).toHaveLength(2);
    expect(list.find((x) => x.id === s.id)).toMatchObject({ campaignTitle: 'The Sunken Crown', party: ['Lyra Vance', 'Brann'], ended: false, act: 1 });
    await deleteSession(s.id);
    expect(await loadSession(s.id)).toBeNull();
    expect(await listSessions()).toHaveLength(1);
  });
  it('rejects corrupt sessions', () => {
    expect(() => parseSession({ version: 1 })).toThrow(/Not a valid TaleForge session/);
    expect(summarizeSession(testSession()).elapsedMs).toBe(0);
  });
  it('knows who rolls physical dice and formats the clock', () => {
    expect(usesPhysicalDice({ diceMode: 'physical', playerDice: {} }, 'a')).toBe(true);
    expect(usesPhysicalDice({ diceMode: 'digital', playerDice: { a: 'physical' } }, 'a')).toBe(false);
    expect(usesPhysicalDice({ diceMode: 'per_player', playerDice: { a: 'physical' } }, 'a')).toBe(true);
    expect(usesPhysicalDice({ diceMode: 'per_player', playerDice: {} }, 'b')).toBe(false);
    expect([formatClock(0), formatClock(61_000), formatClock(23 * 60_000 + 41_000)]).toEqual(['0:00', '1:01', '23:41']);
  });
});
