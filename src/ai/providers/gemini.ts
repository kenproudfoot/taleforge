import { providerFetch, sseData } from './http';
import type { ChatRequest, ModelInfo, StopReason, StreamEvent, TextProvider } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

type Part = { text: string } | { functionCall: { name: string; args: unknown }; thoughtSignature?: string } | { functionResponse: { name: string; response: unknown } };
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

/** Gemini accepts an OpenAPI-style subset of JSON Schema: drop what it rejects and flatten unions. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema === null || typeof schema !== 'object') return schema;
  const src = schema as Record<string, unknown>;
  if (Array.isArray(src.anyOf)) {
    const options = src.anyOf as Array<Record<string, unknown>>;
    const pick = options.find((o) => o.type === 'string') ?? options[0] ?? {};
    const { anyOf: _anyOf, ...rest } = src;
    return toGeminiSchema({ ...rest, ...pick });
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (['additionalProperties', '$schema', 'default', 'pattern', 'minLength', 'maxLength', 'const'].includes(key)) continue;
    out[key] = key === 'properties' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)])) : toGeminiSchema(value);
  }
  return out;
}

function toContents(req: ChatRequest): Content[] {
  const out: Content[] = [];
  for (const m of req.messages) {
    if (m.role === 'assistant' && m.raw?.provider === 'gemini' && m.raw.model === req.model) {
      // Replay the model's own parts so thought signatures on function calls survive the tool loop.
      out.push({ role: 'model', parts: m.raw.content as Part[] });
      continue;
    }
    const parts: Part[] = [];
    for (const b of m.content) {
      if (b.type === 'text') {
        if (b.text.trim()) parts.push({ text: b.text });
      } else if (b.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input ?? {} } });
      else parts.push({ functionResponse: { name: b.name, response: { result: b.content, ...(b.isError ? { error: true } : {}) } } });
    }
    if (parts.length) out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
  }
  return out;
}

interface Chunk {
  candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

export function createGeminiProvider(apiKey: string): TextProvider {
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };
  return {
    id: 'gemini',
    async listModels(): Promise<ModelInfo[]> {
      const res = await providerFetch(`${BASE}/models?pageSize=200`, { headers });
      const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
      return (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/(image|tts|embedding|audio|live)/.test(m.name))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName ?? m.name }))
        .sort((a, b) => b.id.localeCompare(a.id));
    },
    async *stream(req: ChatRequest): AsyncGenerator<StreamEvent> {
      const system = req.system.map((b) => b.text).filter((t) => t.trim()).join('\n\n');
      const body = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: toContents(req),
        ...(req.tools?.length
          ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.schema) })) }] }
          : {}),
        generationConfig: { maxOutputTokens: req.maxTokens ?? 8000 },
      };
      const res = await providerFetch(`${BASE}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: req.signal,
      });
      const rawParts: Array<Record<string, unknown>> = [];
      const calls: Array<{ name: string; args: unknown }> = [];
      let finish = '';
      let blocked = false;
      let usage: Chunk['usageMetadata'];
      for await (const data of sseData(res, req.signal)) {
        let chunk: Chunk;
        try {
          chunk = JSON.parse(data) as Chunk;
        } catch {
          continue;
        }
        if (chunk.promptFeedback?.blockReason) blocked = true;
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          rawParts.push(part);
          if (part.thought) continue;
          if (typeof part.text === 'string' && part.text) yield { type: 'text', text: part.text };
          const fc = part.functionCall as { name: string; args?: unknown } | undefined;
          if (fc) calls.push({ name: fc.name, args: fc.args ?? {} });
        }
        if (candidate?.finishReason) finish = candidate.finishReason;
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
      }
      const truncated = finish === 'MAX_TOKENS';
      if (!truncated) {
        for (const [i, c] of calls.entries()) yield { type: 'tool_call', id: `gemini-call-${Date.now().toString(36)}-${i}`, name: c.name, input: c.args };
      }
      if (usage) {
        const cached = usage.cachedContentTokenCount ?? 0;
        yield {
          type: 'usage',
          usage: {
            inputTokens: (usage.promptTokenCount ?? 0) - cached,
            outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
            cacheReadTokens: cached,
            cacheWriteTokens: 0,
          },
        };
      }
      const refused = blocked || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION'].includes(finish);
      const stopReason: StopReason = truncated ? 'max_tokens' : refused ? 'refusal' : calls.length ? 'tool_use' : 'end';
      yield { type: 'done', stopReason, raw: rawParts.length && !truncated ? { provider: 'gemini', model: req.model, content: rawParts } : undefined };
    },
  };
}
