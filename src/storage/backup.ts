import { blobToBase64, base64ToBlob } from '@/ai/art/providers';
import type { Session } from '@/game/session';
import { getCachedImage, putCachedImage } from '@/ai/art/cache';
import { parseSession, persistable } from './sessions';

export interface SessionBackup {
  app: 'taleforge';
  kind: 'session';
  exportedAt: string;
  session: Session;
  /** Image cache key -> data URL, so portraits and scenes come along. */
  images: Record<string, string>;
}

export function imageKeysOf(session: Session): string[] {
  const keys = new Set<string>([
    ...Object.values(session.images.portraits),
    ...Object.values(session.images.scenes),
    ...Object.values(session.images.cards ?? {}),
    ...(session.images.party ? [session.images.party] : []),
    ...(session.images.current ? [session.images.current] : []),
    ...session.chat.flatMap((e) => (e.kind === 'image' ? [e.imageKey] : [])),
  ]);
  return [...keys];
}

/** A complete backup of one game, including its pictures. */
export async function exportSession(session: Session, getImage = getCachedImage, now = new Date()): Promise<string> {
  const images: Record<string, string> = {};
  for (const key of imageKeysOf(session)) {
    const blob = await getImage(key);
    if (blob && typeof blob.arrayBuffer === 'function') images[key] = `data:${blob.type || 'image/png'};base64,${await blobToBase64(blob)}`;
  }
  const backup: SessionBackup = { app: 'taleforge', kind: 'session', exportedAt: now.toISOString(), session: persistable(session), images };
  return JSON.stringify(backup);
}

/** Reads a backup file, restores its pictures to the image cache and returns the session. */
export async function importSession(json: string, putImage = putCachedImage): Promise<Session> {
  let data: Partial<SessionBackup>;
  try {
    data = JSON.parse(json) as Partial<SessionBackup>;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data.app !== 'taleforge' || data.kind !== 'session' || !data.session) throw new Error('That file is not a TaleForge game backup.');
  const session = parseSession(data.session);
  for (const [key, url] of Object.entries(data.images ?? {})) {
    const type = /^data:([^;]+)/.exec(url)?.[1] ?? 'image/png';
    await putImage(key, base64ToBlob(url, type), { kind: 'restored' });
  }
  return session;
}
