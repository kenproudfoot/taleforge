import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractJson } from '@/ai/helper';
import { createMockProvider, setProviderOverride } from '@/ai/providers';
import type { MockScript } from '@/ai/providers/mock';
import { ProviderError } from '@/ai/providers/types';
import { resetSettingsStore } from '@/app/settingsStore';
import { createSeededRng } from '@/engine/rng';
import { resetDbForTests } from '@/storage/db';
import { loadSession } from '@/storage/sessions';
import { onGameEvent, setGameRng, useGame } from './store';
import type { GameEvent } from './store';
import { testSession, testWorld } from './testing';

const world = testWorld();
const loaded = { pack: world.pack, source: 'bundled' as const, assetUrl: () => null };
const game = () => useGame.getState();

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  if (!check()) throw new Error('condition not reached');
}

function start(script: MockScript) {
  const mock = createMockProvider(script);
  setProviderOverride(mock);
  return { mock, done: game().begin(testSession(), loaded, world.core) };
}

beforeEach(async () => {
  await resetDbForTests();
  resetSettingsStore();
  setGameRng(createSeededRng(11));
});
afterEach(() => {
  game().close();
  setProviderOverride(null);
  setGameRng(null);
});

describe('game store', () => {
  it('begins a game: runs the opening turn, selects the addressed speaker and autosaves', async () => {
    const events: GameEvent[] = [];
    const off = onGameEvent((e) => events.push(e));
    const { done } = start([{ text: 'Dusk in Brinewick. Brann, what do you do?' }]);
    await done;
    off();
    expect(game().busy).toBe(false);
    expect(game().speaker).toBe('pc-brann');
    expect(game().session!.chat.map((e) => e.kind)).toEqual(['dm']);
    expect(events[0]).toEqual({ type: 'turn_started' });
    expect(events.at(-1)).toEqual({ type: 'turn_finished', ok: true });
    const finalText = events.filter((e) => e.type === 'dm_text').at(-1);
    expect(finalText).toMatchObject({ text: 'Dusk in Brinewick. Brann, what do you do?', done: true });
    const saved = await loadSession(game().session!.id);
    expect(saved!.chat).toHaveLength(1);
  });

  it('sends player input as the selected speaker and resolves a requested roll', async () => {
    const { mock, done } = start([
      { text: 'Lyra, what do you do?' },
      { text: 'The stones are slick.', toolCalls: [{ name: 'request_roll', input: { character: 'Brann', kind: 'check', stat: 'DEX', dc: 16, reason: 'cross the gap' } }] },
      { text: 'You make it across. Lyra?' },
    ]);
    await done;
    game().setSpeaker('pc-brann');
    const turn = game().send('  I jump the gap.  ');
    await until(() => game().session!.state.pendingRoll !== null);
    expect(game().speaker).toBe('pc-brann');
    expect(game().busy).toBe(true);
    game().submitDice([3]);
    expect(game().session!.state.pendingRoll).toMatchObject({ stage: 'heroic' });
    game().chooseHeroic('reroll');
    expect(game().session!.state.pendingRoll).toMatchObject({ stage: 'main', heroicSpent: 'reroll' });
    game().submitDice([19]);
    await turn;
    expect(game().session!.state.pendingRoll).toBeNull();
    expect(game().session!.state.party[1]!.heroicPoints).toBe(0);
    expect(game().session!.chat.map((e) => e.kind)).toEqual(['dm', 'player', 'dm', 'roll', 'dm']);
    expect(game().session!.chat[1]).toMatchObject({ characterId: 'pc-brann', text: 'I jump the gap.' });
    expect(game().speaker).toBe('pc-lyra-vance');
    expect(mock.requests).toHaveLength(3);
  });

  it('ignores empty input and input while busy', async () => {
    const { mock, done } = start([{ text: 'Hello.' }, { text: 'Again.' }]);
    await done;
    await game().send('   ');
    expect(mock.requests).toHaveLength(1);
    const first = game().send('one');
    await game().send('two');
    await first;
    expect(mock.requests).toHaveLength(2);
  });

  it('retries the same turn after a provider error', async () => {
    const { mock, done } = start([{ text: 'Hello. Brann?' }, { error: new ProviderError('server', 'boom', 500) }, { text: 'The door opens.' }]);
    await done;
    await game().send('I open the door.');
    expect(game().session!.chat.at(-1)).toMatchObject({ kind: 'error' });
    expect(game().session!.chat).toHaveLength(2);
    await game().retry();
    expect(game().session!.chat.map((e) => e.kind)).toEqual(['dm', 'player', 'dm']);
    expect(mock.requests).toHaveLength(3);
    expect(JSON.stringify(mock.requests[2]!.messages.at(-1))).toContain('I open the door.');
  });

  it('shows free rolls in the chat without calling the DM', async () => {
    const { mock, done } = start([{ text: 'Hello.' }]);
    await done;
    game().freeRoll('2d6+1', 'pc-brann');
    game().freeRoll('not dice');
    const entry = game().session!.chat.at(-1)!;
    expect(entry).toMatchObject({ kind: 'roll', free: true, report: { rollerName: 'Brann', reason: 'Free roll: 2d6+1' } });
    if (entry.kind === 'roll') {
      expect(entry.report.check.dice).toHaveLength(2);
      expect(entry.report.check.total).toBe(entry.report.check.dice.reduce((a, b) => a + b, 0) + 1);
    }
    expect(game().session!.chat).toHaveLength(2);
    expect(mock.requests).toHaveLength(1);
  });

  it('tracks play time, pausing, dice mode, model switches and milestone boosts', async () => {
    const { mock, done } = start([{ text: 'Hello.' }, { toolCalls: [{ name: 'advance_progress', input: { advance_act: true } }] }, { text: 'Act two.' }]);
    await done;
    game().tick(5000);
    game().setPaused(true);
    game().tick(5000);
    expect(game().session!.state.elapsedMs).toBe(5000);
    game().setPaused(false);
    game().setDiceMode('per_player', { 'pc-brann': 'physical' });
    game().setDmModel('openai', 'gpt-x');
    expect(game().session).toMatchObject({ diceMode: 'per_player', playerDice: { 'pc-brann': 'physical' }, dm: { provider: 'openai', model: 'gpt-x' } });
    await game().send('Onward.');
    expect(mock.requests[1]!.model).toBe('gpt-x');
    expect(game().session!.state.actIndex).toBe(1);
    game().boost('pc-brann', 'STR');
    expect(game().session!.state.party[1]!.stats.STR).toBe(4);
    expect(game().session!.chat.at(-1)).toMatchObject({ kind: 'chip', text: 'Brann grows stronger: +1 STR' });
  });

  it('does not run turns after the campaign has ended, and close() clears everything', async () => {
    const { mock, done } = start([{ text: 'The end.', toolCalls: [{ name: 'end_campaign', input: { outcome: 'victory', epilogue_hint: 'x' } }] }, { text: 'Epilogue.' }]);
    await done;
    await game().send('More?');
    expect(mock.requests).toHaveLength(2);
    game().tick(1000);
    expect(game().session!.state.elapsedMs).toBe(0);
    game().close();
    expect(game().session).toBeNull();
  });

  it('reports a missing save when opening', async () => {
    await game().open('nope');
    expect(game().loadError).toBe('That saved game no longer exists.');
  });
});

describe('extractJson', () => {
  it('finds JSON in fences or prose', () => {
    expect(extractJson('Here you go:\n```json\n{"name":"Lyra"}\n```')).toEqual({ name: 'Lyra' });
    expect(extractJson('Sure! ["a","b"] hope that helps')).toEqual(['a', 'b']);
    expect(extractJson('no json')).toBeNull();
    expect(extractJson('{broken')).toBeNull();
  });
});
