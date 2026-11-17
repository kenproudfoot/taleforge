import type { CampaignPack } from './pack';
import type { CampaignFrontMatter } from './schemas';

/** What the campaign picker needs to draw a card, without loading the whole pack. */
export interface CampaignSummary {
  id: string;
  title: string;
  genre: string;
  era: string;
  tagline: string;
  players: string;
  targetMinutes: number;
  contentRating: string;
  theme: CampaignFrontMatter['theme'];
  keyArt: string | null;
  /** Optional so an older index without the field still reads as false. */
  bonus?: boolean;
}

export function summarizePack(pack: CampaignPack): CampaignSummary {
  const m = pack.manifest;
  return {
    id: m.id,
    title: m.title,
    genre: m.genre,
    era: m.era,
    tagline: m.tagline,
    players: m.players,
    targetMinutes: m.target_minutes,
    contentRating: m.content_rating,
    theme: m.theme,
    keyArt: m.key_art ?? null,
    bonus: m.bonus,
  };
}
