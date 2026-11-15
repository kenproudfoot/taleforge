import { askHelper, extractJson } from '@/ai/helper';
import type { CampaignPack } from '@/content/pack';
import type { Archetype } from '@/engine/types';
import { SURPRISE_FIELDS } from './characters';
import type { CharacterAnswers, SurpriseField } from './characters';

const FIELD_HINTS: Record<SurpriseField, string> = {
  name: 'a fitting character name (first and last, or a single evocative name)',
  age: 'age range, a few words',
  build: 'body build, a few words',
  features: 'skin, hair and eyes in one short phrase',
  strikingFeature: 'one striking physical feature, one short phrase',
  outfit: 'outfit and style in one sentence',
  signatureItem: 'a signature weapon or item with one vivid detail',
  trait: 'a personality trait, a few words',
  flaw: 'a flaw or fear, a few words',
  hook: 'one sentence, addressed to "you", tying the character to this story',
};

function context(pack: CampaignPack, archetype: Archetype | undefined, a: CharacterAnswers): string {
  const m = pack.manifest;
  const known = SURPRISE_FIELDS.filter((f) => a[f].trim()).map((f) => `${f}: ${a[f].trim()}`);
  return [
    `Campaign: ${m.title} (${m.genre}). Setting: ${m.era}. Tone: ${pack.world.tone}`,
    archetype ? `Role: ${archetype.name}. ${archetype.summary}` : '',
    a.pronouns ? `Pronouns: ${a.pronouns}` : '',
    known.length ? `Already decided:\n${known.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const SYSTEM =
  'You help players create characters for a tabletop role-playing game. Be concrete, evocative and brief. Match the campaign setting and tone, keep it PG-13, and never contradict what is already decided. Reply with JSON only.';

/** Asks the helper model to fill in the given fields so they fit the campaign and the character so far. */
export async function surpriseFields(
  pack: CampaignPack,
  archetype: Archetype | undefined,
  answers: CharacterAnswers,
  fields: SurpriseField[],
): Promise<Partial<Record<SurpriseField, string>>> {
  if (fields.length === 0) return {};
  const wanted = fields.map((f) => `"${f}": ${FIELD_HINTS[f]}`).join('\n');
  const reply = await askHelper({
    system: SYSTEM,
    user: `${context(pack, archetype, answers)}\n\nInvent these, as a JSON object with exactly these string keys:\n${wanted}`,
    maxTokens: 600,
  });
  const data = extractJson<Record<string, unknown>>(reply);
  if (!data || Array.isArray(data)) throw new Error('The helper model did not return a usable answer. Try again.');
  const out: Partial<Record<SurpriseField, string>> = {};
  for (const f of fields) {
    const value = data[f];
    if (typeof value === 'string' && value.trim()) out[f] = value.trim().slice(0, 240);
  }
  if (Object.keys(out).length === 0) throw new Error('The helper model did not return a usable answer. Try again.');
  return out;
}

/** Five name ideas that suit the campaign and role. */
export async function suggestNames(pack: CampaignPack, archetype: Archetype | undefined, answers: CharacterAnswers): Promise<string[]> {
  const reply = await askHelper({
    system: SYSTEM,
    user: `${context(pack, archetype, { ...answers, name: '' })}\n\nSuggest five distinct character names that fit. Reply as a JSON array of five strings.`,
    maxTokens: 200,
  });
  const data = extractJson<unknown>(reply);
  const names = Array.isArray(data) ? data.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim().slice(0, 60)) : [];
  if (names.length === 0) throw new Error('The helper model did not return any names. Try again.');
  return names.slice(0, 5);
}
