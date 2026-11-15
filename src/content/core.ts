import type { Archetype } from '@/engine/types';
import { zodIssues } from './issues';
import type { Issue } from './issues';
import { parseFrontMatter, splitSections } from './markdown';
import { archetypesFrontMatter, questionsFrontMatter } from './schemas';
import type { Question } from './schemas';

export const CORE_FILES = ['rules.md', 'archetypes.md', 'character-creation.md', 'dm-style.md'] as const;
export type CoreFile = (typeof CORE_FILES)[number];

export interface CoreContent {
  /** Prose of the global rules, for the DM prompt and the in-app rules reference. */
  rules: string;
  dmStyle: string;
  archetypes: Archetype[];
  questions: Question[];
}

export interface CoreResult {
  core: CoreContent | null;
  issues: Issue[];
}

function body(text: string): string {
  return (parseFrontMatter(text)?.body ?? text).trim();
}

export function parseCore(files: Partial<Record<CoreFile, string>>): CoreResult {
  const issues: Issue[] = [];
  for (const f of CORE_FILES) {
    if (files[f] === undefined) issues.push({ severity: 'error', file: `core/${f}`, message: 'File is missing.' });
  }
  if (issues.length) return { core: null, issues };

  const archFm = parseFrontMatter(files['archetypes.md']!);
  const questFm = parseFrontMatter(files['character-creation.md']!);
  if (!archFm || archFm.errors.length) {
    issues.push({ severity: 'error', file: 'core/archetypes.md', line: archFm?.errors[0]?.line ?? 1, message: archFm?.errors[0]?.message ?? 'No YAML front matter found.' });
  }
  if (!questFm || questFm.errors.length) {
    issues.push({ severity: 'error', file: 'core/character-creation.md', line: questFm?.errors[0]?.line ?? 1, message: questFm?.errors[0]?.message ?? 'No YAML front matter found.' });
  }
  if (issues.length || !archFm || !questFm) return { core: null, issues };

  const arch = archetypesFrontMatter.safeParse(archFm.data);
  if (!arch.success) issues.push(...zodIssues(arch.error, 'core/archetypes.md', archFm));
  const quest = questionsFrontMatter.safeParse(questFm.data);
  if (!quest.success) issues.push(...zodIssues(quest.error, 'core/character-creation.md', questFm));
  if (!arch.success || !quest.success) return { core: null, issues };

  const ids = arch.data.archetypes.map((a) => a.id);
  if (new Set(ids).size !== ids.length) {
    issues.push({ severity: 'error', file: 'core/archetypes.md', message: 'Each archetype id must appear exactly once.' });
    return { core: null, issues };
  }
  const prose = new Map(splitSections(archFm.body, 3).map((s) => [s.heading, s.content]));
  const archetypes: Archetype[] = arch.data.archetypes.map((a) => ({
    id: a.id,
    name: a.name,
    summary: prose.get(a.id) || a.summary,
    stats: a.stats,
    hpBonus: a.hp_bonus,
    defenseBonus: a.defense_bonus,
    proficiencies: a.proficiencies,
    attackStat: a.attack_stat,
    weaponDie: a.weapon_die,
    signature: a.signature,
    gear: a.gear,
    artHint: a.art_hint,
  }));
  return {
    core: { rules: body(files['rules.md']!), dmStyle: body(files['dm-style.md']!), archetypes, questions: quest.data.questions },
    issues,
  };
}
