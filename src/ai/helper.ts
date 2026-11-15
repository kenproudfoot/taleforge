import { useSettings } from '@/app/settingsStore';
import { estimateCost, priceFor } from './pricing';
import { complete, getTextProvider, textMessage } from './providers';
import type { Completion } from './providers';

export interface HelperRequest {
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type HelperUsageListener = (completion: Completion, costUsd: number) => void;
const listeners = new Set<HelperUsageListener>();

/** Lets the open game session account for helper-model spend. Returns an unsubscribe function. */
export function onHelperUsage(listener: HelperUsageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One-shot request to the cheap helper model (image prompts, recaps, summaries, suggestions). */
export async function askHelper(req: HelperRequest): Promise<string> {
  const { helper, keys } = useSettings.getState().settings;
  const provider = getTextProvider(helper.provider, keys);
  const completion = await complete(provider, {
    model: helper.model,
    system: [{ text: req.system }],
    messages: [textMessage('user', req.user)],
    maxTokens: req.maxTokens ?? 1500,
    effort: 'low',
    signal: req.signal,
  });
  const cost = estimateCost(completion.usage, priceFor(helper.provider, helper.model)) ?? 0;
  for (const listener of listeners) listener(completion, cost);
  return completion.text.trim();
}

/** Pulls the first JSON object or array out of a model reply (tolerates code fences and chatter). */
export function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidates = [fenced, text].filter((t): t is string => !!t);
  for (const candidate of candidates) {
    const start = candidate.search(/[[{]/);
    if (start < 0) continue;
    const open = candidate[start]!;
    const close = open === '{' ? '}' : ']';
    const end = candidate.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      // try the next candidate
    }
  }
  return null;
}
