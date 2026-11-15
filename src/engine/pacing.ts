import { DOWNED } from './health';
import { goalProgress, locationName } from './state';
import type { EngineCampaign, GameState } from './types';

export type PacingStatus = 'ahead' | 'on_track' | 'running_long' | 'wrap_up';

export interface Pacing {
  status: PacingStatus;
  elapsedMinutes: number;
  targetMinutes: number;
  actNumber: number;
  actCount: number;
  /** Minutes left before the current act should end (negative when over budget). */
  actMinutesLeft: number;
  totalMinutesLeft: number;
}

const MS_PER_MIN = 60_000;

export function computePacing(state: GameState, campaign: EngineCampaign): Pacing {
  const elapsed = state.elapsedMs / MS_PER_MIN;
  const budgets = campaign.acts.map((a) => a.minutes);
  const sum = budgets.reduce((a, b) => a + b, 0) || campaign.targetMinutes;
  // Scale act budgets so they add up to the campaign's target length.
  const scale = campaign.targetMinutes / sum;
  const actEnd = budgets.slice(0, state.actIndex + 1).reduce((a, b) => a + b, 0) * scale;
  const actStart = budgets.slice(0, state.actIndex).reduce((a, b) => a + b, 0) * scale;
  const actMinutesLeft = actEnd - elapsed;
  const totalMinutesLeft = campaign.targetMinutes - elapsed;
  const lastAct = state.actIndex >= campaign.acts.length - 1;

  let status: PacingStatus = 'on_track';
  if (totalMinutesLeft <= Math.max(3, campaign.targetMinutes * 0.1)) status = 'wrap_up';
  else if (actMinutesLeft < -1 && !lastAct) status = 'running_long';
  else if (lastAct && totalMinutesLeft < 0) status = 'wrap_up';
  else if (elapsed < actStart - Math.max(2, campaign.targetMinutes * 0.1)) status = 'ahead';

  return {
    status,
    elapsedMinutes: elapsed,
    targetMinutes: campaign.targetMinutes,
    actNumber: state.actIndex + 1,
    actCount: campaign.acts.length,
    actMinutesLeft,
    totalMinutesLeft,
  };
}

/** Who has had the least time in the spotlight (able characters only). */
export function leastSpotlight(state: GameState): string | null {
  const able = state.party.filter((p) => p.status === 'ok');
  if (able.length < 2) return null;
  const counts = able.map((p) => state.spotlight[p.id] ?? 0);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (max - min < 2) return null;
  return able[counts.indexOf(min)]!.name;
}

export function recordSpotlight(state: GameState, memberId: string): GameState {
  if (!(memberId in state.spotlight)) return state;
  return { ...state, spotlight: { ...state.spotlight, [memberId]: (state.spotlight[memberId] ?? 0) + 1 } };
}

/** The short steering note injected into every DM turn. */
export function pacingNote(state: GameState, campaign: EngineCampaign): string {
  const p = computePacing(state, campaign);
  const act = campaign.acts[state.actIndex];
  const remainingBeats = act ? act.beats.filter((b) => !state.beatsCompleted.includes(b)) : [];
  const parts: string[] = [];
  const mins = (n: number) => `${Math.max(0, Math.round(n))} min`;
  parts.push(`Act ${p.actNumber} of ${p.actCount}${act ? ` ("${act.title}")` : ''}; ${Math.round(p.elapsedMinutes)} of ${p.targetMinutes} min played.`);
  if (p.status === 'wrap_up') {
    parts.push(
      p.totalMinutesLeft > 0
        ? `Only ${mins(p.totalMinutesLeft)} left: go straight to the climax, resolve it and call end_campaign.`
        : 'Time is up: resolve the climax now, in this turn or the next, and call end_campaign.',
    );
  } else if (p.status === 'running_long') {
    parts.push(`This act is ${mins(-p.actMinutesLeft)} over budget: skip side business and close the act now.`);
  } else if (p.status === 'ahead') {
    parts.push('Ahead of schedule: there is room for character moments and detail.');
  } else {
    parts.push(`${mins(p.actMinutesLeft)} left in this act's budget.`);
  }
  if (remainingBeats.length > 0) parts.push(`Beats left in this act: ${remainingBeats.join(', ')}.`);
  else if (act && p.actNumber < p.actCount) parts.push('All beats of this act are done: move to the next act.');
  const quiet = leastSpotlight(state);
  if (quiet) parts.push(`${quiet} has had the least spotlight: address them next.`);
  const downed = state.party.filter((m) => m.status === 'downed');
  for (const m of downed) parts.push(`${m.name} is ${DOWNED} (${m.downedTurnsLeft} turn(s) before they are out of the fight).`);
  return parts.join(' ');
}

