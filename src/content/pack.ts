import type { z } from 'zod';
import type { Archetype, CastTemplate, EngineCampaign, Mood, ResourceDef } from '@/engine/types';
import { hasErrors, zodIssues } from './issues';
import type { Issue } from './issues';
import { parseFrontMatter, preamble, sectionText, splitSections, subsections } from './markdown';
import type { FrontMatter } from './markdown';
import {
  campaignFrontMatter,
  castFrontMatter,
  rulesFrontMatter,
  secretsFrontMatter,
  worldFrontMatter,
} from './schemas';
import type { CampaignFrontMatter, RulesFrontMatter } from './schemas';

export const PACK_FILES = ['campaign.md', 'world.md', 'cast.md', 'rules.md', 'secrets.md'] as const;
export type PackFile = (typeof PACK_FILES)[number];
export type PackFiles = Record<PackFile, string>;

export interface Location {
  id: string;
  name: string;
  imagePrompt: string;
  musicMood: Mood;
  connects: string[];
  description: string;
}

export interface CastEntry extends CastTemplate {
  voice: string;
  /** Extra prose from the `### id` section of cast.md. */
  notes: string;
}

export interface Secret {
  id: string;
  title: string;
  revealWhen: string;
  text: string;
}

export interface CampaignPack {
  id: string;
  manifest: CampaignFrontMatter;
  overview: string;
  opening: string;
  beats: Record<string, string>;
  endings: Record<string, string>;
  world: { tone: string; lore: string; locations: Location[]; factions: Array<{ id: string; name: string; summary: string }> };
  cast: CastEntry[];
  rules: RulesFrontMatter & { prose: string };
  secrets: Secret[];
  players: { min: number; max: number };
}

export interface PackContext {
  /** Asset paths present in the pack folder (e.g. "assets/key-art.svg"). When given, references are checked. */
  assets?: string[];
  /** Ids of bundled music tracks. When given, "bundled:<id>" references are checked. */
  bundledTracks?: string[];
  /** Folder name the pack was loaded from. When given, it must match the campaign id. */
  folder?: string;
}

export interface PackResult {
  pack: CampaignPack | null;
  issues: Issue[];
}

function readFile<S extends z.ZodType>(
  file: PackFile,
  files: Partial<PackFiles>,
  schema: S,
  issues: Issue[],
): { data: z.output<S>; fm: FrontMatter } | null {
  const text = files[file];
  if (text === undefined) {
    issues.push({ severity: 'error', file, message: 'File is missing.', fix: `Add ${file} to the campaign folder. Every pack needs: ${PACK_FILES.join(', ')}.` });
    return null;
  }
  const fm = parseFrontMatter(text);
  if (!fm) {
    issues.push({
      severity: 'error',
      file,
      line: 1,
      message: 'No YAML front matter found.',
      fix: 'Start the file with a line containing only ---, then the YAML fields, then another --- line.',
    });
    return null;
  }
  if (fm.errors.length) {
    for (const e of fm.errors) {
      issues.push({ severity: 'error', file, line: e.line, message: `YAML syntax error: ${e.message}`, fix: 'Check indentation, quotes and colons on this line. Quote text that contains ":" or "#".' });
    }
    return null;
  }
  const parsed = schema.safeParse(fm.data ?? {});
  if (!parsed.success) {
    issues.push(...zodIssues(parsed.error, file, fm));
    return null;
  }
  return { data: parsed.data, fm };
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const i of ids) (seen.has(i) ? dup : seen).add(i);
  return [...dup];
}

