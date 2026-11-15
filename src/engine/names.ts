/** Titles and honorifics that come before a name but are not what people call the character. */
const TITLES = new Set(
  [
    'sir', 'ser', 'dame', 'lady', 'lord', 'the', 'king', 'queen', 'prince', 'princess', 'duke', 'duchess', 'baron', 'baroness', 'count', 'countess',
    'captain', 'capt', 'commander', 'admiral', 'general', 'colonel', 'major', 'lieutenant', 'lt', 'sergeant', 'sgt', 'corporal', 'private', 'officer',
    'detective', 'det', 'inspector', 'agent', 'chief', 'doctor', 'dr', 'professor', 'prof', 'mr', 'mrs', 'ms', 'miss', 'mx', 'master', 'mistress',
    'brother', 'sister', 'father', 'mother', 'friar', 'saint', 'st', 'elder', 'old', 'young', 'little', 'big', 'uncle', 'aunt', 'granny', 'grandpa',
  ],
);

/**
 * The name people call a character by: the first word that is not a title. "Sir Rowan Greycrest" → "Rowan",
 * "Captain Isolde Varr" → "Isolde", "Dr. Ada Reyes" → "Ada", "Mags" → "Mags". A name made only of titles
 * keeps its first word.
 */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const found = words.find((w) => !TITLES.has(w.toLowerCase().replace(/[.,]/g, '')));
  return found ?? words[0] ?? name;
}
