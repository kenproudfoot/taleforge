import { useEffect, useState } from 'react';
import { depthMapFor } from '@/ai/art/depth';

const urls = new Map<string, string>();

/**
 * The depth map URL for a stored picture, made on first use. `failed` is true when depth is unavailable
 * (no model, offline), so the caller can fall back to a gentler effect.
 */
export function useDepthMap(imageKey: string | null | undefined, enabled: boolean): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ key: string | null; url: string | null; failed: boolean }>({ key: null, url: null, failed: false });
  const key = enabled && imageKey ? imageKey : null;
  useEffect(() => {
    if (!key) return;
    const known = urls.get(key);
    if (known) {
      setState({ key, url: known, failed: false });
      return;
    }
    let live = true;
    void depthMapFor(key).then((blob) => {
      if (!live) return;
      if (!blob) return setState({ key, url: null, failed: true });
      const url = urls.get(key) ?? URL.createObjectURL(blob);
      urls.set(key, url);
      setState({ key, url, failed: false });
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return { url: null, failed: false };
  if (state.key !== key) return { url: urls.get(key) ?? null, failed: false };
  return { url: state.url, failed: state.failed };
}
