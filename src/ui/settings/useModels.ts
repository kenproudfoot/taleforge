import { useEffect, useState } from 'react';
import { describeProviderError, getTextProvider, PROVIDER_LABELS } from '@/ai/providers';
import type { ApiKeys, ModelInfo, TextProviderId } from '@/ai/providers';

const cache = new Map<string, Promise<ModelInfo[]>>();

/** Fetches a provider's live model list (cached per provider and key for the session). */
export function fetchModels(provider: TextProviderId, keys: ApiKeys): Promise<ModelInfo[]> {
  const id = `${provider}:${provider === 'mock' ? '' : keys[provider]}`;
  let hit = cache.get(id);
  if (!hit) {
    hit = Promise.resolve().then(() => getTextProvider(provider, keys).listModels());
    cache.set(id, hit);
    hit.catch(() => cache.delete(id));
  }
  return hit;
}

export function clearModelCache(): void {
  cache.clear();
}

export interface ModelsState {
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
}

export function useModels(provider: TextProviderId, keys: ApiKeys): ModelsState {
  const key = provider === 'mock' ? 'mock' : keys[provider];
  const [state, setState] = useState<ModelsState>({ models: [], loading: false, error: null });
  useEffect(() => {
    let live = true;
    if (!key) {
      setState({ models: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchModels(provider, keys)
      .then((models) => live && setState({ models, loading: false, error: null }))
      .catch((e: unknown) => live && setState({ models: [], loading: false, error: describeProviderError(e, PROVIDER_LABELS[provider]) }));
    return () => {
      live = false;
    };
    // Re-run only when the provider or its key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, key]);
  return state;
}
