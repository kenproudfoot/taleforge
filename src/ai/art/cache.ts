import { getDb } from '@/storage/db';

/** FNV-1a 64-bit (as two 32-bit halves), hex. Stable, fast, good enough to key a cache. */
export function hashKey(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 7);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** The cache key for an image: the same prompt from the same provider and model is never paid for twice. */
export function imageKey(parts: { prompt: string; provider: string; model: string; size: string; references?: string[] }): string {
  return `img-${hashKey([parts.provider, parts.model, parts.size, parts.prompt, ...(parts.references ?? [])].join('␞'))}`;
}

export async function getCachedImage(key: string): Promise<Blob | null> {
  return (await (await getDb()).get('images', key))?.blob ?? null;
}

export async function putCachedImage(key: string, blob: Blob, meta: Record<string, string>): Promise<void> {
  await (await getDb()).put('images', { key, blob, createdAt: Date.now(), meta });
}

export async function hasCachedImage(key: string): Promise<boolean> {
  return (await (await getDb()).getKey('images', key)) !== undefined;
}
