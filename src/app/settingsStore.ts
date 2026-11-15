import { create } from 'zustand';
import { defaultSettings, loadSettings, saveSettings, saveSettingsLocked, unlockKeys } from '@/storage/settings';
import type { Settings } from '@/storage/settings';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  /** Keys are passphrase-protected and not yet unlocked in this session. */
  locked: boolean;
  encrypted: boolean;
  /** Held in memory only, so that later saves can re-encrypt the keys. */
  passphrase: string | null;
  load(): Promise<void>;
  /** Applies a change to a draft copy, then persists it. */
  update(change: (draft: Settings) => void): Promise<void>;
  replace(settings: Settings): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  /** Turns passphrase protection on (a string) or off (null). */
  setPassphrase(passphrase: string | null): Promise<void>;
}

/** Writes are queued so that a slow earlier save can never overwrite a later one. */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue(write: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(write, write);
  writeQueue = next.catch(() => undefined);
  return next;
}

export const useSettings = create<SettingsState>((set, get) => {
  // Each write reads the newest settings and protection state when it runs, so a save queued before the
  // keys were encrypted can never land afterwards and write them back in the clear.
  const persist = (_settings?: Settings) =>
    enqueue(() => {
      const { settings, locked, passphrase } = get();
      return locked ? saveSettingsLocked(settings) : saveSettings(settings, passphrase ?? undefined);
    });
  return {
    settings: defaultSettings(),
    loaded: false,
    locked: false,
    encrypted: false,
    passphrase: null,
    async load() {
      await writeQueue;
      const { settings, locked, encrypted } = await loadSettings();
      set({ settings, locked, encrypted, loaded: true, passphrase: null });
    },
    async update(change) {
      const draft = structuredClone(get().settings);
      change(draft);
      set({ settings: draft });
      await persist(draft);
    },
    async replace(settings) {
      set({ settings });
      await persist(settings);
    },
    async unlock(passphrase) {
      const keys = await unlockKeys(passphrase);
      set({ settings: { ...get().settings, keys }, locked: false, passphrase });
    },
    async setPassphrase(passphrase) {
      if (get().locked) throw new Error('Unlock your keys first.');
      set({ passphrase, encrypted: passphrase !== null });
      await persist(get().settings);
    },
  };
});

/** Test helper: back to a pristine, unloaded store. */
export function resetSettingsStore(): void {
  useSettings.setState({ settings: defaultSettings(), loaded: false, locked: false, encrypted: false, passphrase: null });
}
