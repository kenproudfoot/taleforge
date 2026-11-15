import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/storage/db';
import { loadSettings } from '@/storage/settings';
import { resetSettingsStore, useSettings } from './settingsStore';

beforeEach(async () => {
  await resetDbForTests();
  resetSettingsStore();
});

describe('settings store', () => {
  it('loads, updates and persists', async () => {
    await useSettings.getState().load();
    expect(useSettings.getState().loaded).toBe(true);
    await useSettings.getState().update((d) => {
      d.keys.anthropic = 'sk-ant-1';
      d.setupComplete = true;
    });
    resetSettingsStore();
    await useSettings.getState().load();
    expect(useSettings.getState().settings).toMatchObject({ setupComplete: true, keys: { anthropic: 'sk-ant-1' } });
  });

  it('protects keys with a passphrase across reloads', async () => {
    const store = () => useSettings.getState();
    await store().load();
    await store().update((d) => void (d.keys.openai = 'sk-o-1'));
    await store().setPassphrase('pw');
    expect(store().encrypted).toBe(true);
    await store().update((d) => void (d.keys.gemini = 'g-1'));

    resetSettingsStore();
    await store().load();
    expect(store()).toMatchObject({ locked: true, encrypted: true });
    expect(store().settings.keys.openai).toBe('');
    await expect(store().setPassphrase(null)).rejects.toThrow(/Unlock/);
    await store().update((d) => void (d.audio.muted = true));
    await expect(store().unlock('nope')).rejects.toThrow('Wrong passphrase.');
    await store().unlock('pw');
    expect(store().locked).toBe(false);
    expect(store().settings.keys).toMatchObject({ openai: 'sk-o-1', gemini: 'g-1' });
    expect(store().settings.audio.muted).toBe(true);

    await store().setPassphrase(null);
    expect((await loadSettings()).settings.keys.openai).toBe('sk-o-1');
    expect((await loadSettings()).encrypted).toBe(false);
  });

  it('replace swaps the whole settings object', async () => {
    await useSettings.getState().load();
    const next = structuredClone(useSettings.getState().settings);
    next.dm.model = 'other';
    await useSettings.getState().replace(next);
    expect((await loadSettings()).settings.dm.model).toBe('other');
  });
});
