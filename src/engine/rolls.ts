import { combineModes, diceNeeded, isValidFace, parseDice, rollDice } from './dice';
import { damageParty, damageRoster, stabilize } from './health';
import type { Rng } from './rng';
import { HEROIC_BONUS, STABILIZE_DC, addBonus, resolveCheck, resolveDamage } from './rules';
import { findCombatant, findPartyMember, findRosterEntry } from './state';
import type {
  CheckResult,
  DamageResult,
  Effect,
  GameState,
  PartyMember,
  PendingRoll,
  RollKind,
  RollMode,
  RollReport,
  RosterEntry,
  Stat,
} from './types';

export interface RollRequest {
  character: string;
  kind: RollKind;
  stat?: Stat;
  dc?: number;
  target?: string;
  reason: string;
  advantage?: 'advantage' | 'disadvantage' | 'none';
  purpose?: 'normal' | 'stabilize';
  /** For NPC attackers: which of their attacks to use (defaults to the first). */
  attack?: string;
}

export type RollRequestResult =
  | { ok: false; error: string }
  | { ok: true; state: GameState; deferred: true; pending: PendingRoll; effects: Effect[] }
  | { ok: true; state: GameState; deferred: false; report: RollReport; effects: Effect[] };

export interface RollStep {
  state: GameState;
  /** Set when the roll is finished; otherwise `state.pendingRoll` describes what is needed next. */
  report: RollReport | null;
  effects: Effect[];
}

const DEFAULT_DC = 13;

/**
 * Starts a roll. Party members get a pending roll that waits for dice (digital or physical).
 * NPCs and enemies are rolled immediately by the engine.
 */
export function requestRoll(state: GameState, req: RollRequest, rng: Rng): RollRequestResult {
  if (state.pendingRoll) return { ok: false, error: `A roll is already pending for ${state.pendingRoll.rollerName}.` };
  const roller = findCombatant(state, req.character);
  if (!roller) return { ok: false, error: unknownName(state, req.character) };
  if (roller.kind === 'roster') return npcRoll(state, roller.entry, req, rng);

  const member = roller.member;
  if (member.status !== 'ok') return { ok: false, error: `${member.name} is ${member.status} and cannot roll.` };

  const next = structuredClone(state);
  const m = next.party.find((p) => p.id === member.id)!;
  const purpose = req.purpose ?? 'normal';
  let mode: RollMode = req.advantage && req.advantage !== 'none' ? req.advantage : 'normal';
  let bonus = 0;
  const notes: string[] = [];

  let dc: number | null;
  let targetId: string | null = null;
  let targetName: string | null = null;
  let stat: Stat = req.stat ?? (req.kind === 'attack' ? m.attackStat : 'WIS');

  if (purpose === 'stabilize') {
    const target = req.target ? findPartyMember(next, req.target) : next.party.find((p) => p.status === 'downed');
    if (!target || target.status !== 'downed') return { ok: false, error: 'Nobody is Downed, so there is no one to stabilize.' };
    stat = 'WIS';
    dc = STABILIZE_DC;
    targetId = target.id;
    targetName = target.name;
  } else if (req.kind === 'attack') {
    if (!req.target) return { ok: false, error: 'An attack needs a target.' };
    const target = findRosterEntry(next, req.target);
    if (!target) return { ok: false, error: `${unknownName(state, req.target)} Add the target with roster_add first.` };
    if (target.status !== 'active') return { ok: false, error: `${target.name} is already ${target.status}.` };
    dc = target.defense;
    targetId = target.id;
    targetName = target.name;
  } else {
    dc = req.dc ?? DEFAULT_DC;
    if (req.target) {
      const t = findCombatant(next, req.target);
      targetId = t ? (t.kind === 'party' ? t.member.id : t.entry.id) : null;
      targetName = t ? (t.kind === 'party' ? t.member.name : t.entry.name) : req.target;
    }
  }

  const boonIndex = m.boons.findIndex((b) => b.type === 'next_roll');
  if (boonIndex >= 0) {
    const boon = m.boons[boonIndex]!;
    m.boons.splice(boonIndex, 1);
    if (boon.type === 'next_roll') {
      if (boon.advantage) mode = combineModes(mode, 'advantage');
      bonus += boon.bonus;
      notes.push(boon.source);
    }
  }

  next.rollCounter += 1;
  const pending: PendingRoll = {
    id: `roll-${next.rollCounter}`,
    rollerId: m.id,
    rollerName: m.name,
    rollerIsParty: true,
    kind: req.kind,
    stat,
    dc,
    targetId,
    targetName,
    reason: req.reason,
    mode,
    purpose,
    stage: 'main',
    die: 20,
    diceCount: diceNeeded(mode),
    bonus,
    heroicSpent: 'none',
    main: null,
    notes,
    damageBonusDice: null,
  };
  next.pendingRoll = pending;
  return { ok: true, state: next, deferred: true, pending, effects: [{ type: 'roll_requested', rollId: pending.id }] };
}

