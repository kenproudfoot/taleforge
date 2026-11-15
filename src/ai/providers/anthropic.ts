import Anthropic from '@anthropic-ai/sdk';
import { priceFor } from '../pricing';
import { ProviderError } from './types';
import type { ChatMessage, ChatRequest, ModelInfo, StopReason, StreamEvent, TextProvider } from './types';

/** The part of the SDK client this adapter uses (tests substitute a fake). */
export type AnthropicLike = Pick<Anthropic, 'messages' | 'models'>;

const DEFAULT_MAX_TOKENS = 8000;

/** Models that rejected `output_config.effort` in this session; the adapter stops sending it to them. */
const effortUnsupported = new Set<string>();

function toParams(messages: ChatMessage[], model: string): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && m.raw?.provider === 'anthropic' && m.raw.model === model) {
      // Replay the model's own blocks (including thinking) unchanged inside a tool loop.
      out.push({ role: 'assistant', content: m.raw.content as Anthropic.ContentBlockParam[] });
      continue;
    }
    const content: Anthropic.ContentBlockParam[] = [];
    for (const b of m.content) {
      if (b.type === 'text') {
        if (b.text.trim()) content.push({ type: 'text', text: b.text });
      } else if (b.type === 'tool_use') {
        content.push({ type: 'tool_use', id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
      } else {
        content.push({ type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) });
      }
    }
    if (content.length) out.push({ role: m.role, content });
  }
  // Cache the conversation so far: the follow-up requests of a tool loop reuse it.
  const last = out[out.length - 1];
  if (last && Array.isArray(last.content)) {
    const block = last.content[last.content.length - 1];
    if (block && (block.type === 'text' || block.type === 'tool_result')) {
      last.content[last.content.length - 1] = { ...block, cache_control: { type: 'ephemeral' } };
    }
  }
  return out;
}

function mapStop(reason: string | null): StopReason {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  if (reason === 'refusal') return 'refusal';
  return 'end';
}

function mapError(e: unknown, signal?: AbortSignal): ProviderError {
  if (e instanceof ProviderError) return e;
  if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) return new ProviderError('aborted', 'Request cancelled');
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ProviderError('auth', e.message, e.status);
  if (e instanceof Anthropic.RateLimitError) return new ProviderError('rate_limit', e.message, e.status);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('network', e.message);
  if (e instanceof Anthropic.APIError) {
    const status = typeof e.status === 'number' ? e.status : undefined;
    return new ProviderError(status !== undefined && status >= 500 ? 'server' : 'bad_request', e.message, status);
  }
  return new ProviderError('network', e instanceof Error ? e.message : String(e));
}

export function createAnthropicProvider(apiKey: string, client?: AnthropicLike): TextProvider {
  // The SDK adds the direct-browser-access header when dangerouslyAllowBrowser is set. The key never
  // leaves the user's browser except to go to api.anthropic.com.
  const api: AnthropicLike = client ?? new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });

  async function* run(req: ChatRequest, withEffort: boolean): AsyncGenerator<StreamEvent> {
    const params: Anthropic.MessageStreamParams = {
      model: req.model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system
        .filter((b) => b.text.trim())
        .map((b) => ({ type: 'text' as const, text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) })),
      messages: toParams(req.messages, req.model),
      ...(req.tools?.length
        ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as Anthropic.Tool.InputSchema })) }
        : {}),
      // Thinking is left at the model default (adaptive on current models); effort controls depth and speed.
      ...(withEffort && req.effort ? { output_config: { effort: req.effort } } : {}),
    };
    const stream = api.messages.stream(params, { signal: req.signal });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield { type: 'text', text: event.delta.text };
    }
    const final = await stream.finalMessage();
    // A refusal or a truncated turn can cut a tool call off mid-input: never run those tools.
    const runnable = final.stop_reason !== 'refusal' && final.stop_reason !== 'max_tokens';
    if (runnable) {
      for (const block of final.content) {
        if (block.type === 'tool_use') yield { type: 'tool_call', id: block.id, name: block.name, input: block.input };
      }
    }
    yield {
      type: 'usage',
      usage: {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
        cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
      },
    };
    yield {
      type: 'done',
      stopReason: mapStop(final.stop_reason),
      raw: runnable ? { provider: 'anthropic', model: req.model, content: final.content } : undefined,
    };
  }

  return {
    id: 'anthropic',
    async listModels(): Promise<ModelInfo[]> {
      try {
        const models: ModelInfo[] = [];
        for await (const m of api.models.list({ limit: 100 })) {
          models.push({ id: m.id, name: m.display_name || m.id, pricing: priceFor('anthropic', m.id) });
        }
        return models;
      } catch (e) {
        throw mapError(e);
      }
    },
    async *stream(req: ChatRequest): AsyncGenerator<StreamEvent> {
      const withEffort = !effortUnsupported.has(req.model);
      let produced = false;
      try {
        for await (const event of run(req, withEffort)) {
          produced = true;
          yield event;
        }
      } catch (e) {
        // Older models reject the effort parameter: drop it for that model and retry once.
        if (!produced && withEffort && req.effort && e instanceof Anthropic.BadRequestError && /effort|output_config/i.test(e.message)) {
          effortUnsupported.add(req.model);
          try {
            yield* run(req, false);
            return;
          } catch (again) {
            throw mapError(again, req.signal);
          }
        }
        throw mapError(e, req.signal);
      }
    },
  };
}
