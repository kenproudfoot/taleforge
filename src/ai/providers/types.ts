export type TextProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'mock';
export const TEXT_PROVIDER_IDS: TextProviderId[] = ['anthropic', 'openai', 'gemini', 'openrouter'];

export const PROVIDER_LABELS: Record<TextProviderId, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  mock: 'Scripted (tests)',
};

export interface ModelInfo {
  id: string;
  name: string;
  /** USD per million tokens, when the provider publishes it. */
  pricing?: { inputPerM: number; outputPerM: number };
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; name: string; content: string; isError?: boolean };

/**
 * Provider-neutral conversation message. `raw` optionally carries the provider's own content for an
 * assistant message (thinking blocks, thought signatures) so it can be replayed unchanged within the
 * same turn's tool loop. It is never persisted and is ignored by other providers.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
  raw?: { provider: TextProviderId; model: string; content: unknown };
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  schema: Record<string, unknown>;
}

export type Effort = 'low' | 'medium' | 'high';

export interface ChatRequest {
  model: string;
  /** System prompt blocks. Blocks marked `cache` form the stable prefix for prompt caching. */
  system: Array<{ text: string; cache?: boolean }>;
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
  effort?: Effort;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal';

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; stopReason: StopReason; raw?: ChatMessage['raw'] };

export interface TextProvider {
  id: TextProviderId;
  listModels(): Promise<ModelInfo[]>;
  /** Streams text deltas, tool calls and usage, ending with exactly one `done` event. */
  stream(req: ChatRequest): AsyncIterable<StreamEvent>;
}

export type ProviderErrorKind = 'auth' | 'rate_limit' | 'bad_request' | 'server' | 'network' | 'aborted';

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** A message people can act on, for Settings and the game table. */
export function describeProviderError(error: unknown, provider: string): string {
  if (error instanceof ProviderError) {
    switch (error.kind) {
      case 'auth':
        return `${provider} rejected the API key. Check it in Settings.`;
      case 'rate_limit':
        return `${provider} is rate limiting requests or the account is out of credit. Wait a moment and try again.`;
      case 'network':
        return `Could not reach ${provider} from the browser. Check your connection; if it persists, this provider may be blocking direct browser calls (CORS).`;
      case 'aborted':
        return 'Cancelled.';
      case 'server':
        return `${provider} had a server error (${error.status ?? 'unknown'}). Try again.`;
      default:
        return `${provider} rejected the request: ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export function errorFromStatus(status: number, message: string): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('auth', message, status);
  if (status === 429 || status === 402) return new ProviderError('rate_limit', message, status);
  if (status >= 500) return new ProviderError('server', message, status);
  return new ProviderError('bad_request', message, status);
}

export interface Completion {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
  usage: Usage;
  stopReason: StopReason;
  raw?: ChatMessage['raw'];
}

/** Runs a request to completion and gathers everything the stream produced. */
export async function complete(provider: TextProvider, req: ChatRequest, onText?: (delta: string) => void): Promise<Completion> {
  const out: Completion = { text: '', toolCalls: [], usage: ZERO_USAGE, stopReason: 'end' };
  for await (const event of provider.stream(req)) {
    if (event.type === 'text') {
      out.text += event.text;
      onText?.(event.text);
    } else if (event.type === 'tool_call') out.toolCalls.push({ id: event.id, name: event.name, input: event.input });
    else if (event.type === 'usage') out.usage = addUsage(out.usage, event.usage);
    else {
      out.stopReason = event.stopReason;
      out.raw = event.raw;
    }
  }
  return out;
}

export function textMessage(role: 'user' | 'assistant', text: string): ChatMessage {
  return { role, content: [{ type: 'text', text }] };
}

/** Parses tool-call arguments that arrive as a JSON string. Bad JSON becomes an error marker the engine rejects. */
export function parseToolArguments(json: string): unknown {
  if (!json.trim()) return {};
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return { __invalid_json: json.slice(0, 500) };
  }
}
