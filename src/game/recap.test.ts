import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockProvider, setProviderOverride } from '@/ai/providers';
import { resetSettingsStore } from '@/app/settingsStore';
import { applyToolCall } from '@/engine/tools';
import { createSeededRng } from '@/engine/rng';
import { resetDbForTests } from '@/storage/db';
import { exportSession, imageKeysOf, importSession } from '@/storage/backup';
import { loadSession, saveSession } from '@/storage/sessions';
import { RECAP_SYSTEM, buildRecap, fallbackProse, localIso, parseProse, parseRecap, recapFileName, recapRequest, sessionFromRecap, transcript } from './recap';
import { setGameRng, useGame } from './store';
import { testSession, testWorld } from './testing';
import type { Session } from './session';

const world = testWorld();
const rng = createSeededRng(3);

/** A session part-way through act 2, with a roster, clues, items, damage and a resource spent. */
function playedSession(): Session {
  let s = testSession();
  const apply = (name: string, input: unknown) => {
    s = { ...s, state: applyToolCall(s.state, world.campaign, { name, input }, rng).state };
  };
  apply('roster_add', { id: 'elder-maren' });
  apply('advance_progress', { beat: 'brinewick-at-dusk', milestone: true });
  apply('scene_change', { location: 'causeway' });
  apply('roster_add', { id: 'tide-wight' });
  apply('apply_damage', { target: 'Brann', amount: 6, reason: 'boat-hook' });
  apply('add_condition', { target: 'Lyra Vance', condition: 'Soaked' });
  apply('record_clue', { text: 'A grappling iron stamped with a V' });
  apply('give_item', { name: 'Tide-clock', to: 'Lyra Vance' });
  apply('adjust_resource', { resource: 'tide', delta: -2, reason: 'time' });
  apply('encounter_result', { encounter_id: 'causeway-wights', outcome: 'won' });
  apply('roster_remove', { id: 'tide-wight', reason: 'defeated' });
  apply('advance_progress', { beat: 'the-causeway', milestone: true });
  s = { ...s, state: { ...s.state, elapsedMs: 27 * 60_000 + 12_000 } };
  s.chat.push(
    { id: 'd1', kind: 'dm', text: 'Dusk in Brinewick. «Elder Maren: You came.» Lyra, what do you do?' },
    { id: 'p1', kind: 'player', characterId: 'pc-lyra-vance', text: 'I take the clock.' },
    { id: 'c1', kind: 'chip', text: 'Clue found: A grappling iron stamped with a V', tone: 'info' },
  );
  return s;
}

const PROSE_REPLY = `# Story so far
- The party met Elder Maren and took her tide-clock.
- They crossed the causeway and beat back a tide-wight.
# Where we are now
causeway: the party stands at the end of the causeway, facing the Gate of Bells.
# Open threads & clues
- Someone with a V crest is ahead of them.
# NPC attitudes
- elder-maren: friendly, she sent them.
# Next beat
Introduce the Gate of Bells and Brother Osric.`;

beforeEach(async () => {
  await resetDbForTests();
  resetSettingsStore();
});
/** Opens a session in the store without fetching content over the network. */
function openInStore(session: Session) {
  useGame.setState({ session, pack: world.pack, core: world.core, campaign: world.campaign, assetUrl: () => null, speaker: session.state.party[0]!.id });
}

afterEach(() => {
  setProviderOverride(null);
  setGameRng(null);
  useGame.getState().close();
});

