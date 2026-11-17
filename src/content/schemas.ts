import { z } from 'zod';
import { parseDice } from '@/engine/dice';
import { MOODS, STATS } from '@/engine/types';

// zod schemas for the front matter of the five campaign files and the core content files.
// Objects are strict so that typos in field names are reported instead of silently ignored.

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const id = z.string().regex(ID_PATTERN, 'Ids use lowercase letters, digits and hyphens only');
const text = z.string().trim().min(1, 'Must not be empty');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour such as "#c9a227" (quote it in YAML)');
const stat = z.enum(STATS);
const mood = z.enum(MOODS);
const dice = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => parseDice(v) !== null, 'Must be dice notation such as 1d6+1');

export const DISPLAY_FONTS = ['Cinzel', 'Limelight', 'Orbitron', 'Spectral', 'Inter'] as const;
export const BUBBLE_STYLES = ['parchment', 'smoke', 'glass', 'plain'] as const;
export const ARCHETYPE_IDS = ['bruiser', 'infiltrator', 'sharpshooter', 'mystic', 'scholar', 'face', 'medic', 'tinkerer'] as const;
export const CONTENT_RATINGS = ['G', 'PG', 'PG-13', 'R'] as const;

const audioRef = z
  .string()
  .regex(/^(bundled:[a-z0-9-]+|assets\/[\w./ -]+\.(ogg|mp3|m4a|wav|opus))$/, 'Use "bundled:<track-id>" or a file path such as assets/music/theme.ogg');

export const campaignFrontMatter = z.strictObject({
  id,
  title: text,
  genre: text,
  era: text,
  tagline: text.max(160),
  players: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => /^[1-4](-[1-4])?$/.test(v), 'Use a number or range between 1 and 4, e.g. 1-4'),
  target_minutes: z.number().int().min(15).max(120),
  content_rating: z.enum(CONTENT_RATINGS).default('PG-13'),
  art_style: text,
  theme: z.strictObject({
    accent: hex,
    background: hex,
    display_font: z.enum(DISPLAY_FONTS).default('Cinzel'),
    bubble: z.enum(BUBBLE_STYLES).default('plain'),
  }),
  audio: z.partialRecord(mood, audioRef).default({}),
  goal: z.strictObject({ text, milestones: z.number().int().min(1).max(12) }),
  acts: z
    .array(
      z.strictObject({
        id,
        title: text,
        minutes: z.number().int().min(1).max(90),
        beats: z.array(id).min(1, 'Each act needs at least one beat'),
      }),
    )
    .min(1)
    .max(6),
  endings: z.array(id).min(1),
  hooks: z.array(text).min(1),
  key_art: z.string().regex(/^assets\/[\w./ -]+\.(svg|png|jpe?g|webp)$/, 'Use an image path such as assets/key-art.jpg').optional(),
  opening_location: id.optional(),
  /** A bonus campaign: marked with a "Bonus" sash on its card. */
  bonus: z.boolean().default(false),
});
export type CampaignFrontMatter = z.infer<typeof campaignFrontMatter>;

export const worldFrontMatter = z.strictObject({
  tone: text,
  locations: z
    .array(
      z.strictObject({
        id,
        name: text,
        image_prompt: text,
        music_mood: mood,
        connects: z.array(id).default([]),
      }),
    )
    .min(1),
  factions: z.array(z.strictObject({ id, name: text, summary: text })).default([]),
});
export type WorldFrontMatter = z.infer<typeof worldFrontMatter>;

const attack = z.strictObject({ name: text, bonus: z.number().int().min(-2).max(10), damage: dice });

export const castFrontMatter = z.strictObject({
  cast: z
    .array(
      z.strictObject({
        id,
        name: text,
        role: z.enum(['ally', 'neutral', 'enemy', 'boss']),
        look: text,
        hp: z.number().int().min(1).max(200),
        defense: z.number().int().min(5).max(22),
        attacks: z.array(attack).default([]),
        abilities: z.array(text).default([]),
        tactics: z.string().default(''),
        history: z.string().default(''),
        stats: z.partialRecord(stat, z.number().int().min(-2).max(5)).optional(),
        voice: z.string().optional(),
      }),
    )
    .min(1),
});
export type CastFrontMatter = z.infer<typeof castFrontMatter>;

export const rulesFrontMatter = z.strictObject({
  archetype_skins: z
    .partialRecord(
      z.enum(ARCHETYPE_IDS),
      z.strictObject({
        name: text,
        flavor: text,
        gear: z.array(text).min(1),
        ability_name: text.optional(),
        ability_flavor: text.optional(),
      }),
    )
    .default({}),
  resources: z
    .array(
      z.strictObject({
        id,
        name: text,
        scope: z.enum(['party', 'character']),
        max: z.number().int().min(1).max(20),
        start: z.number().int().min(0).max(20),
        description: text,
      }),
    )
    .default([]),
  extra_rules: z.array(z.strictObject({ id, name: text, text })).default([]),
  permadeath: z.boolean().default(false),
});
export type RulesFrontMatter = z.infer<typeof rulesFrontMatter>;

export const secretsFrontMatter = z.strictObject({
  secrets: z.array(z.strictObject({ id, title: text, reveal_when: text })).default([]),
});
export type SecretsFrontMatter = z.infer<typeof secretsFrontMatter>;

// ---- core files ----

const signatureEffect = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('heal'), dice }),
  z.strictObject({ type: z.literal('next_roll'), advantage: z.boolean().optional(), bonus: z.number().int().optional() }),
  z.strictObject({ type: z.literal('damage_bonus'), dice }),
  z.strictObject({ type: z.literal('guard'), amount: z.number().int().min(1) }),
  z.strictObject({ type: z.literal('narrative') }),
]);

const modifier = z.number().int().min(-1).max(3);

export const archetypesFrontMatter = z.strictObject({
  archetypes: z
    .array(
      z.strictObject({
        id: z.enum(ARCHETYPE_IDS),
        name: text,
        summary: text,
        stats: z.strictObject({ STR: modifier, DEX: modifier, CON: modifier, INT: modifier, WIS: modifier, CHA: modifier }),
        hp_bonus: z.number().int().min(0).max(8),
        defense_bonus: z.number().int().min(0).max(4),
        proficiencies: z.array(stat).min(1).max(3),
        attack_stat: stat,
        weapon_die: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
        signature: z.strictObject({ name: text, description: text, effect: signatureEffect }),
        gear: z.array(text).min(1),
        art_hint: text,
      }),
    )
    .length(ARCHETYPE_IDS.length, `There must be exactly ${ARCHETYPE_IDS.length} archetypes`),
});

export const QUESTION_TYPES = ['text', 'longtext', 'choice', 'color', 'archetype', 'stat', 'hook', 'companion'] as const;

export const questionsFrontMatter = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-zA-Z]*$/),
        label: text,
        type: z.enum(QUESTION_TYPES),
        required: z.boolean().default(false),
        surprise: z.boolean().default(false),
        help: z.string().default(''),
        placeholder: z.string().default(''),
        options: z.array(text).default([]),
      }),
    )
    .min(1),
});
export type Question = z.infer<typeof questionsFrontMatter>['questions'][number];
