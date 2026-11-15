// Plain serializable data types for the game engine. No classes, no functions in state.

export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Stat = (typeof STATS)[number];
export type StatBlock = Record<Stat, number>;

export const MOODS = ['title', 'exploration', 'tension', 'combat', 'calm', 'mystery', 'triumph', 'defeat'] as const;
export type Mood = (typeof MOODS)[number];

export type DieSize = 4 | 6 | 8 | 10 | 12 | 20 | 100;
export type WeaponDie = 4 | 6 | 8 | 10;
export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type RollKind = 'check' | 'attack' | 'save';

/** What a signature ability does mechanically. Flavor text lives in the content files. */
export type SignatureEffect =
  | { type: 'heal'; dice: string }
  | { type: 'next_roll'; advantage?: boolean; bonus?: number }
  | { type: 'damage_bonus'; dice: string }
  | { type: 'guard'; amount: number }
  | { type: 'narrative' };

export interface Archetype {
  id: string;
  name: string;
  summary: string;
  stats: StatBlock;
  hpBonus: number;
  defenseBonus: number;
  proficiencies: Stat[];
  attackStat: Stat;
  weaponDie: WeaponDie;
  signature: { name: string; description: string; effect: SignatureEffect };
  gear: string[];
  artHint: string;
}

export interface CharacterProfile {
  pronouns: string;
  age: string;
  build: string;
  features: string;
  strikingFeature: string;
  outfit: string;
  signatureItem: string;
  trait: string;
  flaw: string;
  hook: string;
}

export interface Companion {
  name: string;
  description: string;
}

/** A pending bonus created by a signature ability, consumed by the next matching roll or hit. */
export type Boon =
  | { type: 'next_roll'; advantage: boolean; bonus: number; source: string }
  | { type: 'damage_bonus'; dice: string; source: string }
  | { type: 'guard'; amount: number; source: string };

export type PartyStatus = 'ok' | 'downed' | 'stable' | 'out';

export interface PartyMember {
  id: string;
  /** The real person at the table who controls this character. */
  playerName: string;
  playerColor: string;
  name: string;
  archetypeId: string;
  /** Campaign re-skin of the archetype, e.g. "Cat burglar". */
  archetypeName: string;
  isCompanion: boolean;
  stats: StatBlock;
  proficiencies: Stat[];
  attackStat: Stat;
  weaponDie: WeaponDie;
  maxHp: number;
  hp: number;
  defense: number;
  status: PartyStatus;
  /** Turns left before a downed character is out of the fight. */
  downedTurnsLeft: number;
  conditions: string[];
  heroicPoints: number;
  signature: { name: string; description: string; effect: SignatureEffect };
  /** Index of the act in which the signature ability was last used, or null. */
  signatureUsedInAct: number | null;
  boons: Boon[];
  milestoneBoostTaken: boolean;
  gear: string[];
  resources: Record<string, number>;
  profile: CharacterProfile;
  companion: Companion | null;
}

export type CastRole = 'ally' | 'neutral' | 'enemy' | 'boss';

export interface AttackDef {
  name: string;
  bonus: number;
  /** Dice notation, e.g. "1d6+2". */
  damage: string;
}

/** A cast entry as declared by a campaign (the template a roster entry is created from). */
export interface CastTemplate {
  id: string;
  name: string;
  role: CastRole;
  look: string;
  hp: number;
  defense: number;
  attacks: AttackDef[];
  abilities: string[];
  tactics: string;
  history: string;
  stats?: Partial<StatBlock>;
}

export type RosterStatus = 'active' | 'defeated' | 'fled' | 'left' | 'ally_departed';

export interface RosterEntry extends CastTemplate {
  maxHp: number;
  conditions: string[];
  improvised: boolean;
  /** True while the entry is in the current scene. */
  present: boolean;
  status: RosterStatus;
}

export interface ResourceDef {
  id: string;
  name: string;
  scope: 'character' | 'party';
  max: number;
  start: number;
  description: string;
}

