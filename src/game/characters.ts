import { EMPTY_PROFILE, createPartyMember, slugify } from '@/engine/state';
import type { Archetype, EngineCampaign, PartyMember, Stat } from '@/engine/types';

export const PLAYER_COLORS = ['#e0a84e', '#5fb3d4', '#c98bdb', '#7fcf8f', '#e8766d', '#9aa7f0'] as const;

export interface CompanionAnswer {
  name: string;
  description: string;
  /** A full party member that a player controls and rolls for. */
  fullMember: boolean;
  /** Archetype id for a full-member companion. */
  archetype: string;
}

/** One player's answers to the character-creation questions (ids match character-creation.md). */
export interface CharacterAnswers {
  playerName: string;
  playerColor: string;
  archetype: string;
  name: string;
  pronouns: string;
  age: string;
  build: string;
  features: string;
  strikingFeature: string;
  outfit: string;
  signatureItem: string;
  companion: CompanionAnswer | null;
  trait: string;
  flaw: string;
  hook: string;
  bump: Stat | '';
}

export function emptyAnswers(index: number): CharacterAnswers {
  return {
    playerName: '',
    playerColor: PLAYER_COLORS[index % PLAYER_COLORS.length]!,
    archetype: '',
    name: '',
    pronouns: '',
    age: '',
    build: '',
    features: '',
    strikingFeature: '',
    outfit: '',
    signatureItem: '',
    companion: null,
    trait: '',
    flaw: '',
    hook: '',
    bump: '',
  };
}

/** Fields a "Surprise me" request may fill in. */
export const SURPRISE_FIELDS = ['name', 'age', 'build', 'features', 'strikingFeature', 'outfit', 'signatureItem', 'trait', 'flaw', 'hook'] as const;
export type SurpriseField = (typeof SURPRISE_FIELDS)[number];

/** What still has to be answered before this character can be confirmed. */
export function missingAnswers(a: CharacterAnswers): string[] {
  const missing: string[] = [];
  if (!a.playerName.trim()) missing.push('Player name');
  if (!a.archetype) missing.push('Archetype');
  if (!a.name.trim()) missing.push('Character name');
  if (!a.bump) missing.push('Stat boost');
  if (a.companion && !a.companion.name.trim()) missing.push('Companion name');
  if (a.companion?.fullMember && !a.companion.archetype) missing.push('Companion archetype');
  return missing;
}

/** Builds the party from confirmed answers. Full-member companions become their own party members. */
export function buildParty(all: CharacterAnswers[], archetypes: Archetype[], campaign: EngineCampaign): PartyMember[] {
  const party: PartyMember[] = [];
  const used = new Set<string>();
  const uniqueId = (name: string) => {
    const base = `pc-${slugify(name)}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  for (const a of all) {
    const missing = missingAnswers(a);
    if (missing.length) throw new Error(`${a.name || a.playerName || 'A character'} is missing: ${missing.join(', ')}`);
    const archetype = archetypes.find((x) => x.id === a.archetype);
    if (!archetype) throw new Error(`Unknown archetype "${a.archetype}"`);
    const companion = a.companion && a.companion.name.trim() ? { name: a.companion.name.trim(), description: a.companion.description.trim() } : null;
    party.push(
      createPartyMember(
        {
          id: uniqueId(a.name),
          playerName: a.playerName.trim(),
          playerColor: a.playerColor,
          name: a.name.trim(),
          archetype,
          bump: a.bump as Stat,
          profile: {
            pronouns: a.pronouns.trim(),
            age: a.age.trim(),
            build: a.build.trim(),
            features: a.features.trim(),
            strikingFeature: a.strikingFeature.trim(),
            outfit: a.outfit.trim(),
            signatureItem: a.signatureItem.trim(),
            trait: a.trait.trim(),
            flaw: a.flaw.trim(),
            hook: a.hook.trim(),
          },
          companion,
        },
        campaign,
      ),
    );
    if (a.companion?.fullMember && companion) {
      const role = archetypes.find((x) => x.id === a.companion!.archetype);
      if (!role) throw new Error(`Unknown archetype "${a.companion.archetype}" for ${companion.name}`);
      party.push(
        createPartyMember(
          {
            id: uniqueId(companion.name),
            playerName: a.playerName.trim(),
            playerColor: a.playerColor,
            name: companion.name,
            archetype: role,
            bump: role.proficiencies[0]!,
            profile: { ...EMPTY_PROFILE, features: companion.description, trait: `Loyal companion of ${a.name.trim()}` },
            companion: null,
            isCompanion: true,
          },
          campaign,
        ),
      );
    }
  }
  return party;
}