/** Parses and validates the five files of a campaign pack. `pack` is null when there are errors. */
export function parseCampaignPack(files: Partial<PackFiles>, context: PackContext = {}): PackResult {
  const issues: Issue[] = [];
  const error = (file: PackFile, message: string, extra: Partial<Issue> = {}) => issues.push({ severity: 'error', file, message, ...extra });
  const warn = (file: PackFile, message: string, extra: Partial<Issue> = {}) => issues.push({ severity: 'warning', file, message, ...extra });

  const campaign = readFile('campaign.md', files, campaignFrontMatter, issues);
  const world = readFile('world.md', files, worldFrontMatter, issues);
  const cast = readFile('cast.md', files, castFrontMatter, issues);
  const rules = readFile('rules.md', files, rulesFrontMatter, issues);
  const secrets = readFile('secrets.md', files, secretsFrontMatter, issues);
  if (!campaign || !world || !cast || !rules || !secrets) return { pack: null, issues };

  const m = campaign.data;
  const cfm = campaign.fm;

  // ---- campaign.md ----
  if (context.folder && context.folder !== m.id) {
    error('campaign.md', `The folder is named "${context.folder}" but the campaign id is "${m.id}".`, {
      line: cfm.lineOf(['id']),
      field: 'id',
      fix: `Rename the folder to "${m.id}" or change the id to "${context.folder}".`,
    });
  }
  const overview = sectionText(cfm.body, 'Overview');
  if (!overview) {
    error('campaign.md', 'Missing the "## Overview" section.', { line: cfm.bodyLine, fix: 'Add "## Overview" with the premise and feel of the campaign.' });
  }
  const opening = sectionText(cfm.body, 'Opening');
  if (!opening) {
    warn('campaign.md', 'No "## Opening" section.', { line: cfm.bodyLine, fix: 'Add "## Opening" describing the first scene the DM should narrate.' });
  }
  const beatSections = subsections(cfm.body, 'Beats');
  const allBeats = m.acts.flatMap((a) => a.beats);
  for (const d of duplicates(m.acts.map((a) => a.id))) error('campaign.md', `Act id "${d}" is used more than once.`, { field: 'acts', line: cfm.lineOf(['acts']), fix: 'Give every act a unique id.' });
  for (const d of duplicates(allBeats)) error('campaign.md', `Beat "${d}" appears in more than one place.`, { field: 'acts', line: cfm.lineOf(['acts']), fix: 'Each beat id may be listed in exactly one act.' });
  m.acts.forEach((act, ai) => {
    act.beats.forEach((beat, bi) => {
      if (!beatSections.has(beat)) {
        error('campaign.md', `Beat "${beat}" has no description.`, {
          field: `acts.${ai}.beats.${bi}`,
          line: cfm.lineOf(['acts', ai, 'beats', bi]),
          fix: `Add a "### ${beat}" section under "## Beats" describing what happens and what success or failure leads to.`,
        });
      }
    });
  });
  for (const [heading, s] of beatSections) {
    if (!allBeats.includes(heading)) {
      warn('campaign.md', `Section "### ${heading}" is not listed in any act.`, {
        line: cfm.bodyLine + s.line - 1,
        fix: `Add "${heading}" to an act's beats list, or remove the section.`,
      });
    }
  }
  const minutes = m.acts.reduce((n, a) => n + a.minutes, 0);
  if (Math.abs(minutes - m.target_minutes) > m.target_minutes * 0.2) {
    warn('campaign.md', `Act budgets add up to ${minutes} minutes but target_minutes is ${m.target_minutes}.`, {
      field: 'acts',
      line: cfm.lineOf(['acts']),
      fix: 'Adjust the act minutes so they add up to roughly target_minutes.',
    });
  }
  const endingSections = subsections(cfm.body, 'Endings');
  for (const d of duplicates(m.endings)) error('campaign.md', `Ending "${d}" is listed twice.`, { field: 'endings', line: cfm.lineOf(['endings']) });
  m.endings.forEach((ending, i) => {
    if (!endingSections.has(ending)) {
      error('campaign.md', `Ending "${ending}" has no description.`, {
        field: `endings.${i}`,
        line: cfm.lineOf(['endings', i]),
        fix: `Add a "### ${ending}" section under "## Endings" describing how the story ends.`,
      });
    }
  });
  if (m.goal.milestones > allBeats.length) {
    warn('campaign.md', `The goal has ${m.goal.milestones} milestones but there are only ${allBeats.length} beats.`, {
      field: 'goal.milestones',
      line: cfm.lineOf(['goal', 'milestones']),
      fix: 'Use at most one milestone per beat.',
    });
  }
  for (const [moodName, ref] of Object.entries(m.audio)) {
    if (!ref) continue;
    const line = cfm.lineOf(['audio', moodName]);
    if (ref.startsWith('bundled:')) {
      const track = ref.slice('bundled:'.length);
      if (context.bundledTracks && !context.bundledTracks.includes(track)) {
        error('campaign.md', `Unknown bundled track "${track}".`, { field: `audio.${moodName}`, line, fix: `Use one of: ${context.bundledTracks.join(', ') || '(no bundled tracks found)'}.` });
      }
    } else if (context.assets && !context.assets.includes(ref)) {
      error('campaign.md', `Audio file "${ref}" is not in the pack.`, { field: `audio.${moodName}`, line, fix: `Add the file at ${ref} or point this mood at a bundled track.` });
    }
  }
  if (m.key_art && context.assets && !context.assets.includes(m.key_art)) {
    error('campaign.md', `Key art "${m.key_art}" is not in the pack.`, { field: 'key_art', line: cfm.lineOf(['key_art']), fix: `Add the image at ${m.key_art} or remove key_art.` });
  }

  // ---- world.md ----
  const w = world.data;
  const locationIds = w.locations.map((l) => l.id);
  for (const d of duplicates(locationIds)) error('world.md', `Location id "${d}" is used more than once.`, { field: 'locations', line: world.fm.lineOf(['locations']), fix: 'Give every location a unique id.' });
  const locationProse = subsections(world.fm.body, 'Locations');
  w.locations.forEach((loc, i) => {
    loc.connects.forEach((target, ci) => {
      if (!locationIds.includes(target)) {
        error('world.md', `Location "${loc.id}" connects to unknown location "${target}".`, {
          field: `locations.${i}.connects.${ci}`,
          line: world.fm.lineOf(['locations', i, 'connects', ci]),
          fix: `Use one of: ${locationIds.join(', ')}.`,
        });
      }
    });
    if (!locationProse.has(loc.id)) {
      warn('world.md', `Location "${loc.id}" has no prose description.`, {
        field: `locations.${i}`,
        line: world.fm.lineOf(['locations', i]),
        fix: `Add a "### ${loc.id}" section under "## Locations" with what the party finds there.`,
      });
    }
  });
  if (m.opening_location && !locationIds.includes(m.opening_location)) {
    error('campaign.md', `opening_location "${m.opening_location}" is not a location in world.md.`, {
      field: 'opening_location',
      line: cfm.lineOf(['opening_location']),
      fix: `Use one of: ${locationIds.join(', ')}.`,
    });
  }

  // ---- cast.md ----
  const c = cast.data.cast;
  for (const d of duplicates(c.map((e) => e.id))) error('cast.md', `Cast id "${d}" is used more than once.`, { field: 'cast', line: cast.fm.lineOf(['cast']), fix: 'Give every cast entry a unique id.' });
  c.forEach((entry, i) => {
    if ((entry.role === 'enemy' || entry.role === 'boss') && entry.attacks.length === 0) {
      error('cast.md', `${entry.name} is an ${entry.role} but has no attacks.`, {
        field: `cast.${i}.attacks`,
        line: cast.fm.lineOf(['cast', i]),
        fix: 'Add at least one attack, e.g. attacks: [{ name: Claw, bonus: 3, damage: 1d6+1 }]',
      });
    }
  });
  if (!c.some((e) => e.role === 'boss')) {
    warn('cast.md', 'No cast entry has role "boss".', { field: 'cast', line: cast.fm.lineOf(['cast']), fix: 'Mark the final antagonist with role: boss so the climax has teeth.' });
  }
  const castNotes = splitSections(cast.fm.body, 3);

  // ---- rules.md ----
  const r = rules.data;
  for (const d of duplicates(r.resources.map((x) => x.id))) error('rules.md', `Resource id "${d}" is used more than once.`, { field: 'resources', line: rules.fm.lineOf(['resources']) });
  r.resources.forEach((res, i) => {
    if (res.start > res.max) {
      error('rules.md', `Resource "${res.id}" starts at ${res.start}, above its max of ${res.max}.`, {
        field: `resources.${i}.start`,
        line: rules.fm.lineOf(['resources', i, 'start']),
        fix: `Set start to ${res.max} or lower.`,
      });
    }
  });

  // ---- secrets.md ----
  const s = secrets.data.secrets;
  for (const d of duplicates(s.map((x) => x.id))) error('secrets.md', `Secret id "${d}" is used more than once.`, { field: 'secrets', line: secrets.fm.lineOf(['secrets']) });
  const secretProse = new Map(splitSections(secrets.fm.body, 3).map((sec) => [sec.heading, sec.content]));
  s.forEach((secret, i) => {
    if (!secretProse.get(secret.id)) {
      error('secrets.md', `Secret "${secret.id}" has no text.`, {
        field: `secrets.${i}`,
        line: secrets.fm.lineOf(['secrets', i]),
        fix: `Add a "### ${secret.id}" section with the hidden truth the DM should know.`,
      });
    }
  });

  if (hasErrors(issues)) return { pack: null, issues };

  const [min, max] = m.players.includes('-') ? m.players.split('-').map(Number) : [Number(m.players), Number(m.players)];
  const pack: CampaignPack = {
    id: m.id,
    manifest: m,
    overview,
    opening,
    beats: Object.fromEntries([...beatSections].map(([k, v]) => [k, v.text])),
    endings: Object.fromEntries([...endingSections].map(([k, v]) => [k, v.text])),
    world: {
      tone: w.tone,
      lore: sectionText(world.fm.body, 'Lore') || preamble(world.fm.body, 2),
      locations: w.locations.map((l) => ({
        id: l.id,
        name: l.name,
        imagePrompt: l.image_prompt,
        musicMood: l.music_mood,
        connects: l.connects,
        description: locationProse.get(l.id)?.text ?? '',
      })),
      factions: w.factions,
    },
    cast: c.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      look: e.look,
      hp: e.hp,
      defense: e.defense,
      attacks: e.attacks,
      abilities: e.abilities,
      tactics: e.tactics,
      history: e.history,
      ...(e.stats ? { stats: e.stats } : {}),
      voice: e.voice ?? '',
      notes: castNotes.find((n) => n.heading === e.id)?.content ?? '',
    })),
    rules: { ...r, prose: rules.fm.body.trim() },
    secrets: s.map((x) => ({ id: x.id, title: x.title, revealWhen: x.reveal_when, text: secretProse.get(x.id) ?? '' })),
    players: { min: min ?? 1, max: max ?? 4 },
  };
  return { pack, issues };
}

