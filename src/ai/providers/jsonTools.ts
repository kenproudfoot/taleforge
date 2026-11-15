import type { ChatMessage, ChatRequest, StreamEvent, TextProvider, ToolDef } from './types';

/**
 * Fallback for models without native tool calling: the tools are described in the system prompt and the
 * model replies with narration followed by one fenced JSON block listing its tool calls.
 */
export function jsonToolInstructions(tools: ToolDef[]): string {
  const list = tools.map((t) => `- ${t.name}: ${t.description}\n  input schema: ${JSON.stringify(t.schema)}`).join('\n');
  return [
    'TOOL CALLING FORMAT',
    'You cannot call tools natively. To use tools, end your reply with exactly one fenced block:',
    '```json',
    '{"tool_calls": [{"name": "tool_name", "input": { }}]}',
    '```',
    'Put any narration before the block and nothing after it. Omit the block when you call no tools.',
    'Tool results arrive in the next user message as lines starting with "TOOL RESULT".',
    'Available tools:',
    list,
  ].join('\n');
}

export function parseJsonToolCalls(json: string): Array<{ name: string; input: unknown }> {
  try {
    const data = JSON.parse(json) as { tool_calls?: unknown };
    if (!Array.isArray(data.tool_calls)) return [];
    return data.tool_calls.flatMap((c) => {
      const call = c as { name?: unknown; input?: unknown };
      return typeof call.name === 'string' ? [{ name: call.name, input: call.input ?? {} }] : [];
    });
  } catch {
    return [];
  }
}

/** Rewrites tool blocks as plain text so any chat model can follow the conversation. */
export function flattenToolMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    const parts: string[] = [];
    const calls: Array<{ name: string; input: unknown }> = [];
    for (const b of m.content) {
      if (b.type === 'text') parts.push(b.text);
      else if (b.type === 'tool_use') calls.push({ name: b.name, input: b.input });
      else parts.push(`TOOL RESULT (${b.name})${b.isError ? ' ERROR' : ''}: ${b.content}`);
    }
    if (calls.length) parts.push('```json\n' + JSON.stringify({ tool_calls: calls }) + '\n```');
    return { role: m.role, content: [{ type: 'text', text: parts.join('\n\n') }] };
  });
}

const FENCE = '```';

/** Wraps a provider so that tool calls travel as a fenced JSON block instead of native tool calling. */
export function withJsonTools(provider: TextProvider): TextProvider {
  return {
    id: provider.id,
    listModels: () => provider.listModels(),
    async *stream(req: ChatRequest): AsyncGenerator<StreamEvent> {
      if (!req.tools?.length) {
        yield* provider.stream(req);
        return;
      }
      const inner: ChatRequest = {
        ...req,
        tools: undefined,
        system: [...req.system, { text: jsonToolInstructions(req.tools) }],
        messages: flattenToolMessages(req.messages),
      };
      // Text is passed through until a code fence starts; from then on it is held back and parsed.
      let pending = '';
      let fenced: string | null = null;
      let calls: Array<{ name: string; input: unknown }> = [];
      for await (const event of provider.stream(inner)) {
        if (event.type === 'text') {
          if (fenced !== null) {
            fenced += event.text;
            continue;
          }
          pending += event.text;
          const at = pending.indexOf(FENCE);
          if (at >= 0) {
            if (pending.slice(0, at).trim()) yield { type: 'text', text: pending.slice(0, at).trimEnd() };
            fenced = pending.slice(at);
            pending = '';
          } else {
            // Keep back a possible partial fence ("`" or "``") at the very end.
            const keep = pending.endsWith('``') ? 2 : pending.endsWith('`') ? 1 : 0;
            const emit = pending.slice(0, pending.length - keep);
            if (emit) yield { type: 'text', text: emit };
            pending = pending.slice(pending.length - keep);
          }
        } else if (event.type === 'done') {
          if (fenced !== null) {
            const body = /^```(?:json)?\s*([\s\S]*?)\s*(?:```|$)/.exec(fenced)?.[1] ?? '';
            calls = parseJsonToolCalls(body);
            if (calls.length === 0 && fenced.trim()) yield { type: 'text', text: fenced };
          } else if (pending) yield { type: 'text', text: pending };
          const stamp = Date.now().toString(36);
          for (const [i, c] of calls.entries()) yield { type: 'tool_call', id: `json-${stamp}-${i}`, name: c.name, input: c.input };
          yield { type: 'done', stopReason: calls.length && event.stopReason === 'end' ? 'tool_use' : event.stopReason };
        } else if (event.type === 'usage') yield event;
      }
    },
  };
}
