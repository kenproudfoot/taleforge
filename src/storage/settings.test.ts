import { beforeEach, describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './crypto';
import { kvDelete, kvGet, kvSet, resetDbForTests } from './db';
import { defaultSettings, exportSettings, importSettings, loadSettings, maskKey, saveSettings, saveSettingsLocked, settingsSchema, unlockKeys } from './settings';

beforeEach(async () => {
  await resetDbForTests();
});

describe('defaults', () => {
  it('produces a complete settings object from nothing', () => {
    const s = defaultSettings();
    expect(s.dm).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', toolMode: 'native' });
    expect(s.helper.model).toBe('claude-haiku-5-5');
    expect(s.keys).toEqual({ anthropic: '', openai: '', gemini: '', openrouter: '', elevenlabs: '' });
    expect(s.image.custom.bodyTemplate).toContain('{{prompt}}');
    expect(s.setupComplete).toBe(false);
  });
  it('fills in missing fields of partial data', () => {
    const s = settingsSchema.parse({ dm: { model: 'gpt-x', provider: 'openai' }, audio: { muted: true } });
    expect(s.dm).toMatchObject({ provider: 'openai', model: 'gpt-x', effort: 'low' });
    expect(s.audio).toMatchObject({ muted: true, musicVolume: 0.45 });
  });
});

describe('persistence', () => {
  it('round-trips through IndexedDB', async () => {
    const s = defaultSettings();
    s.keys.anthropic = 'sk-ant-secret';
    s.setupComplete = true;
    await saveSettings(s);
    expect(await loadSettings()).toEqual({ settings: s, locked: false, encrypted: false });
  });
  it('falls back to defaults when the stored value is corrupt', async () => {
    await kvSet('settings', { settings: { dm: { provider: 'nope' } } });
    expect((await loadSettings()).settings).toEqual(defaultSettings());
  });
  it('kv helpers work', async () => {
    await kvSet('a', { x: 1 });
    expect(await kvGet('a')).toEqual({ x: 1 });
    await kvDelete('a');
    expect(await kvGet('a')).toBeUndefined();
  });
});

describe('passphrase protection', () => {
  it('never stores keys in the clear and unlocks with the right passphrase', async () => {
    const s = defaultSettings();
    s.keys.openai = 'sk-openai-secret';
    await saveSettings(s, 'correct horse');
    const raw = JSON.stringify(await kvGet('settings'));
    expect(raw).not.toContain('sk-openai-secret');
    const loaded = await loadSettings();
    expect(loaded).toMatchObject({ locked: true, encrypted: true });
    expect(loaded.settings.keys.openai).toBe('');
    expect((await unlockKeys('correct horse')).openai).toBe('sk-openai-secret');
    await expect(unlockKeys('wrong')).rejects.toThrow('Wrong passphrase.');
  });
  it('saving while locked keeps the encrypted keys intact', async () => {
    const s = defaultSettings();
    s.keys.openai = 'sk-openai-secret';
    await saveSettings(s, 'pw');
    const locked = (await loadSettings()).settings;
    locked.audio.muted = true;
    await saveSettingsLocked(locked);
    expect((await loadSettings()).settings.audio.muted).toBe(true);
    expect((await unlockKeys('pw')).openai).toBe('sk-openai-secret');
  });
  it('unlock fails clearly when nothing is encrypted', async () => {
    await saveSettings(defaultSettings());
    await expect(unlockKeys('x')).rejects.toThrow(/not passphrase-protected/);
  });
  it('crypto helpers round-trip and reject empty passphrases', async () => {
    const blob = await encryptJson({ a: [1, 2, 3] }, 'pw');
    expect(await decryptJson(blob, 'pw')).toEqual({ a: [1, 2, 3] });
    await expect(encryptJson({}, '')).rejects.toThrow(/required/);
  });
});

describe('export and import', () => {
  const now = new Date('2026-11-14T19:05:00Z');
  function configured() {
    const s = defaultSettings();
    s.keys.anthropic = 'sk-ant-secret';
    s.keys.openai = 'sk-openai-secret';
    s.image.custom.authValue = 'Bearer custom-secret';
    s.dm.model = 'claude-opus-5-5';
    s.voice.speed = 1.25;
    s.setupComplete = true;
    return s;
  }
  it('leaves keys out by default', () => {
    const json = exportSettings(configured(), { includeKeys: false }, now);
    expect(json).not.toContain('secret');
    expect(JSON.parse(json)).toMatchObject({ app: 'taleforge', kind: 'settings', exportedAt: '2026-11-14T19:05:00.000Z', includesKeys: false });
  });
  it('round-trips everything when keys are included', () => {
    const s = configured();
    expect(importSettings(exportSettings(s, { includeKeys: true }, now), defaultSettings())).toEqual(s);
  });
  it('keeps the keys already on this device when the file has none', () => {
    const s = configured();
    const current = defaultSettings();
    current.keys.anthropic = 'sk-existing';
    current.image.custom.authValue = 'existing-auth';
    const next = importSettings(exportSettings(s, { includeKeys: false }, now), current);
    expect(next.keys.anthropic).toBe('sk-existing');
    expect(next.keys.openai).toBe('');
    expect(next.image.custom.authValue).toBe('existing-auth');
    expect(next.dm.model).toBe('claude-opus-5-5');
    expect(next.voice.speed).toBe(1.25);
  });
  it('rejects files that are not settings exports', () => {
    expect(() => importSettings('nope', defaultSettings())).toThrow('That file is not valid JSON.');
    expect(() => importSettings('{"app":"other"}', defaultSettings())).toThrow(/not a TaleForge settings export/);
    const bad = JSON.stringify({ app: 'taleforge', kind: 'settings', settings: { voice: { speed: 9 } } });
    expect(() => importSettings(bad, defaultSettings())).toThrow(/invalid value at "voice.speed"/);
  });
});

describe('maskKey', () => {
  it('shows only the tail', () => {
    expect(maskKey('')).toBe('');
    expect(maskKey('short')).toBe('••••');
    expect(maskKey('sk-ant-abcdef1234')).toBe('••••1234');
  });
});