/** Which Heroic Point options the roller has at the heroic stage. */
export function heroicOptions(state: GameState): Array<'reroll' | 'plus5'> {
  const p = state.pendingRoll;
  if (!p || p.stage !== 'heroic' || !p.main) return [];
  const options: Array<'reroll' | 'plus5'> = ['reroll'];
  if (!p.main.complication && addBonus(p.main, HEROIC_BONUS).success) options.push('plus5');
  return options;
}

/** Feeds dice into the pending roll (d20s at the main stage, the weapon die at the damage stage). */
export function submitDice(state: GameState, dice: number[], rng: Rng): RollStep {
  const p = state.pendingRoll;
  if (!p) throw new Error('no roll is pending');
  if (p.stage === 'heroic') throw new Error('choose how to use the Heroic Point first');
  if (dice.length !== p.diceCount) throw new Error(`expected ${p.diceCount} dice, got ${dice.length}`);
  for (const d of dice) if (!isValidFace(d, p.die)) throw new Error(`${d} is not a valid d${p.die} result`);

  const next = structuredClone(state);
  const pending = next.pendingRoll!;
  const member = next.party.find((m) => m.id === pending.rollerId)!;

  if (pending.stage === 'damage') {
    const bonusRoll = pending.damageBonusDice ? rollDice(pending.damageBonusDice, rng).total : 0;
    const damage = resolveDamage({
      dice,
      dieSize: pending.die,
      modifier: member.stats[pending.stat],
      crit: pending.main!.crit,
      bonus: bonusRoll,
    });
    return finish(next, pending, damage);
  }

  const proficient = pending.kind === 'attack' || member.proficiencies.includes(pending.stat);
  pending.main = resolveCheck({
    dice,
    mode: pending.mode,
    modifier: member.stats[pending.stat],
    proficient,
    dc: pending.dc ?? DEFAULT_DC,
    bonus: pending.bonus,
  });
  if (!pending.main.success && member.heroicPoints > 0 && pending.heroicSpent === 'none') {
    pending.stage = 'heroic';
    return { state: next, report: null, effects: [] };
  }
  return afterMain(next, pending, member);
}

/** Resolves the Heroic Point prompt after a failed roll. */
export function chooseHeroic(state: GameState, choice: 'accept' | 'reroll' | 'plus5'): RollStep {
  const p = state.pendingRoll;
  if (!p || p.stage !== 'heroic' || !p.main) throw new Error('no Heroic Point choice is pending');
  if (choice !== 'accept' && !heroicOptions(state).includes(choice)) throw new Error(`${choice} is not available`);
  const next = structuredClone(state);
  const pending = next.pendingRoll!;
  const member = next.party.find((m) => m.id === pending.rollerId)!;
  if (choice === 'reroll') {
    member.heroicPoints -= 1;
    pending.heroicSpent = 'reroll';
    pending.stage = 'main';
    pending.main = null;
    pending.notes.push('Heroic Point: reroll');
    return { state: next, report: null, effects: [] };
  }
  if (choice === 'plus5') {
    member.heroicPoints -= 1;
    pending.heroicSpent = 'plus5';
    pending.main = addBonus(pending.main!, HEROIC_BONUS);
    pending.notes.push('Heroic Point: +5');
  }
  return afterMain(next, pending, member);
}

function afterMain(next: GameState, pending: PendingRoll, member: PartyMember): RollStep {
  const main = pending.main!;
  if (pending.kind === 'attack' && main.success) {
    pending.stage = 'damage';
    pending.die = member.weaponDie;
    pending.diceCount = 1;
    const i = member.boons.findIndex((b) => b.type === 'damage_bonus');
    if (i >= 0) {
      const boon = member.boons[i]!;
      member.boons.splice(i, 1);
      if (boon.type === 'damage_bonus') {
        pending.damageBonusDice = boon.dice;
        pending.notes.push(`${boon.source} (+${boon.dice})`);
      }
    }
    return { state: next, report: null, effects: [] };
  }
  return finish(next, pending, null);
}

