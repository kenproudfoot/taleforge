import type { Mood } from '@/engine/types';
import type { MusicSource } from './tracks';

export interface PreviewDeps {
  /** URL of a bundled track file (see music.ts audioUrl). */
  trackUrl(file: string): string;
  /** URL of a file inside the campaign pack, or null when the pack does not have it. */
  assetUrl(path: string): string | null;
  /** The player's uploaded track for this campaign and mood. */
  upload(campaignId: string, mood: Mood): Promise<Blob | null>;
}

/**
 * Where to fetch a mood's track for a quick listen in the campaign details. Uploads come back as object
 * URLs: `revoke` is true for those, so the caller frees them when the preview stops.
 */
export async function previewSource(source: MusicSource, deps: PreviewDeps): Promise<{ url: string; gain: number; revoke: boolean } | null> {
  if (source.kind === 'bundled') return { url: deps.trackUrl(source.track.file), gain: source.track.gain, revoke: false };
  if (source.kind === 'asset') {
    const url = deps.assetUrl(source.path);
    return url ? { url, gain: source.gain, revoke: false } : null;
  }
  const blob = await deps.upload(source.campaignId, source.mood);
  return blob ? { url: URL.createObjectURL(blob), gain: 1, revoke: true } : null;
}

/** Preview loudness: the player's music volume, but never so quiet (or muted) that the button seems broken. */
export function previewVolume(musicVolume: number, gain: number): number {
  return Math.max(0, Math.min(1, Math.max(0.25, musicVolume) * gain));
}
