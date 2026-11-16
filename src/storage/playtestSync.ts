import type { PlaytestLog } from '@/game/playtest';
import { playtestFileId } from '@/game/playtest';

/**
 * Sends playtest logs to TaleForge's own server, which writes them to the playtests/ folder next to the app
 * (see scripts/lib/playtestServer.ts). Nothing goes anywhere else. When the page is not served by that
 * server (the hosted web version), the endpoint is missing and logs stay in the browser's saved game.
 */
export const PLAYTEST_ENDPOINT = '/local/playtest';

let available: Promise<boolean> | null = null;
const pending = new Map<string, PlaytestLog>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Whether this server can store playtest logs (checked once). */
export function playtestServerAvailable(): Promise<boolean> {
  available ??= fetch(PLAYTEST_ENDPOINT)
    .then(async (res) => res.ok && ((await res.json()) as { enabled?: boolean }).enabled === true)
    .catch(() => false);
  return available;
}

async function flush(): Promise<void> {
  timer = null;
  if (!(await playtestServerAvailable())) {
    pending.clear();
    return;
  }
  const logs = [...pending.values()];
  pending.clear();
  for (const log of logs) {
    try {
      await fetch(`${PLAYTEST_ENDPOINT}/${encodeURIComponent(playtestFileId(log))}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(log) });
    } catch {
      // A missed write is caught up by the next save.
    }
  }
}

/** Queues the newest log of a game; writes are batched so a burst of saves sends one file. */
export function queuePlaytestLog(log: PlaytestLog, delayMs = 1500): void {
  pending.set(log.sessionId, log);
  timer ??= setTimeout(() => void flush(), delayMs);
}

/** Test helper. */
export function resetPlaytestSync(): void {
  available = null;
  pending.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}
