/* eslint-disable require-yield */
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateCost, formatCost, formatTokens, priceFor } from '../pricing';
import { createAnthropicProvider } from './anthropic';
import type { AnthropicLike } from './anthropic';
import { createGeminiProvider, toGeminiSchema } from './gemini';
import { sseData } from './http';
import { EMPTY_KEYS, getTextProvider, setProviderOverride } from './index';
import { flattenToolMessages, parseJsonToolCalls, withJsonTools } from './jsonTools';
import { createMockProvider } from './mock';
import { createOpenAiProvider, createOpenRouterProvider } from './openai';
import { ProviderError, addUsage, complete, describeProviderError, errorFromStatus, parseToolArguments, textMessage } from './types';
import type { ChatRequest, StreamEvent, ToolDef } from './types';

const TOOL: ToolDef = { name: 'request_roll', description: 'Ask for a roll', schema: { type: 'object', properties: { character: { type: 'string' } }, required: ['character'] } };
const REQ: ChatRequest = { model: 'm1', system: [{ text: 'Stable rules', cache: true }, { text: 'Extra' }], messages: [textMessage('user', 'I open the door.')], tools: [TOOL], effort: 'low' };

function sse(events: unknown[], done = true): Response {
  const body = events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {}));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setProviderOverride(null);
});

describe('sseData', () => {
  it('parses events split across chunks, CRLF and multi-line data', async () => {
    const enc = new TextEncoder();
    const chunks = ['data: {"a"', ':1}\n\ndata: two\r\n\r\n', ': comment\n\nevent: x\ndata: line1\ndata: line2\n\ndata: tail'];
    const res = new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } }));
    const out: string[] = [];
    for await (const d of sseData(res)) out.push(d);
    expect(out).toEqual(['{"a":1}', 'two', 'line1\nline2', 'tail']);
  });
});

describe('OpenAI-compatible adapter', () => {
  it('streams text, assembles tool calls from fragments and reports usage', async () => {
    const fetchFn = stubFetch(() =>
      sse([
        { choices: [{ delta: { content: 'The door ' } }] },
        { choices: [{ delta: { content: 'creaks.' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'request_roll', arguments: '{"char' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'acter":"Mags"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 } } },
      ]),
    );
    const events = await collect(createOpenAiProvider('sk-test').stream(REQ));
    expect(events).toEqual([
      { type: 'text', text: 'The door ' },
      { type: 'text', text: 'creaks.' },
      { type: 'usage', usage: { inputTokens: 20, outputTokens: 30, cacheReadTokens: 100, cacheWriteTokens: 0 } },
      { type: 'tool_call', id: 'call_1', name: 'request_roll', input: { character: 'Mags' } },
      { type: 'done', stopReason: 'tool_use' },
    ]);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init!.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Stable rules\n\nExtra' });
    expect(body.max_completion_tokens).toBe(8000);
    expect(body.tools[0].function.name).toBe('request_roll');
  });

  it('maps tool results and assistant tool calls in the history', async () => {
    const fetchFn = stubFetch(() => sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]));
    await collect(
      createOpenRouterProvider('k').stream({
        ...REQ,
        messages: [
          textMessage('user', 'go'),
          { role: 'assistant', content: [{ type: 'text', text: 'Rolling.' }, { type: 'tool_use', id: 't1', name: 'request_roll', input: { character: 'Mags' } }] },
          { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', name: 'request_roll', content: '{"total":15}' }, { type: 'text', text: 'note' }] },
          { role: 'assistant', content: [] },
        ],
      }),
    );
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init!.body as string);
    expect(body.max_tokens).toBe(8000);
    expect(body.messages.slice(1)).toEqual([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'Rolling.', tool_calls: [{ id: 't1', type: 'function', function: { name: 'request_roll', arguments: '{"character":"Mags"}' } }] },
      { role: 'tool', tool_call_id: 't1', content: '{"total":15}' },
      { role: 'user', content: 'note' },
    ]);
  });

  it('never runs tool calls from a truncated reply, and flags refusals', async () => {
    stubFetch(() => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'x', arguments: '{"a":' } }] }, finish_reason: 'length' }] }]));
    expect(await collect(createOpenAiProvider('k').stream(REQ))).toEqual([{ type: 'done', stopReason: 'max_tokens' }]);
    stubFetch(() => sse([{ choices: [{ delta: {}, finish_reason: 'content_filter' }] }, 'not json']));
    expect(await collect(createOpenAiProvider('k').stream(REQ))).toEqual([{ type: 'done', stopReason: 'refusal' }]);
  });

  it('lists chat models only', async () => {
    stubFetch(() => Response.json({ data: [{ id: 'gpt-5' }, { id: 'text-embedding-3' }, { id: 'gpt-4o-audio-preview' }, { id: 'o4-mini' }, { id: 'whisper-1' }] }));
    expect((await createOpenAiProvider('k').listModels()).map((m) => m.id)).toEqual(['o4-mini', 'gpt-5']);
    stubFetch(() =>
      Response.json({
        data: [
          { id: 'b/model', name: 'Beta', pricing: { prompt: '0.000002', completion: '0.00001' }, supported_parameters: ['tools'] },
          { id: 'a/no-tools', name: 'Alpha', supported_parameters: ['temperature'] },
        ],
      }),
    );
    expect(await createOpenRouterProvider('k').listModels()).toEqual([{ id: 'b/model', name: 'Beta', pricing: { inputPerM: 2, outputPerM: 10 } }]);
  });

  it('maps HTTP and network failures to ProviderError', async () => {
    stubFetch(() => Response.json({ error: { message: 'Incorrect API key' } }, { status: 401 }));
    await expect(createOpenAiProvider('bad').listModels()).rejects.toMatchObject({ kind: 'auth', message: 'Incorrect API key', status: 401 });
    stubFetch(() => new Response('upstream down', { status: 503 }));
    await expect(collect(createOpenAiProvider('k').stream(REQ))).rejects.toMatchObject({ kind: 'server', message: 'upstream down' });
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createOpenAiProvider('k').listModels()).rejects.toMatchObject({ kind: 'network' });
    const aborted = new AbortController();
    aborted.abort();
    stubFetch(() => {
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(collect(createOpenAiProvider('k').stream({ ...REQ, signal: aborted.signal }))).rejects.toMatchObject({ kind: 'aborted' });
  });
});