/**
 * Starts a new DM turn: advances the turn counter and the Downed countdown.
 * Returns the lines to show as chips.
 */
export function beginTurn(state: GameState): { state: GameState; lines: string[] } {
  const next = structuredClone(state);
  next.turn += 1;
  const lines: string[] = [];
  for (const m of next.party) {
    if (m.status !== 'downed') continue;
    m.downedTurnsLeft -= 1;
    if (m.downedTurnsLeft <= 0) {
      m.status = 'out';
      m.downedTurnsLeft = 0;
      lines.push(`${m.name} is out of the fight`);
    }
  }
  return { state: next, lines };
}

/** A compact plain-text snapshot of the machine state for the DM's context. */
export function describeState(state: GameState, campaign: EngineCampaign): string {
  const lines: string[] = [];
  lines.push(`Location: ${locationName(state, campaign)} (${state.locationId ?? 'none'})`);
  lines.push(`Goal progress: ${Math.round(goalProgress(state, campaign) * 100)}% (milestones ${state.milestonesDone}/${campaign.goal.milestones})`);
  lines.push('Party:');
  for (const m of state.party) {
    const bits = [
      `${m.name} (${m.archetypeName}, played by ${m.playerName})`,
      `HP ${m.hp}/${m.maxHp}`,
      `Defense ${m.defense}`,
      m.status !== 'ok' ? m.status.toUpperCase() : '',
      m.conditions.length ? `conditions: ${m.conditions.join(', ')}` : '',
      `Heroic Points ${m.heroicPoints}`,
      `${m.signature.name} ${m.signatureUsedInAct === state.actIndex ? 'used' : 'ready'}`,
      ...campaign.resources.filter((r) => r.scope === 'character').map((r) => `${r.name} ${m.resources[r.id] ?? r.start}/${r.max}`),
    ].filter(Boolean);
    lines.push(`- ${bits.join('; ')}`);
  }
  for (const r of campaign.resources.filter((x) => x.scope === 'party')) {
    lines.push(`${r.name}: ${state.partyResources[r.id] ?? r.start}/${r.max}`);
  }
  const present = state.roster.filter((e) => e.present);
  lines.push(present.length ? 'In the scene:' : 'In the scene: no NPCs or enemies.');
  for (const e of present) {
    lines.push(
      `- ${e.name} [${e.id}] (${e.role}) HP ${e.hp}/${e.maxHp}, Defense ${e.defense}${e.status !== 'active' ? `, ${e.status}` : ''}${e.conditions.length ? `, ${e.conditions.join(', ')}` : ''}`,
    );
  }
  if (state.clues.length) lines.push(`Clues: ${state.clues.map((c) => c.text).join(' | ')}`);
  if (state.items.length) {
    lines.push(
      `Items: ${state.items.map((i) => `${i.name} (${i.holder === 'party' ? 'party' : (state.party.find((p) => p.id === i.holder)?.name ?? i.holder)})`).join(', ')}`,
    );
  }
  if (state.encounters.length) lines.push(`Encounters: ${state.encounters.map((e) => `${e.id} ${e.outcome}`).join(', ')}`);
  return lines.join('\n');
}
