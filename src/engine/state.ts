import { bumpStat, defenseFor, maxHpFor } from './rules';
import type {
  Archetype,
  CastTemplate,
  CharacterProfile,
  Companion,
  EngineCampaign,
  GameState,
  PartyMember,
  RosterEntry,
  Stat,
} from './types';

export interface CharacterDraft {
  id: string;
  playerName: string;
  playerColor: string;
  name: string;
  /** The archetype, already re-skinned for the campaign. */
  archetype: Archetype;
  bump: Stat;
  profile: CharacterProfile;
  companion: Companion | null;
  isCompanion?: boolean;
}

export const EMPTY_PROFILE: CharacterProfile = {
  pronouns: '',
  age: '',
  build: '',
  features: '',
  strikingFeature: '',
  outfit: '',
  signatureItem: '',
  trait: '',
  flaw: '',
  hook: '',
};

export function createPartyMember(draft: CharacterDraft, campaign: EngineCampaign): PartyMember {
  const a = draft.archetype;
  const stats = bumpStat(a.stats, draft.bump);
  const maxHp = maxHpFor(stats, a.hpBonus);
  const resources: Record<string, number> = {};
  for (const r of campaign.resources) if (r.scope === 'character') resources[r.id] = r.start;
  const gear = [...a.gear];
  if (draft.profile.signatureItem.trim()) gear.unshift(draft.profile.signatureItem.trim());
  return {
    id: draft.id,
    playerName: draft.playerName,
    playerColor: draft.playerColor,
    name: draft.name,
    archetypeId: a.id,
    archetypeName: a.name,
    isCompanion: draft.isCompanion ?? false,
    stats,
    proficiencies: [...a.proficiencies],
    attackStat: a.attackStat,
    weaponDie: a.weaponDie,
    maxHp,
    hp: maxHp,
    defense: defenseFor(stats, a.defenseBonus),
    status: 'ok',
    downedTurnsLeft: 0,
    conditions: [],
    heroicPoints: 1,
    signature: structuredClone(a.signature),
    signatureUsedInAct: null,
    boons: [],
    milestoneBoostTaken: false,
    gear,
    resources,
    profile: { ...draft.profile },
    companion: draft.companion ? { ...draft.companion } : null,
  };
}

export function createGame(campaign: EngineCampaign, party: PartyMember[]): GameState {
  if (party.length < 1) throw new Error('a game needs at least one party member');
  const ids = new Set(party.map((p) => p.id));
  if (ids.size !== party.length) throw new Error('party member ids must be unique');
  const partyResources: Record<string, number> = {};
  for (const r of campaign.resources) if (r.scope === 'party') partyResources[r.id] = r.start;
  const first = campaign.locations[0];
  return {
    version: 1,
    campaignId: campaign.id,
    party: structuredClone(party),
    roster: [],
    locationId: first?.id ?? null,
    improvisedLocations: [],
    musicMood: first?.musicMood ?? 'exploration',
    actIndex: 0,
    beatsCompleted: [],
    milestonesDone: 0,
    encounters: [],
    clues: [],
    items: [],
    partyResources,
    pendingRoll: null,
    spotlight: Object.fromEntries(party.map((p) => [p.id, 0])),
    elapsedMs: 0,
    turn: 0,
    rollCounter: 0,
    ended: null,
  };
}

export function rosterEntryFromTemplate(t: CastTemplate, improvised = false): RosterEntry {
  return {
    ...structuredClone(t),
    maxHp: t.hp,
    conditions: [],
    improvised,
    present: true,
    status: 'active',
  };
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'entry';
}

function norm(text: string): string {
  return text.trim().toLowerCase();
}

function matchByName<T extends { id: string; name: string }>(list: T[], ref: string): T | undefined {
  const r = norm(ref);
  if (!r) return undefined;
  return (
    list.find((e) => norm(e.id) === r) ??
    list.find((e) => norm(e.name) === r) ??
    list.find((e) => norm(e.name).split(/\s+/)[0] === r) ??
    list.find((e) => norm(e.name).includes(r) || slugify(e.name) === slugify(ref))
  );
}

/** Finds a party member by id, full name or first name (case-insensitive). */
export function findPartyMember(state: GameState, ref: string): PartyMember | undefined {
  return matchByName(state.party, ref);
}

/** Finds a roster entry by id or name. Entries present in the scene win over absent ones. */
export function findRosterEntry(state: GameState, ref: string): RosterEntry | undefined {
  return matchByName(
    state.roster.filter((e) => e.present),
    ref,
  ) ?? matchByName(state.roster, ref);
}

export type Combatant = { kind: 'party'; member: PartyMember } | { kind: 'roster'; entry: RosterEntry };

export function findCombatant(state: GameState, ref: string): Combatant | undefined {
  const member = findPartyMember(state, ref);
  if (member) return { kind: 'party', member };
  const entry = findRosterEntry(state, ref);
  if (entry) return { kind: 'roster', entry };
  return undefined;
}

export function locationName(state: GameState, campaign: EngineCampaign): string {
  if (!state.locationId) return 'Unknown';
  return (
    campaign.locations.find((l) => l.id === state.locationId)?.name ??
    state.improvisedLocations.find((l) => l.id === state.locationId)?.name ??
    state.locationId
  );
}

export function totalBeats(campaign: EngineCampaign): number {
  return campaign.acts.reduce((n, a) => n + a.beats.length, 0);
}

/** Goal progress from 0 to 1, driven by milestones and backed up by completed beats. */
export function goalProgress(state: GameState, campaign: EngineCampaign): number {
  if (state.ended) return state.ended.outcome === 'defeat' ? Math.min(1, rawProgress(state, campaign)) : 1;
  return Math.min(0.97, rawProgress(state, campaign));
}

function rawProgress(state: GameState, campaign: EngineCampaign): number {
  const byMilestone = campaign.goal.milestones > 0 ? state.milestonesDone / campaign.goal.milestones : 0;
  const beats = totalBeats(campaign);
  const known = state.beatsCompleted.filter((b) => campaign.acts.some((a) => a.beats.includes(b))).length;
  const byBeat = beats > 0 ? (known / beats) * 0.95 : 0;
  return Math.max(byMilestone, byBeat);
}

/** True once the party has reached the midpoint act and this member has not taken the boost yet. */
export function milestoneBoostAvailable(state: GameState, campaign: EngineCampaign, memberId: string): boolean {
  const member = state.party.find((p) => p.id === memberId);
  if (!member || member.milestoneBoostTaken) return false;
  return state.actIndex >= Math.floor(campaign.acts.length / 2) && campaign.acts.length > 1;
}

export function applyMilestoneBoost(state: GameState, campaign: EngineCampaign, memberId: string, stat: Stat): GameState {
  if (!milestoneBoostAvailable(state, campaign, memberId)) throw new Error('milestone boost is not available');
  const next = structuredClone(state);
  const member = next.party.find((p) => p.id === memberId)!;
  const before = member.stats.CON;
  member.stats = bumpStat(member.stats, stat);
  member.milestoneBoostTaken = true;
  if (stat === 'CON' && member.stats.CON > before) {
    member.maxHp += 2;
    member.hp += 2;
  }
  if (stat === 'DEX') member.defense = member.defense + 1;
  return next;
}

/** Adds play time. Call only while the game is running (not paused). */
export function tick(state: GameState, ms: number): GameState {
  if (ms <= 0 || state.ended) return state;
  return { ...state, elapsedMs: state.elapsedMs + ms };
}