describe('Gemini adapter', () => {
  it('streams text and function calls, hides thoughts, keeps raw parts for replay', async () => {
    const fetchFn = stubFetch(() =>
      sse(
        [
          { candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: 'A goblin leaps out. ' }] } }] },
          { candidates: [{ content: { parts: [{ functionCall: { name: 'request_roll', args: { character: 'Mags' } }, thoughtSignature: 'sig' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 5 } },
        ],
        false,
      ),
    );
    const events = await collect(createGeminiProvider('g-key').stream(REQ));
    expect(events[0]).toEqual({ type: 'text', text: 'A goblin leaps out. ' });
    expect(events[1]).toMatchObject({ type: 'tool_call', name: 'request_roll', input: { character: 'Mags' } });
    expect(events[2]).toEqual({ type: 'usage', usage: { inputTokens: 50, outputTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    const done = events[3] as Extract<StreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('tool_use');
    expect((done.raw!.content as unknown[]).length).toBe(3);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m1:streamGenerateContent?alt=sse');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
    const body = JSON.parse(init!.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('Stable rules\n\nExtra');
    expect(body.tools[0].functionDeclarations[0].name).toBe('request_roll');
  });

  it('replays raw parts for the same model and maps tool results', async () => {
    const fetchFn = stubFetch(() => sse([{ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }], false));
    const raw = [{ functionCall: { name: 'request_roll', args: {} }, thoughtSignature: 'sig' }];
    await collect(
      createGeminiProvider('k').stream({
        ...REQ,
        messages: [
          textMessage('user', 'go'),
          { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'request_roll', input: {} }], raw: { provider: 'gemini', model: 'm1', content: raw } },
          { role: 'user', content: [{ type: 'tool_result', toolUseId: 'x', name: 'request_roll', content: 'fail', isError: true }] },
          { role: 'assistant', content: [{ type: 'tool_use', id: 'y', name: 'heal', input: { a: 1 } }], raw: { provider: 'anthropic', model: 'other', content: [] } },
        ],
      }),
    );
    const body = JSON.parse(fetchFn.mock.calls[0]![1]!.body as string);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'go' }] },
      { role: 'model', parts: raw },
      { role: 'user', parts: [{ functionResponse: { name: 'request_roll', response: { result: 'fail', error: true } } }] },
      { role: 'model', parts: [{ functionCall: { name: 'heal', args: { a: 1 } } }] },
    ]);
  });

  it('reports truncation and safety blocks', async () => {
    stubFetch(() => sse([{ candidates: [{ content: { parts: [{ functionCall: { name: 'x' } }] }, finishReason: 'MAX_TOKENS' }] }], false));
    expect(await collect(createGeminiProvider('k').stream(REQ))).toEqual([{ type: 'done', stopReason: 'max_tokens', raw: undefined }]);
    stubFetch(() => sse([{ promptFeedback: { blockReason: 'SAFETY' } }], false));
    expect(await collect(createGeminiProvider('k').stream(REQ))).toEqual([{ type: 'done', stopReason: 'refusal', raw: undefined }]);
  });

  it('lists Gemini chat models', async () => {
    stubFetch(() =>
      Response.json({
        models: [
          { name: 'models/gemini-3-pro', displayName: 'Gemini 3 Pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-3-image', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    );
    expect(await createGeminiProvider('k').listModels()).toEqual([{ id: 'gemini-3-pro', name: 'Gemini 3 Pro' }]);
  });

  it('simplifies JSON Schema for Gemini', () => {
    expect(
      toGeminiSchema({
        $schema: 'x',
        type: 'object',
        additionalProperties: false,
        properties: { amount: { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 12 }], description: 'n' }, list: { type: 'array', items: { type: 'string', pattern: 'x' } } },
        required: ['amount'],
      }),
    ).toEqual({ type: 'object', properties: { amount: { type: 'string', description: 'n' }, list: { type: 'array', items: { type: 'string' } } }, required: ['amount'] });
  });
});

