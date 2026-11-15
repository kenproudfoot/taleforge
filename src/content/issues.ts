import type { z } from 'zod';
import type { FrontMatter } from './markdown';

export interface Issue {
  severity: 'error' | 'warning';
  file: string;
  line?: number;
  field?: string;
  message: string;
  /** A concrete suggestion for fixing the problem. */
  fix?: string;
}

export function formatIssue(issue: Issue): string {
  const where = [issue.file, issue.line].filter((x) => x !== undefined).join(':');
  const field = issue.field ? ` [${issue.field}]` : '';
  const fix = issue.fix ? `\n    fix: ${issue.fix}` : '';
  return `${issue.severity.toUpperCase()} ${where}${field} ${issue.message}${fix}`;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** Example values offered as fix suggestions, keyed by field name. */
const EXAMPLES: Record<string, string> = {
  id: 'id: the-sunken-crown   (lowercase letters, digits and hyphens)',
  title: 'title: The Sunken Crown',
  genre: 'genre: medieval-fantasy',
  era: 'era: "A drowned kingdom, long ago"',
  tagline: 'tagline: "One short sentence that sells the adventure."',
  players: 'players: 1-4',
  target_minutes: 'target_minutes: 45',
  content_rating: 'content_rating: PG-13',
  art_style: 'art_style: "painterly 3D fantasy, warm torchlight"',
  theme: 'theme: { accent: "#d9b45a", background: "#0e0f14", display_font: Cinzel, bubble: parchment }',
  accent: 'accent: "#d9b45a"   (a quoted hex colour)',
  background: 'background: "#0e0f14"   (a quoted hex colour)',
  goal: 'goal: { text: "What the party must achieve.", milestones: 5 }',
  milestones: 'milestones: 5',
  acts: 'acts:\n      - { id: act1, title: "The Road", minutes: 12, beats: [arrive, ambush] }',
  minutes: 'minutes: 15',
  beats: 'beats: [first-beat, second-beat]',
  endings: 'endings: [victory, bittersweet, defeat]',
  hooks: 'hooks: ["You owe the village a debt."]',
  locations: 'locations:\n      - { id: village, name: "Mossford", image_prompt: "a foggy riverside village", music_mood: calm }',
  image_prompt: 'image_prompt: "what the place looks like, for the scene painter"',
  music_mood: 'music_mood: exploration',
  cast: 'cast:\n      - { id: goblin, name: "Goblin Scout", role: enemy, look: "wiry, green", hp: 7, defense: 12, attacks: [{ name: Knife, bonus: 3, damage: 1d6+1 }], abilities: [], tactics: "Hit and run." }',
  role: 'role: enemy',
  look: 'look: "what they look like, for the portrait painter"',
  hp: 'hp: 10',
  defense: 'defense: 12',
  damage: 'damage: 1d6+1',
  bonus: 'bonus: 3',
  reveal_when: 'reveal_when: "The party opens the sealed vault."',
  secrets: 'secrets:\n      - { id: true-king, title: "The king is alive", reveal_when: "The party reaches the throne." }',
  scope: 'scope: party',
};

function valueAt(data: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let node: unknown = data;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  return node;
}

function describeExpected(issue: z.core.$ZodIssue, missing: boolean): string | undefined {
  const leaf = String(issue.path[issue.path.length - 1] ?? '');
  if (issue.code === 'invalid_value') return `Use one of: ${issue.values.map(String).join(', ')}.`;
  if (issue.code === 'unrecognized_keys') return `Remove or rename ${issue.keys.map((k) => `"${k}"`).join(', ')} (check for typos).`;
  const example = EXAMPLES[leaf];
  if (issue.code === 'invalid_type' && missing) {
    return example ? `Add it, e.g. ${example}` : `Add the "${leaf}" field.`;
  }
  if (example) return `Expected something like ${example}`;
  return undefined;
}

function describeProblem(issue: z.core.$ZodIssue, missing: boolean): string {
  const leaf = String(issue.path[issue.path.length - 1] ?? 'value');
  if (issue.code === 'invalid_type' && missing) return `Missing required field "${leaf}".`;
  if (issue.code === 'invalid_type') return `"${leaf}" must be ${issue.expected}.`;
  if (issue.code === 'unrecognized_keys') return `Unknown field${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.join(', ')}.`;
  if (issue.code === 'invalid_value') return `"${leaf}" has an unsupported value.`;
  return issue.message.endsWith('.') ? issue.message : `${issue.message}.`;
}

/** Converts zod issues into file/line/field/fix issues using the front matter's source positions. */
export function zodIssues(error: z.ZodError, file: string, fm: FrontMatter): Issue[] {
  return error.issues.map((issue) => {
    const missing = valueAt(fm.data, issue.path) === undefined;
    const path = issue.code === 'unrecognized_keys' && issue.keys[0] ? [...issue.path, issue.keys[0]] : issue.path;
    return {
      severity: 'error' as const,
      file,
      line: fm.lineOf(path),
      field: issue.path.length ? issue.path.join('.') : undefined,
      message: describeProblem(issue, missing),
      fix: describeExpected(issue, missing),
    };
  });
}
