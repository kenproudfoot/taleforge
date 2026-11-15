import { useEffect, useState } from 'react';
import { getDb } from '@/storage/db';

const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Resolves an image cache key to an object URL (kept for the life of the page). */
export function storedImageUrl(key: string): Promise<string | null> {
  const ready = urls.get(key);
  if (ready) return Promise.resolve(ready);
  let p = pending.get(key);
  if (!p) {
    p = getDb()
      .then((db) => db.get('images', key))
      .then((record) => {
        pending.delete(key);
        if (!record) return null;
        const url = URL.createObjectURL(record.blob);
        urls.set(key, url);
        return url;
      })
      .catch(() => {
        pending.delete(key);
        return null;
      });
    pending.set(key, p);
  }
  return p;
}

/** React hook: the object URL for a stored image key, or null while loading or when absent. */
export function useStoredImage(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(key ? (urls.get(key) ?? null) : null);
  useEffect(() => {
    let live = true;
    if (!key) {
      setUrl(null);
      return;
    }
    setUrl(urls.get(key) ?? null);
    void storedImageUrl(key).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [key]);
  return url;
}
