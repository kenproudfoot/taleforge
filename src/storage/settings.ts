import { z } from 'zod';
import { decryptJson, encryptJson } from './crypto';
import type { EncryptedBlob } from './crypto';
import { kvGet, kvSet } from './db';

const textProvider = z.enum(['anthropic', 'openai', 'gemini', 'openrouter']);

const keysSchema = z.object({
  anthropic: z.string().default(''),
  openai: z.string().default(''),
  gemini: z.string().default(''),
  openrouter: z.string().default(''),
  elevenlabs: z.string().default(''),
});

/**
 * Every field has a default, so older saves and partial imports always parse into a complete object.
 * Model ids here are only starting points: the app fetches each provider's live model list and the user
 * picks from it.
 */
export const settingsSchema = z.object({
  version: z.literal(1).default(1),
  setupComplete: z.boolean().default(false),
  keys: keysSchema.default(() => keysSchema.parse({})),
  dm: z
    .object({
      provider: textProvider.default('anthropic'),
      model: z.string().default('claude-sonnet-5-5'),
      effort: z.enum(['low', 'medium', 'high']).default('low'),
      toolMode: z.enum(['native', 'json']).default('native'),
    })
    .prefault({}),
  helper: z.object({ provider: textProvider.default('anthropic'), model: z.string().default('claude-haiku-5-5') }).prefault({}),
  voice: z
    .object({
      enabled: z.boolean().default(true),
      provider: z.enum(['auto', 'openai', 'elevenlabs', 'browser']).default('auto'),
      model: z.string().default(''),
      narratorVoice: z.string().default(''),
      speed: z.number().min(0.5).max(2).default(1),
      npcVoices: z.boolean().default(true),
    })
    .prefault({}),
  speech: z
    .object({
      provider: z.enum(['auto', 'webspeech', 'openai']).default('auto'),
      mode: z.enum(['push', 'toggle']).default('push'),
      autoSend: z.boolean().default(false),
      model: z.string().default(''),
    })
    .prefault({}),
  image: z
    .object({
      provider: z.enum(['auto', 'none', 'openai', 'gemini', 'custom']).default('auto'),
      model: z.string().default(''),
      /** GPT Image quality: the biggest lever on picture cost (high is roughly four times medium). */
      quality: z.enum(['low', 'medium', 'high']).default('medium'),
      concurrency: z.number().int().min(1).max(4).default(2),
      /** Scene pictures move in 2.5D (a depth map made in the browser, once per picture). */
      parallax: z.boolean().default(true),
      custom: z
        .object({
          url: z.string().default(''),
          authHeader: z.string().default('Authorization'),
          authValue: z.string().default(''),
          bodyTemplate: z.string().default('{"prompt": "{{prompt}}", "width": {{width}}, "height": {{height}}}'),
          responsePath: z.string().default('data.0.b64_json'),
        })
        .prefault({}),
    })
    .prefault({}),
  audio: z
    .object({
      musicVolume: z.number().min(0).max(1).default(0.45),
      sfxVolume: z.number().min(0).max(1).default(0.7),
      muted: z.boolean().default(false),
    })
    .prefault({}),
  dice: z.object({ mode: z.enum(['digital', 'physical', 'per_player']).default('digital') }).prefault({}),
  playtest: z
    .object({
      /** Record each game's playtest log (turn timings, problems, feedback) with the saved game. */
      enabled: z.boolean().default(true),
    })
    .prefault({}),
  costs: z
    .object({
      /** USD per picture, replacing the built-in estimate (0 for a local service). */
      picture: z.number().min(0).nullable().default(null),
      /** USD per million characters of narration, replacing the built-in estimate. */
      voicePerMillionChars: z.number().min(0).nullable().default(null),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type ApiKeyName = keyof Settings['keys'];

export function defaultSettings(): Settings {
  return settingsSchema.parse({});
}

const SETTINGS_KEY = 'settings';

interface StoredSettings {
  settings: Settings;
  /** Present when the keys are protected by a passphrase; `settings.keys` is then blank on disk. */
  encryptedKeys?: EncryptedBlob;
}

const blankKeys = (): Settings['keys'] => keysSchema.parse({});

export interface LoadedSettings {
  settings: Settings;
  /** True when keys are passphrase-protected and have not been unlocked yet. */
  locked: boolean;
  encrypted: boolean;
}

export async function loadSettings(): Promise<LoadedSettings> {
  const stored = await kvGet<StoredSettings>(SETTINGS_KEY);
  if (!stored) return { settings: defaultSettings(), locked: false, encrypted: false };
  const parsed = settingsSchema.safeParse(stored.settings);
  const settings = parsed.success ? parsed.data : defaultSettings();
  return { settings, locked: !!stored.encryptedKeys, encrypted: !!stored.encryptedKeys };
}

/** Saves settings. With a passphrase the API keys are stored encrypted and never written in the clear. */
export async function saveSettings(settings: Settings, passphrase?: string): Promise<void> {
  const clean = settingsSchema.parse(settings);
  if (passphrase) {
    const encryptedKeys = await encryptJson(clean.keys, passphrase);
    await kvSet(SETTINGS_KEY, { settings: { ...clean, keys: blankKeys() }, encryptedKeys } satisfies StoredSettings);
  } else {
    await kvSet(SETTINGS_KEY, { settings: clean } satisfies StoredSettings);
  }
}

/** Saves non-key settings while the keys are still locked, leaving the encrypted keys untouched. */
export async function saveSettingsLocked(settings: Settings): Promise<void> {
  const stored = await kvGet<StoredSettings>(SETTINGS_KEY);
  const clean = settingsSchema.parse(settings);
  await kvSet(SETTINGS_KEY, { settings: { ...clean, keys: blankKeys() }, encryptedKeys: stored?.encryptedKeys } satisfies StoredSettings);
}

/** Decrypts the stored keys. Throws "Wrong passphrase." if it does not match. */
export async function unlockKeys(passphrase: string): Promise<Settings['keys']> {
  const stored = await kvGet<StoredSettings>(SETTINGS_KEY);
  if (!stored?.encryptedKeys) throw new Error('The stored keys are not passphrase-protected.');
  return keysSchema.parse(await decryptJson(stored.encryptedKeys, passphrase));
}

export interface SettingsExport {
  app: 'taleforge';
  kind: 'settings';
  exportedAt: string;
  includesKeys: boolean;
  settings: Settings;
}

/** Serializes settings for download. API keys are left out unless explicitly included. */
export function exportSettings(settings: Settings, options: { includeKeys: boolean }, now = new Date()): string {
  const out: SettingsExport = {
    app: 'taleforge',
    kind: 'settings',
    exportedAt: now.toISOString(),
    includesKeys: options.includeKeys,
    settings: options.includeKeys
      ? settings
      : { ...settings, keys: blankKeys(), image: { ...settings.image, custom: { ...settings.image.custom, authValue: '' } } },
  };
  return JSON.stringify(out, null, 2);
}

/** Parses an exported settings file. Keys already on this device are kept when the file has none. */
export function importSettings(json: string, current: Settings): Settings {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = data as Partial<SettingsExport>;
  if (file?.app !== 'taleforge' || file.kind !== 'settings' || !file.settings) throw new Error('That file is not a TaleForge settings export.');
  const parsed = settingsSchema.safeParse(file.settings);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`The settings file has an invalid value at "${first?.path.join('.')}": ${first?.message}`);
  }
  const next = parsed.data;
  const keys = { ...next.keys };
  for (const name of Object.keys(keys) as ApiKeyName[]) if (!keys[name]) keys[name] = current.keys[name];
  const authValue = next.image.custom.authValue || current.image.custom.authValue;
  return { ...next, keys, image: { ...next.image, custom: { ...next.image.custom, authValue } } };
}

/** Shows only the last four characters of a key. */
export function maskKey(key: string): string {
  if (!key) return '';
  return key.length <= 8 ? '••••' : `••••${key.slice(-4)}`;
}
