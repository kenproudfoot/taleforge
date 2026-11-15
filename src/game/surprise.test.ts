import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockProvider, setProviderOverride } from '@/ai/providers';
import { resetSettingsStore } from '@/app/settingsStore';
import { suggestNames, surpriseFields } from './surprise';
import { testAnswers, testWorld } from './testing';

const world = testWorld();
const healer = world.archetypes.find((a) => a.id === 'medic');

beforeEach(() => resetSettingsStore());
afterEach(() => setProviderOverride(null));

describe('surprise me', () => {
  it('fills the requested fields from the helper reply and sends campaign context', async () => {
    const mock = createMockProvider([{ text: '```json\n{"outfit": "A salt-stiff oilskin over a healer\'s apron.", "flaw": "Afraid of deep water", "extra": "ignored"}\n```' }]);
    setProviderOverride(mock);
    const out = await surpriseFields(world.pack, healer, testAnswers()[0]!, ['outfit', 'flaw']);
    expect(out).toEqual({ outfit: "A salt-stiff oilskin over a healer's apron.", flaw: 'Afraid of deep water' });
    const req = mock.requests[0]!;
    const prompt = (req.messages[0]!.content[0] as { text: string }).text;
    expect(prompt).toContain('Campaign: The Sunken Crown (medieval-fantasy)');
    expect(prompt).toContain('Role: Healer.');
    expect(prompt).toContain('name: Lyra Vance');
    expect(prompt).toContain('"outfit": outfit and style in one sentence');
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.tools).toBeUndefined();
  });
  it('does nothing for an empty request and fails clearly on junk', async () => {
    expect(await surpriseFields(world.pack, healer, testAnswers()[0]!, [])).toEqual({});
    setProviderOverride(createMockProvider([{ text: 'I cannot do that.' }, { text: '{"outfit": 5}' }]));
    await expect(surpriseFields(world.pack, healer, testAnswers()[0]!, ['outfit'])).rejects.toThrow(/usable answer/);
    await expect(surpriseFields(world.pack, undefined, testAnswers()[0]!, ['outfit'])).rejects.toThrow(/usable answer/);
  });
  it('suggests names', async () => {
    setProviderOverride(createMockProvider([{ text: '["Mara Tidewell", "Iseult Brine", "", 7, "Corrin Holt", "Wren", "Tam", "Extra"]' }, { text: 'none' }]));
    expect(await suggestNames(world.pack, healer, testAnswers()[0]!)).toEqual(['Mara Tidewell', 'Iseult Brine', 'Corrin Holt', 'Wren', 'Tam']);
    await expect(suggestNames(world.pack, healer, testAnswers()[0]!)).rejects.toThrow(/any names/);
  });
});
