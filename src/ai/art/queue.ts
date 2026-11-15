// A small priority job queue: highest priority first, limited concurrency, retries with backoff.
// Pure TypeScript with an injectable clock, so it is fully unit-testable.

export const PRIORITY = { portrait: 40, currentScene: 30, party: 25, nextScene: 20, npc: 15, moment: 10 } as const;

export interface Job<T> {
  key: string;
  priority: number;
  run(signal: AbortSignal): Promise<T>;
}

export type JobState = 'queued' | 'running' | 'done' | 'failed';

export interface QueueOptions {
  concurrency: number;
  retries?: number;
  /** Delay before retry n (1-based). */
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Errors that should not be retried (bad key, rejected prompt). */
  isFatal?: (error: unknown) => boolean;
}

interface Entry<T> {
  job: Job<T>;
  seq: number;
  state: JobState;
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
  abort: AbortController;
}

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

export class JobQueue<T> {
  private entries = new Map<string, Entry<T>>();
  private seq = 0;
  private running = 0;
  private listeners = new Set<() => void>();

  constructor(private options: QueueOptions) {}

  setConcurrency(n: number): void {
    this.options.concurrency = Math.max(1, n);
    this.pump();
  }

  /**
   * Adds a job. A job with the same key is not added twice: the existing promise is returned, and a
   * higher priority raises the queued job (a prefetched scene becomes the current scene).
   */
  add(job: Job<T>): Promise<T> {
    const existing = this.entries.get(job.key);
    if (existing && existing.state !== 'failed') {
      if (existing.state === 'queued' && job.priority > existing.job.priority) existing.job = { ...existing.job, priority: job.priority };
      return existing.promise;
    }
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => undefined);
    this.entries.set(job.key, { job, seq: this.seq++, state: 'queued', promise, resolve, reject, abort: new AbortController() });
    this.notify();
    this.pump();
    return promise;
  }

  state(key: string): JobState | undefined {
    return this.entries.get(key)?.state;
  }

  /** Keys waiting or running, highest priority first. */
  pending(): string[] {
    return [...this.entries.values()]
      .filter((e) => e.state === 'queued' || e.state === 'running')
      .sort((a, b) => b.job.priority - a.job.priority || a.seq - b.seq)
      .map((e) => e.job.key);
  }

  get active(): number {
    return this.running;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Cancels everything (closing the game). */
  clear(): void {
    for (const e of this.entries.values()) {
      if (e.state === 'queued' || e.state === 'running') {
        e.abort.abort();
        e.state = 'failed';
        e.reject(new Error('cancelled'));
      }
    }
    this.entries.clear();
    this.notify();
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  private next(): Entry<T> | undefined {
    let best: Entry<T> | undefined;
    for (const e of this.entries.values()) {
      if (e.state !== 'queued') continue;
      if (!best || e.job.priority > best.job.priority || (e.job.priority === best.job.priority && e.seq < best.seq)) best = e;
    }
    return best;
  }

  private pump(): void {
    while (this.running < this.options.concurrency) {
      const entry = this.next();
      if (!entry) return;
      entry.state = 'running';
      this.running++;
      this.notify();
      void this.execute(entry);
    }
  }

  private async execute(entry: Entry<T>): Promise<void> {
    const retries = this.options.retries ?? 2;
    const backoff = this.options.backoffMs ?? ((n) => 1500 * 2 ** (n - 1));
    const sleep = this.options.sleep ?? defaultSleep;
    let attempt = 0;
    for (;;) {
      try {
        const value = await entry.job.run(entry.abort.signal);
        entry.state = 'done';
        entry.resolve(value);
        break;
      } catch (error) {
        attempt++;
        const fatal = entry.abort.signal.aborted || this.options.isFatal?.(error);
        if (fatal || attempt > retries) {
          entry.state = 'failed';
          entry.reject(error);
          break;
        }
        await sleep(backoff(attempt), entry.abort.signal);
      }
    }
    this.running--;
    this.notify();
    this.pump();
  }
}
