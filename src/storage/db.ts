import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { PackFiles } from '@/content/pack';
import type { CampaignSummary } from '@/content/summary';

export interface StoredCampaign {
  id: string;
  files: PackFiles;
  /** Asset path (e.g. "assets/key-art.jpg") -> file contents. */
  assets: Record<string, Blob>;
  summary: CampaignSummary;
  importedAt: number;
}

export interface StoredImage {
  key: string;
  blob: Blob;
  createdAt: number;
  /** Free-form metadata: prompt, provider, model, kind. */
  meta: Record<string, string>;
}

export interface StoredAudio {
  /** `${campaignId}:${mood}` */
  key: string;
  campaignId: string;
  mood: string;
  name: string;
  blob: Blob;
}

interface TaleForgeDB extends DBSchema {
  kv: { key: string; value: unknown };
  campaigns: { key: string; value: StoredCampaign };
  sessions: { key: string; value: { id: string; updatedAt: number } & Record<string, unknown>; indexes: { updatedAt: number } };
  images: { key: string; value: StoredImage };
  audio: { key: string; value: StoredAudio; indexes: { campaignId: string } };
}

export type DB = IDBPDatabase<TaleForgeDB>;

const DB_NAME = 'taleforge';
let dbPromise: Promise<DB> | null = null;

export function getDb(): Promise<DB> {
  dbPromise ??= openDB<TaleForgeDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('kv');
      db.createObjectStore('campaigns', { keyPath: 'id' });
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('images', { keyPath: 'key' });
      db.createObjectStore('audio', { keyPath: 'key' }).createIndex('campaignId', 'campaignId');
    },
  });
  return dbPromise;
}

/** Closes and forgets the connection (tests use this to start from a clean database). */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('could not delete database'));
    req.onblocked = () => resolve();
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await getDb()).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('kv', value, key);
}

export async function kvDelete(key: string): Promise<void> {
  await (await getDb()).delete('kv', key);
}
