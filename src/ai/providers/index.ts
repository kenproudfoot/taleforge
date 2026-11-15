import { createAnthropicProvider } from './anthropic';
import { createGeminiProvider } from './gemini';
import { createOpenAiProvider, createOpenRouterProvider } from './openai';
import { ProviderError } from './types';
import type { TextProvider, TextProviderId } from './types';

export * from './types';
export { withJsonTools } from './jsonTools';
export { createMockProvider } from './mock';

export type ApiKeys = Record<'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'elevenlabs', string>;
export const EMPTY_KEYS: ApiKeys = { anthropic: '', openai: '', gemini: '', openrouter: '', elevenlabs: '' };

let testOverride: TextProvider | null = null;

/** Tests and the offline demo route every text request to one scripted provider. */
export function setProviderOverride(provider: TextProvider | null): void {
  testOverride = provider;
}

export function getProviderOverride(): TextProvider | null {
  return testOverride;
}

/** Builds the adapter for a provider from the user's stored key. */
export function getTextProvider(id: TextProviderId, keys: ApiKeys): TextProvider {
  if (testOverride) return testOverride;
  if (id === 'mock') throw new ProviderError('bad_request', 'The scripted provider is only available in tests.');
  const key = keys[id].trim();
  if (!key) throw new ProviderError('auth', `No API key is set for ${id}. Add one in Settings.`);
  switch (id) {
    case 'anthropic':
      return createAnthropicProvider(key);
    case 'openai':
      return createOpenAiProvider(key);
    case 'gemini':
      return createGeminiProvider(key);
    case 'openrouter':
      return createOpenRouterProvider(key);
  }
}
