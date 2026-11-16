import type { CampaignPack, CastEntry, Location } from '@/content/pack';
import type { PartyMember, RosterEntry } from '@/engine/types';

/** Structured description of an image. Prompts are written from these so they stay consistent. */
export type ArtSubject =
  | { kind: 'portrait'; member: PartyMember; artHint: string }
  | { kind: 'npc'; entry: Pick<RosterEntry, 'id' | 'name' | 'role' | 'look'> | CastEntry; variation?: number }
  | {
      kind: 'scene';
      location: Pick<Location, 'id' | 'name' | 'imagePrompt' | 'description'>;
      /** Party members who appear somewhere in the shot (not posing). Empty or absent: an empty establishing shot. */
      members?: PartyMember[];
      /** Which visit this is (1 = first): later visits ask for a fresh view of the same place. */
      variation?: number;
    }
  | { kind: 'party'; members: PartyMember[]; location: Pick<Location, 'name' | 'imagePrompt'> }
  | { kind: 'moment'; description: string; members: PartyMember[]; locationName: string };

const NO_TEXT = 'No text, letters, captions, logos or watermarks anywhere in the image.';

/** Fresh framings for a place or person seen again, so a return visit never shows the same picture. */
const SCENE_VIEWS = [
  'seen from a new vantage point at ground level, looking deeper into the place',
  'seen from a higher angle that takes in more of the surroundings',
  'a closer view of a different corner of the place, rich in small details',
  'seen from the far side, looking back the way the party came',
  'a low dramatic angle with strong foreground shapes',
];
const NPC_VIEWS = [
  'a different pose and expression, mid-gesture',
  'seen in profile, caught in a quiet moment',
  'leaning in close, sharper lighting',
  'a new angle in a different part of the scene, telling body language',
];

function view(list: string[], variation: number | undefined): string {
  return variation && variation > 1 ? ` This time: ${list[(variation - 2) % list.length]}.` : '';
}

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

/** What a character looks like, in the player's own words: the details every picture of them must show. */
export function lookOf(m: PartyMember): string {
  const p = m.profile;
  return [
    [p.age, p.build, p.pronouns && `(${p.pronouns})`].filter(Boolean).join(' '),
    p.features,
    p.strikingFeature,
    p.outfit && `wearing ${p.outfit}`,
    p.signatureItem && `carrying ${p.signatureItem}`,
  ]
    .filter(Boolean)
    .join('; ');
}

function membersOf(subject: ArtSubject): PartyMember[] {
  if (subject.kind === 'portrait') return [subject.member];
  if (subject.kind === 'party' || subject.kind === 'moment') return subject.members;
  if (subject.kind === 'scene') return subject.members ?? [];
  return [];
}

/**
 * Appended to every prompt that shows party members, after the helper model has written it, so a rewrite can
 * never drop a detail such as "purple hair" or "clown makeup". The first `references` characters each have a
 * reference image (their portrait), sent in the same order.
 */
export function appearanceLock(subject: ArtSubject, references = 0): string {
  const members = membersOf(subject);
  if (members.length === 0) return '';
  const one = members.length === 1;
  const lines = members.map((m, i) => `${one ? 'The character' : `Character ${i + 1}`}${i < references ? ` (reference image ${i + 1})` : ''}: ${lookOf(m)}.`);
  return [
    `${one ? 'The character must look exactly like this' : 'Each character must look exactly like this'}, with every detail clearly visible (hair colour, face, makeup, skin, clothing and materials):`,
    ...lines,
    references > 0 && `Match each referenced character's face, hair, makeup and outfit to their reference image exactly; only pose, expression and lighting may change.`,
  ]
    .filter(Boolean)
    .join('\n');
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
      return `Character portrait of ${subject.entry.name}, ${role}: ${subject.entry.look}. Waist-up, dramatic lighting, atmospheric background.${view(NPC_VIEWS, subject.variation)} ${style} ${NO_TEXT}`;
    }
    case 'scene':
      if (subject.members?.length) {
        return `Wide establishing shot of ${subject.location.name}: ${subject.location.imagePrompt}. The place is the subject; the adventurers are part of it, in the middle distance, going about their business rather than posing: ${subject.members.map((m) => describeMember(m)).join('; ')}. Cinematic composition, strong sense of place and depth.${view(SCENE_VIEWS, subject.variation)} ${style} ${NO_TEXT}`;
      }
      return `Wide establishing shot of ${subject.location.name}: ${subject.location.imagePrompt}. Cinematic composition, strong sense of place and depth, no people in the foreground.${view(SCENE_VIEWS, subject.variation)} ${style} ${NO_TEXT}`;
    case 'party':
      return `Group portrait of an adventuring party together at ${subject.location.name} (${subject.location.imagePrompt}). From left to right: ${subject.members.map((m) => describeMember(m)).join('; ')}. Everyone fully visible, confident heroic poses, wide shot. ${style} ${NO_TEXT}`;
    case 'moment':
      return `A dramatic story moment at ${subject.locationName}: ${subject.description}. ${subject.members.length ? `The characters present: ${subject.members.map((m) => describeMember(m)).join('; ')}.` : ''} Cinematic framing, dynamic lighting, wide shot. ${style} ${NO_TEXT}`;
  }
}

/** Identity of a subject for caching: the same subject in the same style (and the same game and visit) is painted once. */
export function subjectSignature(subject: ArtSubject, pack: CampaignPack): string {
  return `${pack.id}|${pack.manifest.art_style}|${basePrompt(subject, pack)}`;
}

export const PROMPT_WRITER_SYSTEM =
  'You write prompts for an image model that illustrates a tabletop role-playing game. Rewrite the brief as one vivid, concrete paragraph of at most 140 words: subject, composition, lighting, palette and the given art style. Keep every factual detail of the brief, and copy each person\'s hair, face, makeup, skin and clothing words exactly as given, never generalized (names are for you only: describe people by appearance, never by name). Never ask for text or lettering in the image. Reply with the prompt only.';