describe('Anthropic adapter', () => {
  function fakeClient(final: Partial<Anthropic.Message>, deltas: string[] = [], onParams?: (p: Anthropic.MessageStreamParams) => void): AnthropicLike {
    return {
      messages: {
        stream(params: Anthropic.MessageStreamParams) {
          onParams?.(params);
          return {
            async *[Symbol.asyncIterator]() {
              for (const text of deltas) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
            },
            finalMessage: async () => ({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, ...final }),
          };
        },
      },
      models: {
        list() {
          return { async *[Symbol.asyncIterator]() { yield { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }; yield { id: 'claude-new', display_name: '' }; } };
        },
      },
    } as unknown as AnthropicLike;
  }

  it('streams text, emits tool calls from the final message and keeps raw content for the tool loop', async () => {
    let seen: Anthropic.MessageStreamParams | undefined;
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'You hear water.' },
      { type: 'tool_use', id: 'tu1', name: 'request_roll', input: { character: 'Mags' } },
    ];
    const client = fakeClient(
      { content: content as Anthropic.ContentBlock[], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 } as Anthropic.Usage },
      ['You hear ', 'water.'],
      (p) => (seen = p),
    );
    const events = await collect(createAnthropicProvider('k', client).stream(REQ));
    expect(events).toEqual([
      { type: 'text', text: 'You hear ' },
      { type: 'text', text: 'water.' },
      { type: 'tool_call', id: 'tu1', name: 'request_roll', input: { character: 'Mags' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheWriteTokens: 40 } },
      { type: 'done', stopReason: 'tool_use', raw: { provider: 'anthropic', model: 'm1', content } },
    ]);
    expect(seen!.system).toEqual([
      { type: 'text', text: 'Stable rules', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Extra' },
    ]);
    expect(seen!.output_config).toEqual({ effort: 'low' });
    expect(seen).not.toHaveProperty('temperature');
    expect(seen).not.toHaveProperty('thinking');
    expect(seen!.tools?.[0]).toMatchObject({ name: 'request_roll', input_schema: TOOL.schema });
    expect(seen!.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'I open the door.', cache_control: { type: 'ephemeral' } }] }]);
  });

  it('replays raw assistant content only for the same model', async () => {
    let seen: Anthropic.MessageStreamParams | undefined;
    const raw = [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 't', name: 'heal', input: {} }];
    const history = (model: string): ChatRequest => ({
      ...REQ,
      model,
      messages: [
        textMessage('user', 'go'),
        { role: 'assistant', content: [{ type: 'text', text: ' ' }, { type: 'tool_use', id: 't', name: 'heal', input: null }], raw: { provider: 'anthropic', model: 'm1', content: raw } },
        { role: 'user', content: [{ type: 'tool_result', toolUseId: 't', name: 'heal', content: 'nope', isError: true }] },
      ],
    });
    await collect(createAnthropicProvider('k', fakeClient({}, [], (p) => (seen = p))).stream(history('m1')));
    expect(seen!.messages[1]).toEqual({ role: 'assistant', content: raw });
    expect(seen!.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'nope', is_error: true, cache_control: { type: 'ephemeral' } }] });
    await collect(createAnthropicProvider('k', fakeClient({}, [], (p) => (seen = p))).stream(history('m2')));
    expect(seen!.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'heal', input: {} }] });
  });

  it('does not run tools from refused or truncated turns', async () => {
    const content = [{ type: 'tool_use', id: 'tu1', name: 'request_roll', input: {} }] as Anthropic.ContentBlock[];
    const refused = await collect(createAnthropicProvider('k', fakeClient({ content, stop_reason: 'refusal' })).stream(REQ));
    expect(refused.map((e) => e.type)).toEqual(['usage', 'done']);
    expect(refused[1]).toEqual({ type: 'done', stopReason: 'refusal', raw: undefined });
    const cut = await collect(createAnthropicProvider('k', fakeClient({ content, stop_reason: 'max_tokens' })).stream(REQ));
    expect(cut[1]).toMatchObject({ stopReason: 'max_tokens' });
  });

  it('retries without effort when a model rejects it, and remembers', async () => {
    const seen: Anthropic.MessageStreamParams[] = [];
    const ok = fakeClient({}, ['hi']);
    const client = {
      models: ok.models,
      messages: {
        stream(params: Anthropic.MessageStreamParams) {
          seen.push(params);
          if (params.output_config) {
            return {
               
              async *[Symbol.asyncIterator]() {
                throw new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.effort is not supported on this model' } }, undefined, new Headers());
              },
              finalMessage: async () => ({}),
            };
          }
          return (ok.messages as unknown as { stream: (p: unknown) => unknown }).stream(params);
        },
      },
    } as unknown as AnthropicLike;
    const provider = createAnthropicProvider('k', client);
    const req = { ...REQ, model: 'legacy-model' };
    expect((await collect(provider.stream(req)))[0]).toEqual({ type: 'text', text: 'hi' });
    expect(seen.map((p) => !!p.output_config)).toEqual([true, false]);
    await collect(provider.stream(req));
    expect(seen).toHaveLength(3);
    expect(seen[2]!.output_config).toBeUndefined();
  });

  it('maps SDK errors', async () => {
    const failing = (error: Error): AnthropicLike =>
      ({
        models: { list: () => ({ async *[Symbol.asyncIterator]() { throw error; } }) },
        messages: { stream: () => ({ async *[Symbol.asyncIterator]() { throw error; }, finalMessage: async () => ({}) }) },
      }) as unknown as AnthropicLike;
    const h = new Headers();
    await expect(createAnthropicProvider('k', failing(new Anthropic.AuthenticationError(401, {}, 'bad key', h))).listModels()).rejects.toMatchObject({ kind: 'auth' });
    await expect(collect(createAnthropicProvider('k', failing(new Anthropic.RateLimitError(429, {}, 'slow down', h))).stream(REQ))).rejects.toMatchObject({ kind: 'rate_limit' });
    await expect(collect(createAnthropicProvider('k', failing(new Anthropic.InternalServerError(500, {}, 'boom', h))).stream(REQ))).rejects.toMatchObject({ kind: 'server' });
    await expect(collect(createAnthropicProvider('k', failing(new Anthropic.BadRequestError(400, {}, 'bad', h))).stream({ ...REQ, effort: undefined }))).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(collect(createAnthropicProvider('k', failing(new Anthropic.APIConnectionError({ message: 'offline' }))).stream(REQ))).rejects.toMatchObject({ kind: 'network' });
    await expect(collect(createAnthropicProvider('k', failing(new Anthropic.APIUserAbortError())).stream(REQ))).rejects.toMatchObject({ kind: 'aborted' });
    await expect(collect(createAnthropicProvider('k', failing(new Error('weird'))).stream(REQ))).rejects.toMatchObject({ kind: 'network' });
  });

  it('lists models with known prices', async () => {
    expect(await createAnthropicProvider('k', fakeClient({})).listModels()).toEqual([
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', pricing: { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.1, cacheWritePerM: 2.5 } },
      { id: 'claude-new', name: 'claude-new', pricing: undefined },
    ]);
  });
});