/** The slice of a campaign pack the engine needs. Built by src/content from the markdown files. */
export interface EngineCampaign {
  id: string;
  title: string;
  targetMinutes: number;
  goal: { text: string; milestones: number };
  acts: Array<{ id: string; title: string; minutes: number; beats: string[] }>;
  locations: Array<{ id: string; name: string; musicMood: Mood }>;
  cast: CastTemplate[];
  resources: ResourceDef[];
  endings: string[];
  permadeath: boolean;
}

export interface PendingRoll {
  id: string;
  /** Party member id or roster id. */
  rollerId: string;
  rollerName: string;
  rollerIsParty: boolean;
  kind: RollKind;
  stat: Stat;
  dc: number | null;
  targetId: string | null;
  targetName: string | null;
  reason: string;
  mode: RollMode;
  purpose: 'normal' | 'stabilize';
  stage: 'main' | 'heroic' | 'damage';
  die: DieSize;
  /** How many dice the roller must produce at this stage. */
  diceCount: number;
  bonus: number;
  heroicSpent: 'none' | 'reroll' | 'plus5';
  main: CheckResult | null;
  /** Notes about boons consumed, shown on the roll card. */
  notes: string[];
  damageBonusDice: string | null;
}

export interface CheckResult {
  dice: number[];
  natural: number;
  mode: RollMode;
  modifier: number;
  proficiency: number;
  bonus: number;
  total: number;
  dc: number;
  success: boolean;
  crit: boolean;
  complication: boolean;
}

export interface DamageResult {
  dice: number[];
  modifier: number;
  bonus: number;
  total: number;
  crit: boolean;
}

/** The finished record of a roll: shown as a roll card and returned to the DM as the tool result. */
export interface RollReport {
  id: string;
  rollerId: string;
  rollerName: string;
  kind: RollKind;
  stat: Stat;
  reason: string;
  targetName: string | null;
  check: CheckResult;
  damage: DamageResult | null;
  heroicSpent: 'none' | 'reroll' | 'plus5';
  notes: string[];
  consequences: string[];
}

export interface Clue {
  id: string;
  text: string;
}

export interface Item {
  name: string;
  description: string;
  /** Party member id, or "party" for shared items. */
  holder: string;
}

export interface EncounterRecord {
  id: string;
  outcome: 'won' | 'lost' | 'avoided';
}

export type CampaignOutcome = 'victory' | 'defeat' | 'bittersweet';

export interface GameState {
  version: 1;
  campaignId: string;
  party: PartyMember[];
  roster: RosterEntry[];
  locationId: string | null;
  /** Places the DM invented that are not in the campaign's world file. */
  improvisedLocations: Array<{ id: string; name: string; description: string }>;
  musicMood: Mood;
  actIndex: number;
  beatsCompleted: string[];
  milestonesDone: number;
  encounters: EncounterRecord[];
  clues: Clue[];
  items: Item[];
  partyResources: Record<string, number>;
  pendingRoll: PendingRoll | null;
  /** How many turns each party member has taken; drives fair spotlight rotation. */
  spotlight: Record<string, number>;
  /** Play time in milliseconds (paused time excluded). */
  elapsedMs: number;
  turn: number;
  rollCounter: number;
  ended: { outcome: CampaignOutcome; ending: string | null; epilogueHint: string } | null;
}

export type ChipTone = 'neutral' | 'good' | 'bad' | 'info';

/** Side effects the UI and services react to. The engine itself never performs them. */
export type Effect =
  | { type: 'chip'; text: string; tone: ChipTone }
  | { type: 'roll_requested'; rollId: string }
  | { type: 'roll_report'; report: RollReport }
  | { type: 'scene_changed'; locationId: string }
  | { type: 'music'; mood: Mood }
  | { type: 'image_request'; description: string; includeParty: boolean }
  | { type: 'roster_added'; id: string }
  | { type: 'roster_removed'; id: string; reason: RosterStatus }
  | { type: 'act_advanced'; actIndex: number }
  | { type: 'milestone_boost_available' }
  | { type: 'campaign_ended'; outcome: CampaignOutcome };
