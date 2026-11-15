import { MOODS } from '@/engine/types';
import type { Mood } from '@/engine/types';

export interface TrackInfo {
  id: string;
  file: string;
  title: string;
  moods: Mood[];
  genre: string;
  /** Loudness correction so all tracks sit at a similar level. */
  gain: number;
  source: 'owner' | 'generated';
}

export interface Catalog {
  tracks: TrackInfo[];
  defaults: Record<'fantasy' | 'noir' | 'space' | 'generic', Partial<Record<Mood, string>>>;
  sfx: { dice: string[]; click: string; success: string; fail: string; crit: string; victory: string; defeat: string };
}

export type GenreFamily = keyof Catalog['defaults'];

export function genreFamily(genre: string): GenreFamily {
  const g = genre.toLowerCase();
  if (/(noir|mystery|detective|crime|pulp)/.test(g)) return 'noir';
  if (/(space|sci|star|cyber|future)/.test(g)) return 'space';
  if (/(fantasy|medieval|myth|sword|fairy)/.test(g)) return 'fantasy';
  return 'generic';
}

/** Where the music for a mood comes from, after applying uploads, the campaign map and the defaults. */
export type MusicSource =
  | { kind: 'upload'; campaignId: string; mood: Mood; title: string }
  | { kind: 'asset'; path: string; title: string; gain: number }
  | { kind: 'bundled'; track: TrackInfo };

export function resolveMusic(
  mood: Mood,
  context: { catalog: Catalog; genre: string; audioMap: Partial<Record<Mood, string>>; uploads: Partial<Record<Mood, string>>; campaignId: string },
): MusicSource | null {
  const { catalog } = context;
  const upload = context.uploads[mood];
  if (upload) return { kind: 'upload', campaignId: context.campaignId, mood, title: upload };
  const mapped = context.audioMap[mood];
  if (mapped?.startsWith('assets/')) return { kind: 'asset', path: mapped, title: mapped.split('/').pop()!.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), gain: 1 };
  const byId = (id: string | undefined) => (id ? catalog.tracks.find((t) => t.id === id) : undefined);
  const track =
    byId(mapped?.replace(/^bundled:/, '')) ??
    byId(catalog.defaults[genreFamily(context.genre)][mood]) ??
    byId(catalog.defaults.generic[mood]) ??
    catalog.tracks.find((t) => t.moods.includes(mood));
  return track ? { kind: 'bundled', track } : null;
}

export function isMood(value: string): value is Mood {
  return (MOODS as readonly string[]).includes(value);
}
