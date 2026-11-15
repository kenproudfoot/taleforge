// Shared fixtures for tests. Not used by the shipped app.
import { EMPTY_PROFILE, createGame, createPartyMember } from './state';
import type { Archetype, EngineCampaign, GameState, PartyMember } from './types';

export const BRUISER: Archetype = {
  id: 'bruiser',
  name: 'Knight',
  summary: 'Front-line fighter.',
  stats: { STR: 3, DEX: 0, CON: 2, INT: -1, WIS: 0, CHA: 1 },
  hpBonus: 6,
  defenseBonus: 3,
  proficiencies: ['STR', 'CON'],
  attackStat: 'STR',
  weaponDie: 10,
  signature: { name: 'Shield Wall', description: 'Block a blow.', effect: { type: 'guard', amount: 8 } },
  gear: ['Longsword', 'Shield'],
  artHint: 'broad stance',
};

export const MEDIC: Archetype = {
  id: 'medic',
  name: 'Healer',
  summary: 'Keeps the party standing.',
  stats: { STR: -1, DEX: 1, CON: 1, INT: 1, WIS: 3, CHA: 0 },
  hpBonus: 2,
  defenseBonus: 1,
  proficiencies: ['WIS', 'INT'],
  attackStat: 'WIS',
  weaponDie: 6,
  signature: { name: 'Mending Touch', description: 'Heal an ally.', effect: { type: 'heal', dice: '1d8+3' } },
  gear: ['Staff', 'Herb pouch'],
  artHint: 'gentle hands',
};

export const INFILTRATOR: Archetype = {
  id: 'infiltrator',
  name: 'Rogue',
  summary: 'Quick and quiet.',
  stats: { STR: 0, DEX: 3, CON: 0, INT: 1, WIS: 1, CHA: 0 },
  hpBonus: 2,
  defenseBonus: 1,
  proficiencies: ['DEX', 'INT'],
  attackStat: 'DEX',
  weaponDie: 6,
  signature: { name: 'Shadow Step', description: 'Strike from hiding.', effect: { type: 'next_roll', advantage: true, bonus: 2 } },
  gear: ['Daggers'],
  artHint: 'hooded',
};

export const SHARPSHOOTER: Archetype = {
  ...INFILTRATOR,
  id: 'sharpshooter',
  name: 'Ranger',
  signature: { name: 'Deadeye', description: 'A perfect shot.', effect: { type: 'damage_bonus', dice: '2d6' } },
};

export const FACE: Archetype = {
  ...MEDIC,
  id: 'face',
  name: 'Bard',
  signature: { name: 'Silver Tongue', description: 'Talk your way through.', effect: { type: 'narrative' } },
};

export const CAMPAIGN: EngineCampaign = {
  id: 'test-campaign',
  title: 'The Test Crown',
  targetMinutes: 45,
  goal: { text: 'Recover the crown.', milestones: 4 },
  acts: [
    { id: 'act1', title: 'The Road', minutes: 12, beats: ['arrive', 'ambush'] },
    { id: 'act2', title: 'The Depths', minutes: 18, beats: ['descend', 'riddle'] },
    { id: 'act3', title: 'The Crown', minutes: 15, beats: ['boss'] },
  ],
  locations: [
    { id: 'village', name: 'Mossford Village', musicMood: 'calm' },
    { id: 'cave', name: 'The Drowned Cave', musicMood: 'tension' },
  ],
  cast: [
    {
      id: 'goblin',
      name: 'Goblin Scout',
      role: 'enemy',
      look: 'wiry, green',
      hp: 7,
      defense: 12,
      attacks: [
        { name: 'Rusty Knife', bonus: 3, damage: '1d6+1' },
        { name: 'Sling', bonus: 2, damage: '1d4' },
      ],
      abilities: ['Sneaky'],
      tactics: 'Hit and run.',
      history: 'Serves the Drowned King.',
      stats: { DEX: 2 },
    },
    {
      id: 'elder',
      name: 'Elder Maren',
      role: 'ally',
      look: 'weathered, kind',
      hp: 6,
      defense: 10,
      attacks: [],
      abilities: [],
      tactics: '',
      history: 'Village elder.',
    },
    {
      id: 'king',
      name: 'The Drowned King',
      role: 'boss',
      look: 'crowned corpse',
      hp: 40,
      defense: 15,
      attacks: [{ name: 'Tide Blade', bonus: 6, damage: '2d6+3' }],
      abilities: ['Undertow'],
      tactics: 'Targets the healer.',
      history: 'Drowned with his crown.',
    },
  ],
  resources: [
    { id: 'torchlight', name: 'Torchlight', scope: 'party', max: 6, start: 6, description: 'Burns down in the dark.' },
    { id: 'nerve', name: 'Nerve', scope: 'character', max: 5, start: 3, description: 'Steadiness under pressure.' },
  ],
  endings: ['crowned', 'drowned'],
  permadeath: false,
};

export function member(archetype: Archetype, id: string, name: string, playerName = 'Alex'): PartyMember {
  return createPartyMember(
    { id, playerName, playerColor: '#d9b45a', name, archetype, bump: 'CON', profile: EMPTY_PROFILE, companion: null },
    CAMPAIGN,
  );
}

/** A three-person party: Brann (bruiser), Lyra (medic), Mags (infiltrator). */
export function testGame(campaign: EngineCampaign = CAMPAIGN): GameState {
  return createGame(campaign, [
    member(BRUISER, 'pc-brann', 'Brann Ironfoot', 'Alex'),
    member(MEDIC, 'pc-lyra', 'Lyra', 'Sam'),
    member(INFILTRATOR, 'pc-mags', 'Mags', 'Jo'),
  ]);
}
