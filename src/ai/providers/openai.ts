import { providerFetch, sseData } from './http';
import { parseToolArguments } from './types';
import type { ChatMessage, ChatRequest, ModelInfo, StopReason, StreamEvent, TextProvider } from './types';

interface Flavor {
  id: 'openai' | 'openrouter';
  baseUrl: string;
  headers: Record<string, string>;
  maxTokensField: 'max_completion_tokens' | 'max_tokens';
}

type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

function toMessages(req: ChatRequest): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  const system = req.system.map((b) => b.text).filter((t) => t.trim()).join('\n\n');
  if (system) out.push({ role: 'system', content: system });
  for (const m of req.messages) {
    if (m.role === 'assistant') pushAssistant(out, m);
    else {
      for (const b of m.content) if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.toolUseId, content: b.content });
      const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n\n');
      if (text.trim()) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

function pushAssistant(out: OpenAiMessage[], m: ChatMessage): void {
  const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const calls = m.content.flatMap((b) =>
    b.type === 'tool_use' ? [{ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }] : [],
  );
  if (!text.trim() && calls.length === 0) return;
  out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
}

interface Chunk {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null;
  error?: { message?: string };
}

const NON_CHAT = /(embedding|whisper|tts|audio|realtime|image|dall-e|moderation|transcribe|search|instruct|babbage|davinci|codex|sora)/i;

function createCompatible(apiKey: string, flavor: Flavor): TextProvider {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, ...flavor.headers };
  return {
    id: flavor.id,
    async listModels(): Promise<ModelInfo[]> {
      const res = await providerFetch(`${flavor.baseUrl}/models`, { headers });
      const data = (await res.json()) as {
        data: Array<{ id: string; name?: string; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }>;
      };
      if (flavor.id === 'openrouter') {
        return data.data
          .filter((m) => !m.supported_parameters || m.supported_parameters.includes('tools'))
          .map((m) => ({
            id: m.id,
            name: m.name ?? m.id,
            ...(m.pricing?.prompt && m.pricing.completion
              ? { pricing: { inputPerM: Number(m.pricing.prompt) * 1e6, outputPerM: Number(m.pricing.completion) * 1e6 } }
              : {}),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      return data.data
        .filter((m) => /^(gpt|o\d|chatgpt)/.test(m.id) && !NON_CHAT.test(m.id))
        .map((m) => ({ id: m.id, name: m.id }))
        .sort((a, b) => b.id.localeCompare(a.id));
    },
    async *stream(req: ChatRequest): AsyncGenerator<StreamEvent> {
      const body = {
        model: req.model,
        messages: toMessages(req),
        stream: true,
        stream_options: { include_usage: true },
        [flavor.maxTokensField]: req.maxTokens ?? 8000,
        ...(req.tools?.length
          ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })) }
          : {}),
      };
      const res = await providerFetch(`${flavor.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal });
      const calls = new Map<number, { id: string; name: string; args: string }>();
      let finish: string | null = null;
      for await (const data of sseData(res, req.signal)) {
        if (data === '[DONE]') break;
        let chunk: Chunk;
        try {
          chunk = JSON.parse(data) as Chunk;
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) yield { type: 'text', text: choice.delta.content };
        for (const tc of choice?.delta?.tool_calls ?? []) {
          const entry = calls.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
          calls.set(tc.index, entry);
        }
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) {
          const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
          yield {
            type: 'usage',
            usage: {
              inputTokens: (chunk.usage.prompt_tokens ?? 0) - cached,
              outputTokens: chunk.usage.completion_tokens ?? 0,
              cacheReadTokens: cached,
              cacheWriteTokens: 0,
            },
          };
        }
      }
      const truncated = finish === 'length';
      if (!truncated) {
        for (const [index, c] of [...calls].sort((a, b) => a[0] - b[0])) {
          yield { type: 'tool_call', id: c.id || `call_${index}`, name: c.name, input: parseToolArguments(c.args) };
        }
      }
      const stopReason: StopReason = truncated ? 'max_tokens' : finish === 'content_filter' ? 'refusal' : calls.size ? 'tool_use' : 'end';
      yield { type: 'done', stopReason };
    },
  };
}

export function createOpenAiProvider(apiKey: string): TextProvider {
  return createCompatible(apiKey, { id: 'openai', baseUrl: 'https://api.openai.com/v1', headers: {}, maxTokensField: 'max_completion_tokens' });
}

export function createOpenRouterProvider(apiKey: string): TextProvider {
  return createCompatible(apiKey, {
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: { 'X-Title': 'TaleForge' },
    maxTokensField: 'max_tokens',
  });
}
