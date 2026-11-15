import { providerFetch } from '../providers/http';
import { ProviderError } from '../providers/types';
import type { ModelInfo } from '../providers/types';

export type ImageSize = 'portrait' | 'landscape' | 'square';
export type ImageProviderId = 'openai' | 'gemini' | 'custom';

export interface ImageRequest {
  prompt: string;
  size: ImageSize;
  /** Images the result should stay consistent with (character portraits). Used where supported. */
  references?: Blob[];
  signal?: AbortSignal;
}

export interface ImageProvider {
  id: ImageProviderId;
  listModels(): Promise<ModelInfo[]>;
  generate(req: ImageRequest): Promise<Blob>;
}

/** Interface only: short video clips for key moments are planned but not built yet. */
export interface VideoProvider {
  id: string;
  generate(req: { prompt: string; seconds: number; references?: Blob[]; signal?: AbortSignal }): Promise<Blob>;
}

export const PIXELS: Record<ImageSize, { width: number; height: number }> = {
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
  square: { width: 1024, height: 1024 },
};

export function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** OpenAI images: text-to-image, or the edits endpoint when reference images are given. */
export function createOpenAiImages(apiKey: string, model: string): ImageProvider {
  const auth = { authorization: `Bearer ${apiKey}` };
  const size = (s: ImageSize) => `${PIXELS[s].width}x${PIXELS[s].height}`;
  const decode = async (res: Response) => {
    const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) return base64ToBlob(first.b64_json);
    if (first?.url) return (await providerFetch(first.url, {})).blob();
    throw new ProviderError('server', 'The image service returned no image.');
  };
  return {
    id: 'openai',
    async listModels() {
      const res = await providerFetch('https://api.openai.com/v1/models', { headers: auth });
      const data = (await res.json()) as { data: Array<{ id: string }> };
      return data.data
        .map((m) => m.id)
        .filter((id) => /image|dall-e/i.test(id) && !/audio|realtime/i.test(id))
        .sort((a, b) => b.localeCompare(a))
        .map((id) => ({ id, name: id }));
    },
    async generate(req) {
      if (req.references?.length) {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', req.prompt);
        form.append('size', size(req.size));
        req.references.slice(0, 8).forEach((ref, i) => form.append('image[]', ref, `reference-${i}.png`));
        return decode(await providerFetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: auth, body: form, signal: req.signal }));
      }
      return decode(
        await providerFetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt: req.prompt, size: size(req.size), n: 1 }),
          signal: req.signal,
        }),
      );
    },
  };
}

const GEMINI_ASPECT: Record<ImageSize, string> = { portrait: '2:3', landscape: '3:2', square: '1:1' };

/** Gemini image models through generateContent. References travel as inline image parts. */
export function createGeminiImages(apiKey: string, model: string): ImageProvider {
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  return {
    id: 'gemini',
    async listModels() {
      const res = await providerFetch(`${base}/models?pageSize=200`, { headers });
      const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
      return (data.models ?? [])
        .filter((m) => /image/i.test(m.name) && (m.supportedGenerationMethods ?? []).some((g) => g === 'generateContent' || g === 'predict'))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName ?? m.name }));
    },
    async generate(req) {
      const refs = await Promise.all((req.references ?? []).slice(0, 4).map(async (b) => ({ inlineData: { mimeType: b.type || 'image/png', data: await blobToBase64(b) } })));
      const res = await providerFetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers,
        signal: req.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [...refs, { text: req.prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: GEMINI_ASPECT[req.size] } },
        }),
      });
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> };
      const image = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!image?.data) throw new ProviderError('server', 'The image service returned no image (it may have declined the prompt).');
      return base64ToBlob(image.data, image.mimeType || 'image/png');
    },
  };
}

export interface CustomEndpoint {
  url: string;
  authHeader: string;
  authValue: string;
  /** JSON body with {{prompt}}, {{width}} and {{height}} placeholders. */
  bodyTemplate: string;
  /** Dot path to the image in the response: base64, a data: URL or an http URL (e.g. "data.0.b64_json"). */
  responsePath: string;
}

/** Fills the body template. The prompt is JSON-escaped so quotes in it cannot break the JSON. */
export function fillTemplate(template: string, values: { prompt: string; width: number; height: number }): string {
  const prompt = JSON.stringify(values.prompt).slice(1, -1);
  return template.replaceAll('{{prompt}}', prompt).replaceAll('{{width}}', String(values.width)).replaceAll('{{height}}', String(values.height));
}

/** Reads "a.b.0.c" style paths out of parsed JSON. */
export function readPath(data: unknown, path: string): unknown {
  let node = data;
  for (const part of path.split('.').filter(Boolean)) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Any other image service, configured in Settings without code. */
export function createCustomImages(config: CustomEndpoint): ImageProvider {
  return {
    id: 'custom',
    listModels: async () => [],
    async generate(req) {
      if (!config.url) throw new ProviderError('bad_request', 'Set the custom endpoint URL in Settings.');
      let body: string;
      try {
        body = fillTemplate(config.bodyTemplate, { prompt: req.prompt, ...PIXELS[req.size] });
        JSON.parse(body);
      } catch {
        throw new ProviderError('bad_request', 'The custom request template is not valid JSON once filled in.');
      }
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.authHeader && config.authValue) headers[config.authHeader] = config.authValue;
      const res = await providerFetch(config.url, { method: 'POST', headers, body, signal: req.signal });
      if ((res.headers.get('content-type') ?? '').startsWith('image/')) return res.blob();
      const value = readPath(await res.json(), config.responsePath);
      if (typeof value !== 'string' || !value) throw new ProviderError('server', `No image found at "${config.responsePath}" in the response.`);
      if (/^https?:\/\//.test(value)) return (await providerFetch(value, {})).blob();
      return base64ToBlob(value, /^data:([^;]+)/.exec(value)?.[1] ?? 'image/png');
    },
  };
}

export interface ImageSettingsLike {
  provider: 'auto' | 'none' | ImageProviderId;
  model: string;
  custom: CustomEndpoint;
}

/** Which provider is in use: explicit choice, or "auto" = OpenAI, then Gemini, else none. */
export function resolveImageProvider(s: ImageSettingsLike, keys: { openai: string; gemini: string }): ImageProviderId | null {
  if (s.provider === 'none') return null;
  if (s.provider === 'custom') return s.custom.url ? 'custom' : null;
  if (s.provider === 'openai') return keys.openai ? 'openai' : null;
  if (s.provider === 'gemini') return keys.gemini ? 'gemini' : null;
  return keys.openai ? 'openai' : keys.gemini ? 'gemini' : null;
}

export const DEFAULT_IMAGE_MODEL: Record<ImageProviderId, string> = { openai: 'gpt-image-1', gemini: 'gemini-2.5-flash-image', custom: '' };

let override: ImageProvider | null = null;
export function setImageOverride(provider: ImageProvider | null): void {
  override = provider;
}

export function getImageProvider(s: ImageSettingsLike, keys: { openai: string; gemini: string }): ImageProvider | null {
  if (override) return override;
  const id = resolveImageProvider(s, keys);
  const model = s.model || (id ? DEFAULT_IMAGE_MODEL[id] : '');
  if (id === 'openai') return createOpenAiImages(keys.openai, model);
  if (id === 'gemini') return createGeminiImages(keys.gemini, model);
  if (id === 'custom') return createCustomImages(s.custom);
  return null;
}