describe('mock provider and complete()', () => {
  it('replays a script, records requests and streams word by word', async () => {
    const mock = createMockProvider([{ text: 'Hello there, traveller.' }, { text: 'Roll!', toolCalls: [{ name: 'request_roll', input: { character: 'Mags' } }] }]);
    const deltas: string[] = [];
    const first = await complete(mock, REQ, (d) => deltas.push(d));
    expect(first).toMatchObject({ text: 'Hello there, traveller.', stopReason: 'end', toolCalls: [] });
    expect(deltas).toEqual(['Hello ', 'there, ', 'traveller.']);
    const second = await complete(mock, REQ);
    expect(second.toolCalls).toEqual([{ id: 'mock-1-0', name: 'request_roll', input: { character: 'Mags' } }]);
    expect(second.stopReason).toBe('tool_use');
    expect(second.usage.inputTokens).toBe(100);
    expect((await complete(mock, REQ)).text).toBe('');
    expect(mock.requests).toHaveLength(3);
    expect(await mock.listModels()).toEqual([{ id: 'mock-dm', name: 'mock-dm' }, { id: 'mock-helper', name: 'mock-helper' }]);
  });
  it('supports function scripts, errors and aborts', async () => {
    const mock = createMockProvider((req, i) => (i === 0 ? { error: new ProviderError('server', 'boom') } : { text: `echo ${req.model}` }));
    await expect(complete(mock, REQ)).rejects.toThrow('boom');
    expect((await complete(mock, REQ)).text).toBe('echo m1');
    const ac = new AbortController();
    ac.abort();
    expect((await complete(createMockProvider([{ text: 'never shown' }]), { ...REQ, signal: ac.signal })).text).toBe('');
  });
});

