import type { ChatRequest, StopReason, StreamEvent, TextProvider } from './types';

export interface MockTurn {
  text?: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
  stopReason?: StopReason;
  /** Throw this instead of responding. */
  error?: Error;
  /** Provider-private content to attach, like a real adapter's thinking blocks. */
  raw?: { provider: 'anthropic'; model: string; content: unknown };
}

export type MockScript = MockTurn[] | ((req: ChatRequest, callIndex: number) => MockTurn);

export interface MockProvider extends TextProvider {
  /** Every request received, in order. */
  requests: ChatRequest[];
}

/**
 * A scripted provider for tests and the offline demo. Replies come from a list (one per request) or a
 * function of the request. Text is streamed word by word like a real model.
 */
export function createMockProvider(script: MockScript, models = ['mock-dm', 'mock-helper']): MockProvider {
  const requests: ChatRequest[] = [];
  return {
    id: 'mock',
    requests,
    async listModels() {
      return models.map((id) => ({ id, name: id }));
    },
    async *stream(req: ChatRequest): AsyncGenerator<StreamEvent> {
      const index = requests.length;
      requests.push(req);
      const turn = typeof script === 'function' ? script(req, index) : (script[index] ?? { text: '' });
      if (turn.error) throw turn.error;
      for (const piece of (turn.text ?? '').match(/\S+\s*|\s+/g) ?? []) {
        if (req.signal?.aborted) return;
        yield { type: 'text', text: piece };
      }
      const calls = turn.toolCalls ?? [];
      for (const [i, call] of calls.entries()) yield { type: 'tool_call', id: `mock-${index}-${i}`, name: call.name, input: call.input };
      const outputTokens = Math.ceil((turn.text ?? '').length / 4) + calls.length * 20;
      yield { type: 'usage', usage: { inputTokens: 100, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 } };
      yield { type: 'done', stopReason: turn.stopReason ?? (calls.length ? 'tool_use' : 'end'), raw: turn.raw };
    },
  };
}
