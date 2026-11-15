import type { EngineCampaign, GameState, PartyMember, RosterEntry } from './types';

export const DOWNED = 'Downed';

/**
 * Damage and healing. These mutate the draft they are given: callers clone the state first.
 * Each returns short human-readable consequence lines for chips and tool results.
 */
export function damageParty(state: GameState, member: PartyMember, rawAmount: number): string[] {
  const out: string[] = [];
  let amount = Math.max(0, Math.floor(rawAmount));
  if (amount === 0) return out;
  const guardian = state.party.find((p) => p.boons.some((b) => b.type === 'guard'));
  if (guardian) {
    const i = guardian.boons.findIndex((b) => b.type === 'guard');
    const boon = guardian.boons[i]!;
    guardian.boons.splice(i, 1);
    if (boon.type === 'guard') {
      const blocked = Math.min(amount, boon.amount);
      amount -= blocked;
      out.push(`${guardian.name}'s ${boon.source} blocks ${blocked} damage`);
    }
    if (amount === 0) return out;
  }
  if (member.status === 'out') return out;
  if (member.status === 'downed' || member.status === 'stable') {
    member.status = 'out';
    member.downedTurnsLeft = 0;
    out.push(`${member.name} takes ${amount} damage while down and is out of the fight`);
    return out;
  }
  member.hp = Math.max(0, member.hp - amount);
  out.push(`${member.name} takes ${amount} damage (${member.hp}/${member.maxHp} HP)`);
  if (member.hp === 0) {
    member.status = 'downed';
    member.downedTurnsLeft = Math.max(2, state.party.length);
    if (!member.conditions.includes(DOWNED)) member.conditions.push(DOWNED);
    out.push(`${member.name} is Downed: an ally can stabilize them with a WIS check (DC 10)`);
  }
  return out;
}

export function damageRoster(entry: RosterEntry, rawAmount: number): string[] {
  const amount = Math.max(0, Math.floor(rawAmount));
  if (amount === 0 || entry.status !== 'active') return [];
  entry.hp = Math.max(0, entry.hp - amount);
  const out = [`${entry.name} takes ${amount} damage (${entry.hp}/${entry.maxHp} HP)`];
  if (entry.hp === 0) {
    entry.status = 'defeated';
    out.push(`${entry.name} is defeated`);
  }
  return out;
}

export function healParty(member: PartyMember, rawAmount: number, campaign: EngineCampaign): string[] {
  const amount = Math.max(0, Math.floor(rawAmount));
  if (amount === 0) return [];
  if (member.status === 'out' && campaign.permadeath) return [`${member.name} is beyond healing`];
  const before = member.hp;
  member.hp = Math.min(member.maxHp, member.hp + amount);
  const out = [`${member.name} heals ${member.hp - before} (${member.hp}/${member.maxHp} HP)`];
  if (member.status !== 'ok') {
    member.status = 'ok';
    member.downedTurnsLeft = 0;
    member.conditions = member.conditions.filter((c) => c !== DOWNED);
    out.push(`${member.name} is back on their feet`);
  }
  return out;
}

export function healRoster(entry: RosterEntry, rawAmount: number): string[] {
  const amount = Math.max(0, Math.floor(rawAmount));
  if (amount === 0 || entry.status !== 'active') return [];
  const before = entry.hp;
  entry.hp = Math.min(entry.maxHp, entry.hp + amount);
  return [`${entry.name} heals ${entry.hp - before} (${entry.hp}/${entry.maxHp} HP)`];
}

export function stabilize(member: PartyMember): string[] {
  if (member.status !== 'downed') return [];
  member.status = 'stable';
  member.downedTurnsLeft = 0;
  return [`${member.name} is stabilized`];
}

/** Members who are out of the fight return at half HP when a new act begins (unless permadeath). */
export function recoverForNewAct(state: GameState, campaign: EngineCampaign): string[] {
  const out: string[] = [];
  for (const m of state.party) {
    if (m.status === 'ok') continue;
    if (m.status === 'out' && campaign.permadeath) continue;
    m.status = 'ok';
    m.downedTurnsLeft = 0;
    m.hp = Math.max(m.hp, Math.ceil(m.maxHp / 2));
    m.conditions = m.conditions.filter((c) => c !== DOWNED);
    out.push(`${m.name} recovers (${m.hp}/${m.maxHp} HP)`);
  }
  return out;
}