describe('JSON tool fallback', () => {
  it('moves tools into the prompt and parses the fenced block, hiding it from the narration', async () => {
    const mock = createMockProvider([{ text: 'The lock clicks. ```json\n{"tool_calls":[{"name":"request_roll","input":{"character":"Mags"}}]}\n```' }]);
    const events = await collect(withJsonTools(mock).stream(REQ));
    const text = events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('');
    expect(text.trim()).toBe('The lock clicks.');
    expect(events.find((e) => e.type === 'tool_call')).toMatchObject({ name: 'request_roll', input: { character: 'Mags' } });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_use' });
    const sent = mock.requests[0]!;
    expect(sent.tools).toBeUndefined();
    expect(sent.system.at(-1)!.text).toMatch(/TOOL CALLING FORMAT[\s\S]*request_roll: Ask for a roll/);
  });
  it('passes plain replies through, including stray backticks and non-tool code blocks', async () => {
    const plain = await complete(withJsonTools(createMockProvider([{ text: 'Use the `key` now.' }])), REQ);
    expect(plain).toMatchObject({ text: 'Use the `key` now.', toolCalls: [], stopReason: 'end' });
    const code = await complete(withJsonTools(createMockProvider([{ text: 'Look: ```json\n{"hello": 1}\n```' }])), REQ);
    expect(code.toolCalls).toEqual([]);
    expect(code.text).toContain('{"hello": 1}');
    const noTools = createMockProvider([{ text: 'hi' }]);
    await complete(withJsonTools(noTools), { ...REQ, tools: [] });
    expect(noTools.requests[0]!.system).toHaveLength(2);
    expect(await withJsonTools(noTools).listModels()).toHaveLength(2);
  });
  it('flattens tool history to text', () => {
    const flat = flattenToolMessages([
      { role: 'assistant', content: [{ type: 'text', text: 'Rolling.' }, { type: 'tool_use', id: 't', name: 'request_roll', input: { character: 'Mags' } }] },
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 't', name: 'request_roll', content: '{"total":15}' }, { type: 'tool_result', toolUseId: 'u', name: 'heal', content: 'no', isError: true }] },
    ]);
    expect(flat[0]!.content).toEqual([{ type: 'text', text: 'Rolling.\n\n```json\n{"tool_calls":[{"name":"request_roll","input":{"character":"Mags"}}]}\n```' }]);
    expect(flat[1]!.content).toEqual([{ type: 'text', text: 'TOOL RESULT (request_roll): {"total":15}\n\nTOOL RESULT (heal) ERROR: no' }]);
  });
  it('tolerates malformed blocks', () => {
    expect(parseJsonToolCalls('{nope')).toEqual([]);
    expect(parseJsonToolCalls('{"tool_calls": "x"}')).toEqual([]);
    expect(parseJsonToolCalls('{"tool_calls":[{"input":{}},{"name":"heal"}]}')).toEqual([{ name: 'heal', input: {} }]);
  });
});