function finish(next: GameState, pending: PendingRoll, damage: DamageResult | null): RollStep {
  const consequences: string[] = [];
  if (damage && pending.targetId) {
    const target = next.roster.find((e) => e.id === pending.targetId);
    if (target) consequences.push(...damageRoster(target, damage.total));
  }
  if (pending.purpose === 'stabilize' && pending.main!.success && pending.targetId) {
    const target = next.party.find((m) => m.id === pending.targetId);
    if (target) consequences.push(...stabilize(target));
  }
  const report: RollReport = {
    id: pending.id,
    rollerId: pending.rollerId,
    rollerName: pending.rollerName,
    kind: pending.kind,
    stat: pending.stat,
    reason: pending.reason,
    targetName: pending.targetName,
    check: pending.main!,
    damage,
    heroicSpent: pending.heroicSpent,
    notes: pending.notes,
    consequences,
  };
  next.pendingRoll = null;
  return { state: next, report, effects: [{ type: 'roll_report', report }] };
}

/** Abandons the pending roll (used if the table decides not to roll after all). */
export function cancelPendingRoll(state: GameState): GameState {
  return state.pendingRoll ? { ...state, pendingRoll: null } : state;
}

function npcRoll(state: GameState, entry: RosterEntry, req: RollRequest, rng: Rng): RollRequestResult {
  if (entry.status !== 'active') return { ok: false, error: `${entry.name} is ${entry.status} and cannot act.` };
  const next = structuredClone(state);
  const mode: RollMode = req.advantage && req.advantage !== 'none' ? req.advantage : 'normal';
  const dice = Array.from({ length: diceNeeded(mode) }, () => rng.int(20));
  next.rollCounter += 1;
  const id = `roll-${next.rollCounter}`;
  const consequences: string[] = [];
  let check: CheckResult;
  let damage: DamageResult | null = null;
  let targetName: string | null;
  const stat: Stat = req.stat ?? 'STR';

  if (req.kind === 'attack') {
    if (!req.target) return { ok: false, error: 'An attack needs a target.' };
    const target = findCombatant(next, req.target);
    if (!target) return { ok: false, error: unknownName(state, req.target) };
    const attack =
      (req.attack && entry.attacks.find((a) => a.name.toLowerCase() === req.attack!.toLowerCase())) || entry.attacks[0];
    if (!attack) return { ok: false, error: `${entry.name} has no attacks.` };
    const defense = target.kind === 'party' ? target.member.defense : target.entry.defense;
    targetName = target.kind === 'party' ? target.member.name : target.entry.name;
    check = resolveCheck({ dice, mode, modifier: attack.bonus, proficient: false, dc: defense });
    if (check.success) {
      const notation = parseDice(attack.damage);
      if (!notation) return { ok: false, error: `${entry.name}'s attack has invalid damage "${attack.damage}".` };
      const rolled = rollDice(notation, rng);
      damage = resolveDamage({
        dice: rolled.rolls,
        dieSize: notation.count > 0 ? notation.sides : 0,
        modifier: rolled.modifier,
        crit: check.crit,
      });
      consequences.push(
        ...(target.kind === 'party'
          ? damageParty(next, next.party.find((m) => m.id === target.member.id)!, damage.total)
          : damageRoster(target.entry, damage.total)),
      );
    }
  } else {
    const modifier = entry.stats?.[stat] ?? 0;
    check = resolveCheck({ dice, mode, modifier, proficient: false, dc: req.dc ?? DEFAULT_DC });
    targetName = req.target ?? null;
  }

  const report: RollReport = {
    id,
    rollerId: entry.id,
    rollerName: entry.name,
    kind: req.kind,
    stat,
    reason: req.reason,
    targetName,
    check,
    damage,
    heroicSpent: 'none',
    notes: [],
    consequences,
  };
  return { ok: true, state: next, deferred: false, report, effects: [{ type: 'roll_report', report }] };
}

function unknownName(state: GameState, ref: string): string {
  const names = [...state.party.map((p) => p.name), ...state.roster.filter((e) => e.present).map((e) => e.name)];
  return `No one called "${ref}" is in the scene. Present: ${names.join(', ') || 'nobody'}.`;
}

/** Compact, model-friendly summary of a finished roll, used as the tool result. */
export function summarizeReport(report: RollReport): Record<string, unknown> {
  const c = report.check;
  return {
    roller: report.rollerName,
    kind: report.kind,
    stat: report.stat,
    natural: c.natural,
    total: c.total,
    against: c.dc,
    outcome: c.crit ? 'critical success' : c.complication ? 'failure with a complication' : c.success ? 'success' : 'failure',
    ...(report.damage ? { damage: report.damage.total } : {}),
    ...(report.heroicSpent !== 'none' ? { heroic_point: report.heroicSpent } : {}),
    ...(report.consequences.length ? { consequences: report.consequences } : {}),
  };
}
