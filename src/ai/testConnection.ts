import type { ApiKeyName } from '@/storage/settings';
import { providerFetch } from './providers/http';
import { EMPTY_KEYS, getTextProvider } from './providers';

/** Checks that a key works by making a cheap read-only call. Resolves with a short success message. */
export async function testKey(name: ApiKeyName, key: string): Promise<string> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error('Enter a key first.');
  if (name === 'elevenlabs') {
    const res = await providerFetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': trimmed } });
    const data = (await res.json()) as { voices?: unknown[] };
    return `Connected: ${data.voices?.length ?? 0} voices available.`;
  }
  const models = await getTextProvider(name, { ...EMPTY_KEYS, [name]: trimmed }).listModels();
  return `Connected: ${models.length} models available.`;
}
