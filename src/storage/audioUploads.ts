import type { Mood } from '@/engine/types';
import { getDb } from './db';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** A player's own music for one mood of one campaign. Overrides the campaign's choice. */
export async function saveUpload(campaignId: string, mood: Mood, file: File): Promise<void> {
  if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|ogg|opus|wav|aac|flac|webm)$/i.test(file.name)) throw new Error('That file is not an audio file.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`That file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  await (await getDb()).put('audio', { key: `${campaignId}:${mood}`, campaignId, mood, name: file.name, blob: file });
}

export async function removeUpload(campaignId: string, mood: Mood): Promise<void> {
  await (await getDb()).delete('audio', `${campaignId}:${mood}`);
}

/** mood -> file name of every upload for a campaign. */
export async function listUploads(campaignId: string): Promise<Partial<Record<Mood, string>>> {
  const all = await (await getDb()).getAllFromIndex('audio', 'campaignId', campaignId);
  return Object.fromEntries(all.map((u) => [u.mood, u.name]));
}

export async function getUpload(campaignId: string, mood: Mood): Promise<Blob | null> {
  return (await (await getDb()).get('audio', `${campaignId}:${mood}`))?.blob ?? null;
}
