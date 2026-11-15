import type { CampaignPack, CastEntry, Location } from '@/content/pack';
import type { PartyMember, RosterEntry } from '@/engine/types';

/** Structured description of an image. Prompts are written from these so they stay consistent. */
export type ArtSubject =
  | { kind: 'portrait'; member: PartyMember; artHint: string }
  | { kind: 'npc'; entry: Pick<RosterEntry, 'id' | 'name' | 'role' | 'look'> | CastEntry }
  | { kind: 'scene'; location: Pick<Location, 'id' | 'name' | 'imagePrompt' | 'description'> }
  | { kind: 'party'; members: PartyMember[]; location: Pick<Location, 'name' | 'imagePrompt'> }
  | { kind: 'moment'; description: string; members: PartyMember[]; locationName: string };

const NO_TEXT = 'No text, letters, captions, logos or watermarks anywhere in the image.';

function describeMember(m: PartyMember, artHint = ''): string {
  const p = m.profile;
  return [
    `${m.name}, a ${m.archetypeName.toLowerCase()}`,
    p.pronouns && `(${p.pronouns})`,
    [p.age, p.build].filter(Boolean).join(', '),
    p.features,
    p.strikingFeature && `notable: ${p.strikingFeature}`,
    p.outfit && `wearing ${p.outfit}`,
    p.signatureItem ? `carrying ${p.signatureItem}` : m.gear[0] && `carrying ${m.gear[0]}`,
    m.companion && `accompanied by ${m.companion.name}, ${m.companion.description}`,
    artHint,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * A complete, deterministic prompt from the structured subject. Used directly when no helper model is
 * available, and given to the helper as the brief otherwise.
 */
export function basePrompt(subject: ArtSubject, pack: CampaignPack): string {
  const style = `Style: ${pack.manifest.art_style}. Setting: ${pack.manifest.era}.`;
  switch (subject.kind) {
    case 'portrait':
      return `Full-body character portrait, standing in a three-quarter pose against a softly lit atmospheric backdrop that suits the setting, whole figure in frame with space above the head and below the feet. ${describeMember(subject.member, subject.artHint)}. Expressive face, detailed costume and gear. ${style} ${NO_TEXT}`;
    case 'npc': {
      const role = subject.entry.role === 'boss' ? 'a menacing antagonist' : subject.entry.role === 'enemy' ? 'a dangerous foe' : 'a memorable character';
      return `Character portrait of ${subject.entry.name}, ${role}: ${subject.entry.look}. Waist-up, dramatic lighting, atmospheric background. ${style} ${NO_TEXT}`;
    }
    case 'scene':
      return `Wide establishing shot of ${subject.location.name}: ${subject.location.imagePrompt}. Cinematic composition, strong sense of place and depth, no people in the foreground. ${style} ${NO_TEXT}`;
    case 'party':
      return `Group portrait of an adventuring party together at ${subject.location.name} (${subject.location.imagePrompt}). From left to right: ${subject.members.map((m) => describeMember(m)).join('; ')}. Everyone fully visible, confident heroic poses, wide shot. ${style} ${NO_TEXT}`;
    case 'moment':
      return `A dramatic story moment at ${subject.locationName}: ${subject.description}. ${subject.members.length ? `The characters present: ${subject.members.map((m) => describeMember(m)).join('; ')}.` : ''} Cinematic framing, dynamic lighting, wide shot. ${style} ${NO_TEXT}`;
  }
}

/** Stable identity of a subject for caching: the same subject in the same style is painted once. */
export function subjectSignature(subject: ArtSubject, pack: CampaignPack): string {
  return `${pack.id}|${pack.manifest.art_style}|${basePrompt(subject, pack)}`;
}

export const PROMPT_WRITER_SYSTEM =
  'You write prompts for an image model that illustrates a tabletop role-playing game. Rewrite the brief as one vivid, concrete paragraph of at most 110 words: subject, composition, lighting, palette and the given art style. Keep every factual detail of the brief (names are for you only: describe people by appearance, never by name). Never ask for text or lettering in the image. Reply with the prompt only.';