describe('registry and helpers', () => {
  it('builds providers from keys and reports missing keys', () => {
    expect(() => getTextProvider('openai', EMPTY_KEYS)).toThrow(/No API key is set for openai/);
    expect(() => getTextProvider('mock', EMPTY_KEYS)).toThrow(/only available in tests/);
    const keys = { ...EMPTY_KEYS, anthropic: 'a', openai: 'o', gemini: 'g', openrouter: 'r' };
    expect((['anthropic', 'openai', 'gemini', 'openrouter'] as const).map((id) => getTextProvider(id, keys).id)).toEqual(['anthropic', 'openai', 'gemini', 'openrouter']);
    const mock = createMockProvider([]);
    setProviderOverride(mock);
    expect(getTextProvider('anthropic', EMPTY_KEYS)).toBe(mock);
  });
  it('describes errors for people', () => {
    expect(describeProviderError(errorFromStatus(401, 'x'), 'OpenAI')).toMatch(/rejected the API key/);
    expect(describeProviderError(errorFromStatus(429, 'x'), 'OpenAI')).toMatch(/rate limiting/);
    expect(describeProviderError(errorFromStatus(500, 'x'), 'OpenAI')).toMatch(/server error \(500\)/);
    expect(describeProviderError(errorFromStatus(400, 'bad model'), 'OpenAI')).toBe('OpenAI rejected the request: bad model');
    expect(describeProviderError(new ProviderError('network', 'x'), 'Gemini')).toMatch(/CORS/);
    expect(describeProviderError(new ProviderError('aborted', 'x'), 'Gemini')).toBe('Cancelled.');
    expect(describeProviderError(new Error('plain'), 'X')).toBe('plain');
    expect(describeProviderError('text', 'X')).toBe('text');
  });
  it('adds usage and parses tool arguments', () => {
    expect(addUsage({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 }, { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 1 })).toEqual({ inputTokens: 2, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 5 });
    expect(parseToolArguments('')).toEqual({});
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolArguments('{"a":')).toEqual({ __invalid_json: '{"a":' });
  });
  it('estimates cost', () => {
    expect(priceFor('anthropic', 'claude-haiku-5-5')).toEqual({ inputPerM: 0.1, outputPerM: 0.5, cacheReadPerM: 0.01, cacheWritePerM: 0.125 });
    expect(priceFor('anthropic', 'claude-fable-5-2')).toMatchObject({ inputPerM: 8, outputPerM: 40 });
    expect(priceFor('anthropic', 'claude-fable-5-1')?.cacheReadPerM).toBe(0.25);
    expect(priceFor('anthropic', 'claude-fable-5')?.cacheReadPerM).toBe(1);
    expect(priceFor('openai', 'gpt-6.1-sol-2026-09-01')).toMatchObject({ inputPerM: 2, cacheReadPerM: 0.1 });
    expect(priceFor('openai', 'gpt-5')).toBeUndefined();
    const usage = { inputTokens: 1000, outputTokens: 2000, cacheReadTokens: 10000, cacheWriteTokens: 1000 };
    expect(estimateCost(usage, { inputPerM: 2, outputPerM: 10 })).toBeCloseTo((1000 + 1000 + 1250) * 2e-6 + 0.02);
    expect(estimateCost(usage, undefined)).toBeNull();
    // Explicit cache rates win over the 0.1x / 1.25x fallbacks.
    expect(estimateCost(usage, { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.05, cacheWritePerM: 3 })).toBeCloseTo((1000 * 2 + 10000 * 0.05 + 1000 * 3 + 2000 * 10) / 1e6);
    expect([formatCost(null), formatCost(0), formatCost(0.004), formatCost(1.239)]).toEqual(['', '$0', '<$0.01', '$1.24']);
    expect([formatTokens(950), formatTokens(1500), formatTokens(25_400), formatTokens(2_500_000)]).toEqual(['950', '1.5k', '25k', '2.50M']);
  });
});
