import { z } from 'zod';
import { MOODS, STATS } from './types';
import type { GameState } from './types';

// zod mirror of GameState, used to validate saves and the JSON block inside recap files.

const stat = z.enum(STATS);
const statBlock = z.object({ STR: z.number(), DEX: z.number(), CON: z.number(), INT: z.number(), WIS: z.number(), CHA: z.number() });
const rollMode = z.enum(['normal', 'advantage', 'disadvantage']);
const rollKind = z.enum(['check', 'attack', 'save']);
const weaponDie = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]);
const dieSize = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12), z.literal(20), z.literal(100)]);

const signatureEffect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heal'), dice: z.string() }),
  z.object({ type: z.literal('next_roll'), advantage: z.boolean().optional(), bonus: z.number().optional() }),
  z.object({ type: z.literal('damage_bonus'), dice: z.string() }),
  z.object({ type: z.literal('guard'), amount: z.number() }),
  z.object({ type: z.literal('narrative') }),
]);

const boon = z.discriminatedUnion('type', [
  z.object({ type: z.literal('next_roll'), advantage: z.boolean(), bonus: z.number(), source: z.string() }),
  z.object({ type: z.literal('damage_bonus'), dice: z.string(), source: z.string() }),
  z.object({ type: z.literal('guard'), amount: z.number(), source: z.string() }),
]);

export const profileSchema = z.object({
  pronouns: z.string(),
  age: z.string(),
  build: z.string(),
  features: z.string(),
  strikingFeature: z.string(),
  outfit: z.string(),
  signatureItem: z.string(),
  trait: z.string(),
  flaw: z.string(),
  hook: z.string(),
});

export const partyMemberSchema = z.object({
  id: z.string(),
  playerName: z.string(),
  playerColor: z.string(),
  name: z.string(),
  archetypeId: z.string(),
  archetypeName: z.string(),
  isCompanion: z.boolean(),
  stats: statBlock,
  proficiencies: z.array(stat),
  attackStat: stat,
  weaponDie,
  maxHp: z.number(),
  hp: z.number(),
  defense: z.number(),
  status: z.enum(['ok', 'downed', 'stable', 'out']),
  downedTurnsLeft: z.number(),
  conditions: z.array(z.string()),
  heroicPoints: z.number(),
  signature: z.object({ name: z.string(), description: z.string(), effect: signatureEffect }),
  signatureUsedInAct: z.number().nullable(),
  boons: z.array(boon),
  milestoneBoostTaken: z.boolean(),
  gear: z.array(z.string()),
  resources: z.record(z.string(), z.number()),
  profile: profileSchema,
  companion: z.object({ name: z.string(), description: z.string() }).nullable(),
});

const attack = z.object({ name: z.string(), bonus: z.number(), damage: z.string() });

export const rosterEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['ally', 'neutral', 'enemy', 'boss']),
  look: z.string(),
  hp: z.number(),
  maxHp: z.number(),
  defense: z.number(),
  attacks: z.array(attack),
  abilities: z.array(z.string()),
  tactics: z.string(),
  history: z.string(),
  stats: statBlock.partial().optional(),
  conditions: z.array(z.string()),
  improvised: z.boolean(),
  present: z.boolean(),
  status: z.enum(['active', 'defeated', 'fled', 'left', 'ally_departed']),
});

const checkResult = z.object({
  dice: z.array(z.number()),
  natural: z.number(),
  mode: rollMode,
  modifier: z.number(),
  proficiency: z.number(),
  bonus: z.number(),
  total: z.number(),
  dc: z.number(),
  success: z.boolean(),
  crit: z.boolean(),
  complication: z.boolean(),
});

const pendingRoll = z.object({
  id: z.string(),
  rollerId: z.string(),
  rollerName: z.string(),
  rollerIsParty: z.boolean(),
  kind: rollKind,
  stat,
  dc: z.number().nullable(),
  targetId: z.string().nullable(),
  targetName: z.string().nullable(),
  reason: z.string(),
  mode: rollMode,
  purpose: z.enum(['normal', 'stabilize', 'dice']),
  stage: z.enum(['main', 'heroic', 'damage']),
  die: dieSize,
  diceCount: z.number(),
  bonus: z.number(),
  heroicSpent: z.enum(['none', 'reroll', 'plus5']),
  main: checkResult.nullable(),
  notes: z.array(z.string()),
  damageBonusDice: z.string().nullable(),
});

export const gameStateSchema = z.object({
  version: z.literal(1),
  campaignId: z.string(),
  party: z.array(partyMemberSchema).min(1),
  roster: z.array(rosterEntrySchema),
  locationId: z.string().nullable(),
  improvisedLocations: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
  musicMood: z.enum(MOODS),
  actIndex: z.number().int().min(0),
  beatsCompleted: z.array(z.string()),
  milestonesDone: z.number().int().min(0),
  encounters: z.array(z.object({ id: z.string(), outcome: z.enum(['won', 'lost', 'avoided']) })),
  clues: z.array(z.object({ id: z.string(), text: z.string() })),
  items: z.array(z.object({ name: z.string(), description: z.string(), holder: z.string() })),
  partyResources: z.record(z.string(), z.number()),
  pendingRoll: pendingRoll.nullable(),
  spotlight: z.record(z.string(), z.number()),
  elapsedMs: z.number().min(0),
  turn: z.number().int().min(0),
  rollCounter: z.number().int().min(0),
  ended: z
    .object({ outcome: z.enum(['victory', 'defeat', 'bittersweet']), ending: z.string().nullable(), epilogueHint: z.string() })
    .nullable(),
});

// Compile-time guarantee that the schema and the GameState type stay in step.
type Parsed = z.infer<typeof gameStateSchema>;
const _forward = (s: Parsed): GameState => s;
const _backward = (s: GameState): Parsed => s;
void _forward;
void _backward;

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses and validates a saved state. Throws with a readable message when it is not a valid save. */
export function parseState(json: string | unknown): GameState {
  const raw: unknown = typeof json === 'string' ? JSON.parse(json) : json;
  const result = gameStateSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'state'}: ${i.message}`)
      .join('; ');
    throw new Error(`Not a valid TaleForge game state (${detail})`);
  }
  return result.data;
}
