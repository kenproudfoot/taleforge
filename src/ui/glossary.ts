import type { Stat } from '@/engine/types';

export const STAT_NAMES: Record<Stat, string> = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intellect', WIS: 'Wisdom', CHA: 'Charisma' };

const STAT_USES: Record<Stat, string> = {
  STR: 'force, lifting, melee muscle',
  DEX: 'agility, stealth, aim, reflexes',
  CON: 'toughness, stamina, resisting harm',
  INT: 'knowledge, logic, technology, investigation',
  WIS: 'perception, intuition, willpower, medicine',
  CHA: 'persuasion, deception, presence, performance',
};

/** Mouse-over text for a stat, everywhere one is shown: "DEX: Dexterity. Agility, stealth, aim, reflexes." */
export function statTip(stat: Stat, proficient = false): string {
  const uses = STAT_USES[stat];
  return `${stat}: ${STAT_NAMES[stat]}. ${uses[0]!.toUpperCase()}${uses.slice(1)}.${proficient ? ' Proficient: +2 on these rolls.' : ''} Added to every d20 roll that uses it.`;
}

/** Mouse-over text for the other numbers on a character sheet. */
export const TIPS = {
  hp: 'Hit points: how much harm a character can take. At 0 they are Downed.',
  defense: 'Defense: what an attacker must reach on d20 + attack bonus to hit (10 + DEX + armor).',
  attack: 'Attack: d20 + attack stat + 2 to hit; on a hit, roll the weapon die + the stat for damage.',
  heroic: 'Heroic Points: earned for great play. Spend one after a failed roll to reroll it, or to add +5. At most 3.',
  signature: 'Signature ability: a special move, usable once per act. It comes back at the start of every act.',
  proficient: 'Proficient: +2 on rolls with this stat.',
  dc: 'DC (Difficulty Class): the total a check must reach. Easy 10, Moderate 13, Hard 16, Heroic 19.',
  milestone: 'Milestones: big steps toward the campaign goal.',
  plainDice: 'A roll of fate: no success or failure. The Dungeon Master decides what the number means.',
} as const;