describe('recap.md', () => {
  it('round-trips: save -> recap -> load gives an identical engine state', () => {
    const s = playedSession();
    const recap = buildRecap(s, world.campaign, parseProse(PROSE_REPLY, fallbackProse(s, world.campaign)), new Date('2026-11-14T19:05:00Z'));
    const parsed = parseRecap(recap);
    expect(parsed.state).toEqual(s.state);
    expect(parsed.campaignId).toBe('the-sunken-crown');
    expect(parsed.title).toBe('The Sunken Crown');
    const restored = sessionFromRecap(parsed, { dm: { provider: 'mock', model: 'm' }, diceMode: 'physical', campaignTitle: 'The Sunken Crown' });
    expect(restored.state).toEqual(s.state);
    expect(restored.id).not.toBe(s.id);
    expect(restored.summary).toContain('The party met Elder Maren');
    expect(restored.summary).toContain('# Progress');
    expect(restored.summary).not.toContain('Engine state');
    expect(restored.chat).toEqual([expect.objectContaining({ kind: 'chip', text: expect.stringMatching(/^Resumed from a recap saved/) })]);
    expect(restored.diceMode).toBe('physical');
  });

  it('follows the documented layout', () => {
    const s = playedSession();
    const recap = buildRecap(s, world.campaign, parseProse(PROSE_REPLY, fallbackProse(s, world.campaign)), new Date('2026-11-14T19:05:00Z'));
    expect(recap.startsWith('---\nrecap_version: 1\ncampaign: the-sunken-crown\ntitle: "The Sunken Crown"\nsaved_at: ')).toBe(true);
    expect(recap).toMatch(/elapsed_minutes: 27\nact: 2\n---/);
    const headings = [...recap.matchAll(/^# (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(['Story so far', 'The party', 'Where we are now', 'Open threads & clues', 'NPC attitudes', 'Progress', 'Next beat', 'Engine state']);
    expect(recap).toContain('- **Brann** (Knight, played by Alex): HP 16/22; Heroic Points 1. Gear: A notched war-axe, Longsword or war-axe, Shield and mail, Oilskin cloak. Companion: Biscuit.');
    expect(recap).toContain('conditions: Soaked');
    expect(recap).toContain('Tide-clock');
    expect(recap).toContain('- Act 2 of 3: The Drowned City.');
    expect(recap).toContain('- Encounters: causeway-wights won.');
    expect(recap).toContain('- Tide: 4/6.');
    expect(recap).toContain('Introduce the Gate of Bells');
  });

  it('falls back to the facts it knows when the helper writes nothing useful', () => {
    const s = playedSession();
    const prose = parseProse('Sorry, I cannot.', fallbackProse(s, world.campaign));
    expect(prose['Where we are now']).toBe('The Dead Tide Causeway (causeway). Present: Elder Maren Holt.');
    expect(prose['Open threads & clues']).toBe('- A grappling iron stamped with a V');
    expect(prose['NPC attitudes']).toContain('- tide-wight: hostile (defeated).');
    expect(prose['Next beat']).toBe('gate-of-bells.');
    expect(prose['Story so far']).toContain('Dusk in Brinewick.');
    expect(parseProse('# Open Threads and Clues\n- x', prose)['Open threads & clues']).toBe('- x');
  });

  it('rejects files that are not recaps, with a reason', () => {
    expect(() => parseRecap('# Just notes')).toThrow(/not a TaleForge recap/);
    expect(() => parseRecap('---\nrecap_version: 1\ncampaign: x\n---\n# Story so far\n- hi')).toThrow(/no "Engine state" block/);
    expect(() => parseRecap('---\nrecap_version: 1\ncampaign: x\n---\n# Engine state\n```json\n{"version": 9}\n```')).toThrow(/engine state is damaged/);
    const s = playedSession();
    const recap = buildRecap(s, world.campaign, fallbackProse(s, world.campaign));
    expect(() => parseRecap(recap.replace('campaign: the-sunken-crown', 'campaign: other'))).toThrow(/different campaign/);
  });

  it('gives the helper the transcript and the state it needs', () => {
    const s = playedSession();
    const text = transcript(s.chat, s.state);
    expect(text).toBe('DM: Dusk in Brinewick. Elder Maren: "You came." Lyra, what do you do?\nLyra Vance: I take the clock.\n[Clue found: A grappling iron stamped with a V]');
    expect(transcript(s.chat, s.state, 20).startsWith('…\n')).toBe(true);
    const req = recapRequest(s, world.pack, world.campaign);
    expect(req).toContain('Current location: The Dead Tide Causeway (causeway). Act 2');
    expect(req).toContain('Beats left in this act: gate-of-bells, varrs-bargain, the-reliquary');
    expect(req).toContain('Elder Maren Holt [elder-maren, ally]');
    expect(RECAP_SYSTEM).toContain('# Next beat');
  });

  it('formats local times and file names', () => {
    expect(localIso(new Date())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(recapFileName(playedSession())).toMatch(/^the-sunken-crown-recap-\d{4}-\d\d-\d\d-\d\d-\d\d\.md$/);
  });
});

describe('store: recap writing and resuming', () => {
  it('writes a recap with the helper model and stores it with the session', async () => {
    const mock = createMockProvider((req) => (req.tools?.length ? { text: 'The fog lifts. Brann, what now?' } : { text: PROSE_REPLY }));
    setProviderOverride(mock);
    const s = playedSession();
    await saveSession(s);
    openInStore(s);
    const recap = await useGame.getState().writeRecap();
    expect(recap).toContain('Introduce the Gate of Bells');
    expect((await loadSession(s.id))!.recap).toBe(recap);
    const helperReq = mock.requests.at(-1)!;
    expect(helperReq.system[0]!.text).toBe(RECAP_SYSTEM);
  });

  it('resumes a restored game with a recap turn that briefs the DM', async () => {
    const mock = createMockProvider((req) => (req.tools?.length ? { text: 'Where were we? You stand before the Gate of Bells. Brann?' } : { text: '' }));
    setProviderOverride(mock);
    const s = playedSession();
    const restored = sessionFromRecap(parseRecap(buildRecap(s, world.campaign, parseProse(PROSE_REPLY, fallbackProse(s, world.campaign)))), { dm: { provider: 'mock', model: 'm' }, diceMode: 'digital', campaignTitle: 'The Sunken Crown' });
    await saveSession(restored);
    openInStore(restored);
    await useGame.getState().resume();
    const req = mock.requests[0]!;
    const first = JSON.stringify(req.messages[0]);
    expect(first).toContain('<story_so_far>');
    expect(first).toContain('The party met Elder Maren');
    expect(JSON.stringify(req.messages.at(-1))).toContain('session resumes after a break');
    expect(useGame.getState().session!.chat.at(-1)).toMatchObject({ kind: 'dm', text: expect.stringContaining('Gate of Bells') });
    expect(useGame.getState().speaker).toBe('pc-brann');
  });

  it('writes a final recap automatically when the campaign ends', async () => {
    setProviderOverride(
      createMockProvider((req) =>
        req.tools?.length
          ? req.messages.length < 3
            ? { text: 'The bell rings.', toolCalls: [{ name: 'end_campaign', input: { outcome: 'victory', epilogue_hint: 'x' } }] }
            : { text: 'Dawn.' }
          : { text: PROSE_REPLY },
      ),
    );
    const s = testSession();
    await useGame.getState().begin(s, { pack: world.pack, source: 'bundled', assetUrl: () => null }, world.core);
    for (let i = 0; i < 50 && !useGame.getState().session?.recap; i++) await new Promise((r) => setTimeout(r, 5));
    expect(useGame.getState().session!.recap).toContain('The campaign has ended: victory');
  });
});

describe('session backups', () => {
  it('exports and imports a game with its pictures', async () => {
    const s = playedSession();
    s.images = { ...s.images, portraits: { 'pc-brann': 'img-a' }, current: 'img-b', cards: { 'pc-brann': 'img-a-card' } };
    s.chat.push({ id: 'i1', kind: 'image', imageKey: 'img-c', caption: 'the gate' });
    s.history.push({ role: 'assistant', content: [{ type: 'text', text: 'hi' }], raw: { provider: 'anthropic', model: 'm', content: [{ type: 'thinking' }] } });
    expect(imageKeysOf(s).sort()).toEqual(['img-a', 'img-a-card', 'img-b', 'img-c']);
    const blobs: Record<string, Blob> = { 'img-a': new Blob([new Uint8Array([1, 2])], { type: 'image/png' }), 'img-b': new Blob([new Uint8Array([3])], { type: 'image/jpeg' }) };
    const json = await exportSession(s, async (k) => blobs[k] ?? null);
    const restoredImages: Record<string, Blob> = {};
    const back = await importSession(json, async (k, b) => void (restoredImages[k] = b));
    expect(back.state).toEqual(s.state);
    expect(back.chat).toEqual(s.chat);
    expect(back.history[0]).not.toHaveProperty('raw');
    expect(Object.keys(restoredImages).sort()).toEqual(['img-a', 'img-b']);
    expect(restoredImages['img-b']!.type).toBe('image/jpeg');
  });
  it('rejects other files', async () => {
    await expect(importSession('nope')).rejects.toThrow('not valid JSON');
    await expect(importSession('{"app":"taleforge","kind":"settings"}')).rejects.toThrow('not a TaleForge game backup');
    await expect(importSession('{"app":"taleforge","kind":"session","session":{"version":1}}')).rejects.toThrow(/Not a valid TaleForge session/);
  });
});
