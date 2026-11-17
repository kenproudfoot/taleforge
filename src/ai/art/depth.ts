import { getCachedImage, putCachedImage } from './cache';

/** Turns a picture into a depth map PNG (white = near). */
export type DepthEstimator = (image: Blob) => Promise<Blob>;

/** Where a picture's depth map is kept in the image store, next to the picture itself. */
export const depthKey = (imageKey: string) => `${imageKey}:depth`;

let override: DepthEstimator | null = null;
let worker: DepthEstimator | null = null;
/** After the model fails to load (offline, no WebAssembly), stop trying for the rest of the page's life. */
let broken = false;
let queue: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<Blob | null>>();

/** Tests and the offline demo swap in a fake estimator (no model download). */
export function setDepthOverride(fn: DepthEstimator | null): void {
  override = fn;
  broken = false;
}

function workerEstimator(): DepthEstimator | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  const w = new Worker(new URL('./depth.worker.ts', import.meta.url), { type: 'module' });
  let next = 0;
  const waiting = new Map<number, { resolve(b: Blob): void; reject(e: Error): void }>();
  w.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
    const job = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    if (e.data.blob) job?.resolve(e.data.blob);
    else job?.reject(new Error(e.data.error ?? 'depth failed'));
  };
  w.onerror = () => {
    for (const job of waiting.values()) job.reject(new Error('depth worker crashed'));
    waiting.clear();
  };
  worker = (image) =>
    new Promise<Blob>((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      w.postMessage({ id, image });
    });
  return worker;
}

/**
 * The depth map for a stored picture: from the store when it was made before, otherwise estimated (one at a
 * time, so a burst of new pictures never stacks up model runs) and stored. Null when depth is unavailable.
 */
export function depthMapFor(imageKey: string): Promise<Blob | null> {
  const known = pending.get(imageKey);
  if (known) return known;
  const job = (async () => {
    const stored = await getCachedImage(depthKey(imageKey));
    if (stored) return stored;
    const estimate = override ?? (broken ? null : workerEstimator());
    if (!estimate) return null;
    const run = queue.then(async () => {
      const image = await getCachedImage(imageKey);
      if (!image) return null;
      try {
        const depth = await estimate(image);
        await putCachedImage(depthKey(imageKey), depth, { kind: 'depth', of: imageKey });
        return depth;
      } catch {
        if (!override) broken = true;
        return null;
      }
    });
    queue = run.catch(() => null);
    return run;
  })();
  pending.set(imageKey, job);
  void job.then((b) => b ?? pending.delete(imageKey));
  return job;
}

/** For tests: forget the queue, the failure flag and remembered jobs. */
export function resetDepthForTests(): void {
  pending.clear();
  queue = Promise.resolve();
  broken = false;
  override = null;
}
