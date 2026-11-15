export interface VoiceInfo {
  id: string;
  name: string;
  /** "female", "male" or "" when unknown. */
  gender?: string;
  description?: string;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const FEMALE = /\b(woman|women|girl|female|lady|queen|mother|sister|witch|she|her|priestess|duchess|madam|grandmother)\b/i;
const MALE = /\b(man|men|boy|male|lord|king|father|brother|he|him|his|priest|duke|sir|grandfather)\b/i;

/** Guesses a voice gender from a free-text hint such as "elderly woman, low and steady". */
export function genderHint(hint: string): 'female' | 'male' | '' {
  if (FEMALE.test(hint)) return 'female';
  if (MALE.test(hint)) return 'male';
  return '';
}

/**
 * Picks a voice for each speaker. The narrator keeps the chosen narrator voice; every NPC gets a stable
 * voice of its own (the same name always maps to the same voice), preferring a matching gender when the
 * provider says which voices are which, and avoiding the narrator's voice when there is a choice.
 */
export function castVoice(
  speaker: string | null,
  voices: VoiceInfo[],
  narratorVoice: string,
  options: { overrides?: Record<string, string>; hints?: Record<string, string>; npcVoices?: boolean } = {},
): string {
  const narrator = voices.some((v) => v.id === narratorVoice) ? narratorVoice : (voices[0]?.id ?? narratorVoice);
  if (speaker === null || options.npcVoices === false) return narrator;
  const key = speaker.trim().toLowerCase();
  const override = options.overrides?.[key];
  if (override && voices.some((v) => v.id === override)) return override;
  let pool = voices.filter((v) => v.id !== narrator);
  if (pool.length === 0) return narrator;
  const wanted = genderHint(options.hints?.[key] ?? '');
  if (wanted) {
    const matching = pool.filter((v) => v.gender?.toLowerCase() === wanted);
    if (matching.length) pool = matching;
  }
  return pool[hash(key) % pool.length]!.id;
}
