import { useSettings } from '@/app/settingsStore';
import { meter } from './meter';
import { complete, getTextProvider, textMessage } from './providers';

export interface HelperRequest {
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** What the request is for, shown in the usage panel ("picture prompt", "recap" …). */
  label?: string;
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
  meter({ kind: 'helper', provider: helper.provider, model: helper.model, usage: completion.usage, label: req.label });
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
