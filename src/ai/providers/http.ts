import { ProviderError, errorFromStatus } from './types';

/** fetch that maps network failures, aborts and HTTP errors onto ProviderError. */
export async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (init.signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw new ProviderError('aborted', 'Request cancelled');
    throw new ProviderError('network', e instanceof Error ? e.message : 'Network error');
  }
  if (!res.ok) throw errorFromStatus(res.status, await errorMessage(res));
  return res;
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const data = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const msg = typeof data.error === 'string' ? data.error : (data.error?.message ?? data.message);
    if (msg) return msg;
  } catch {
    // not JSON
  }
  return text.slice(0, 300) || `HTTP ${res.status}`;
}

/** Parses a Server-Sent Events body, yielding the `data:` payload of each event. */
export async function* sseData(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const takeEvents = function* (flush: boolean): Generator<string> {
    for (;;) {
      const match = /\r?\n\r?\n/.exec(buffer);
      let chunk: string;
      if (match) {
        chunk = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
      } else if (flush && buffer.trim()) {
        chunk = buffer;
        buffer = '';
      } else return;
      const data = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) yield data;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      yield* takeEvents(false);
    }
    buffer += decoder.decode();
    yield* takeEvents(true);
  } catch (e) {
    if (signal?.aborted) throw new ProviderError('aborted', 'Request cancelled');
    throw new ProviderError('network', e instanceof Error ? e.message : 'Stream interrupted');
  } finally {
    reader.releaseLock();
  }
}