/** The slice of a pack the engine needs. */
export function toEngineCampaign(pack: CampaignPack): EngineCampaign {
  const m = pack.manifest;
  const opening = m.opening_location;
  const locations = pack.world.locations.map((l) => ({ id: l.id, name: l.name, musicMood: l.musicMood }));
  if (opening) locations.sort((a, b) => Number(b.id === opening) - Number(a.id === opening));
  return {
    id: pack.id,
    title: m.title,
    targetMinutes: m.target_minutes,
    goal: { text: m.goal.text, milestones: m.goal.milestones },
    acts: m.acts.map((a) => ({ id: a.id, title: a.title, minutes: a.minutes, beats: [...a.beats] })),
    locations,
    cast: pack.cast.map(({ voice: _voice, notes: _notes, ...template }) => template),
    resources: pack.rules.resources as ResourceDef[],
    endings: [...m.endings],
    permadeath: pack.rules.permadeath,
  };
}

/** Applies the campaign's re-skins (name, flavor, gear, ability flavor) to the core archetypes. */
export function skinArchetypes(core: Archetype[], pack: CampaignPack): Archetype[] {
  return core.map((a) => {
    const skin = pack.rules.archetype_skins[a.id as keyof RulesFrontMatter['archetype_skins']];
    if (!skin) return a;
    return {
      ...a,
      name: skin.name,
      summary: skin.flavor,
      gear: [...skin.gear],
      signature: {
        ...a.signature,
        name: skin.ability_name ?? a.signature.name,
        description: skin.ability_flavor ? `${skin.ability_flavor} (${a.signature.description})` : a.signature.description,
      },
    };
  });
}
