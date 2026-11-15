import { parseNarration } from '@/ai/dm/narration';
import type { CampaignPack } from '@/content/pack';
import { parseFrontMatter } from '@/content/markdown';
import { goalProgress, locationName } from '@/engine/state';
import { parseState, serializeState } from '@/engine/schema';
import type { EngineCampaign, GameState } from '@/engine/types';
import { createSession, newId } from './session';
import type { ChatEntry, Session } from './session';

export const RECAP_VERSION = 1;

/** The sections the helper model writes. The party, progress and engine state are filled in by the app. */
export const PROSE_SECTIONS = ['Story so far', 'Where we are now', 'Open threads & clues', 'NPC attitudes', 'Next beat'] as const;
export type ProseSection = (typeof PROSE_SECTIONS)[number];

/** ISO 8601 with the local UTC offset, e.g. 2026-11-14T19:05:00-08:00. */
export function localIso(date: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/** A plain transcript of the chat for the recap writer. */
export function transcript(chat: ChatEntry[], state: GameState, maxChars = 24_000): string {
  const lines: string[] = [];
  for (const e of chat) {
    if (e.kind === 'dm') {
      lines.push(
        `DM: ${parseNarration(e.text)
          .map((s) => (s.type === 'speech' ? `${s.speaker}: "${s.text}"` : s.text))
          .join(' ')}`,
      );
    } else if (e.kind === 'player') lines.push(`${state.party.find((p) => p.id === e.characterId)?.name ?? 'Player'}: ${e.text}`);
    else if (e.kind === 'chip') lines.push(`[${e.text}]`);
    else if (e.kind === 'roll' && !e.free) lines.push(`[Roll: ${e.report.rollerName} ${e.report.stat} ${e.report.kind}, ${e.report.reason}: ${e.report.check.success ? 'success' : 'failure'}]`);
  }
  const text = lines.join('\n');
  // Keep the most recent part if the session was long: the summary covers the rest.
  return text.length > maxChars ? `…\n${text.slice(-maxChars)}` : text;
}

export function partySection(state: GameState, campaign: EngineCampaign): string {
  return state.party
    .map((m) => {
      const res = campaign.resources.filter((r) => r.scope === 'character').map((r) => `${r.name} ${m.resources[r.id] ?? r.start}/${r.max}`);
      const items = state.items.filter((i) => i.holder === m.id).map((i) => i.name);
      return [
        `- **${m.name}** (${m.archetypeName}, played by ${m.playerName}): HP ${m.hp}/${m.maxHp}${m.status !== 'ok' ? `, ${m.status}` : ''}`,
        m.conditions.length ? `; conditions: ${m.conditions.join(', ')}` : '',
        `; Heroic Points ${m.heroicPoints}`,
        res.length ? `; ${res.join(', ')}` : '',
        `. Gear: ${[...m.gear, ...items].join(', ')}.`,
        m.companion ? ` Companion: ${m.companion.name}.` : '',
      ].join('');
    })
    .join('\n');
}

export function progressSection(state: GameState, campaign: EngineCampaign): string {
  const act = campaign.acts[state.actIndex];
  const lines = [
    `- Act ${state.actIndex + 1} of ${campaign.acts.length}${act ? `: ${act.title}` : ''}.`,
    `- Beats completed: ${state.beatsCompleted.join(', ') || 'none yet'}.`,
    `- Milestones: ${state.milestonesDone}/${campaign.goal.milestones} (goal ${Math.round(goalProgress(state, campaign) * 100)}%).`,
    `- Encounters: ${state.encounters.map((e) => `${e.id} ${e.outcome}`).join(', ') || 'none yet'}.`,
  ];
  for (const r of campaign.resources.filter((x) => x.scope === 'party')) lines.push(`- ${r.name}: ${state.partyResources[r.id] ?? r.start}/${r.max}.`);
  if (state.ended) lines.push(`- The campaign has ended: ${state.ended.outcome}${state.ended.ending ? ` (${state.ended.ending})` : ''}.`);
  return lines.join('\n');
}

/** What the app knows without a model: used when the helper is unavailable. */
export function fallbackProse(session: Session, campaign: EngineCampaign): Record<ProseSection, string> {
  const s = session.state;
  const recentDm = session.chat.filter((e): e is Extract<ChatEntry, { kind: 'dm' }> => e.kind === 'dm').slice(-3);
  const present = s.roster.filter((e) => e.present).map((e) => e.name);
  return {
    'Story so far': session.summary.trim() || recentDm.map((e) => `- ${e.text.replace(/\s+/g, ' ').slice(0, 280)}`).join('\n') || '- The adventure has just begun.',
    'Where we are now': `${locationName(s, campaign)} (${s.locationId ?? 'unknown'}). ${present.length ? `Present: ${present.join(', ')}.` : 'No one else is here.'}`,
    'Open threads & clues': s.clues.map((c) => `- ${c.text}`).join('\n') || '- None recorded yet.',
    'NPC attitudes': s.roster.map((e) => `- ${e.id}: ${e.role === 'enemy' || e.role === 'boss' ? 'hostile' : e.role === 'ally' ? 'friendly' : 'unknown'} (${e.status}).`).join('\n') || '- No one met yet.',
    'Next beat': (campaign.acts[s.actIndex]?.beats.find((b) => !s.beatsCompleted.includes(b)) ?? 'the finale') + '.',
  };
}

export const RECAP_SYSTEM = `You write the save-game recap for a tabletop RPG session so that a Dungeon Master can resume it later. Use only facts from the transcript and state. Reply with exactly these five markdown sections, each starting with a level-1 heading, and nothing else:
# Story so far
(5-10 bullet points, in order)
# Where we are now
(location id and name, the situation, who is present)
# Open threads & clues
(bullets)
# NPC attitudes
(bullets: "npc-id: friendly/hostile/unknown, because ...")
# Next beat
(what the DM was about to do next, one or two sentences)`;

export function recapRequest(session: Session, pack: CampaignPack, campaign: EngineCampaign): string {
  const s = session.state;
  return [
    `Campaign: ${pack.manifest.title}. Goal: ${campaign.goal.text}`,
    `Current location: ${locationName(s, campaign)} (${s.locationId}). Act ${s.actIndex + 1}: ${campaign.acts[s.actIndex]?.title ?? ''}. Beats left in this act: ${(campaign.acts[s.actIndex]?.beats ?? []).filter((b) => !s.beatsCompleted.includes(b)).join(', ') || 'none'}.`,
    `Characters in the scene: ${s.roster.filter((e) => e.present).map((e) => `${e.name} [${e.id}, ${e.role}]`).join(', ') || 'none'}. Everyone met so far: ${s.roster.map((e) => `${e.id} (${e.status})`).join(', ') || 'none'}.`,
    session.summary.trim() ? `Earlier summary:\n${session.summary.trim()}` : '',
    `Transcript:\n${transcript(session.chat, s)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Splits the helper's reply into the five prose sections; anything missing comes from the fallback. */
export function parseProse(reply: string, fallback: Record<ProseSection, string>): Record<ProseSection, string> {
  const out = { ...fallback };
  const parts = reply.split(/^#\s+/m).slice(1);
  for (const part of parts) {
    const [heading, ...body] = part.split('\n');
    const name = PROSE_SECTIONS.find((s) => s.toLowerCase() === heading!.trim().toLowerCase().replace(/\s+and\s+/, ' & '));
    const text = body.join('\n').trim();
    if (name && text) out[name] = text;
  }
  return out;
}

export function buildRecap(session: Session, campaign: EngineCampaign, prose: Record<ProseSection, string>, now = new Date()): string {
  const s = session.state;
  const front = [
    '---',
    `recap_version: ${RECAP_VERSION}`,
    `campaign: ${session.campaignId}`,
    `title: ${JSON.stringify(session.campaignTitle)}`,
    `saved_at: ${localIso(now)}`,
    `elapsed_minutes: ${Math.round(s.elapsedMs / 60_000)}`,
    `act: ${s.actIndex + 1}`,
    '---',
  ].join('\n');
  return [
    front,
    `# Story so far\n\n${prose['Story so far']}`,
    `# The party\n\n${partySection(s, campaign)}`,
    `# Where we are now\n\n${prose['Where we are now']}`,
    `# Open threads & clues\n\n${prose['Open threads & clues']}`,
    `# NPC attitudes\n\n${prose['NPC attitudes']}`,
    `# Progress\n\n${progressSection(s, campaign)}`,
    `# Next beat\n\n${prose['Next beat']}`,
    `# Engine state\n\nThe exact machine state. TaleForge restores the game from this block; do not edit it.\n\n\`\`\`json\n${JSON.stringify(JSON.parse(serializeState(s)), null, 1)}\n\`\`\``,
    '',
  ].join('\n\n');
}

export interface ParsedRecap {
  campaignId: string;
  title: string;
  savedAt: string;
  state: GameState;
  /** All prose sections, used to brief the Dungeon Master when the game resumes. */
  briefing: string;
}

/** Reads a recap.md. Throws a readable error when it is not a valid TaleForge recap. */
export function parseRecap(text: string): ParsedRecap {
  const fm = parseFrontMatter(text);
  const data = (fm?.data ?? null) as Record<string, unknown> | null;
  if (!fm || !data || data.recap_version !== RECAP_VERSION || typeof data.campaign !== 'string') {
    throw new Error('That file is not a TaleForge recap (it needs the recap front matter at the top).');
  }
  const json = /#\s*Engine state[\s\S]*?```json\s*([\s\S]*?)```/i.exec(fm.body)?.[1];
  if (!json) throw new Error('The recap has no "Engine state" block, so the game cannot be restored exactly.');
  let state: GameState;
  try {
    state = parseState(json);
  } catch (e) {
    throw new Error(`The recap's engine state is damaged: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  if (state.campaignId !== data.campaign) throw new Error('The recap belongs to a different campaign than its engine state says.');
  const briefing = fm.body
    .split(/^#\s*Engine state/im)[0]!
    .trim()
    .replace(/\n{3,}/g, '\n\n');
  return { campaignId: data.campaign, title: typeof data.title === 'string' ? data.title : data.campaign, savedAt: String(data.saved_at ?? ''), state, briefing };
}

/** A fresh session that continues exactly where the recap left off. */
export function sessionFromRecap(recap: ParsedRecap, options: { dm: Session['dm']; diceMode: Session['diceMode']; campaignTitle: string }): Session {
  const state = { ...recap.state, pendingRoll: null };
  const session = createSession({ campaignId: recap.campaignId, campaignTitle: options.campaignTitle, state, dm: options.dm, diceMode: options.diceMode });
  return {
    ...session,
    summary: recap.briefing,
    chat: [{ id: newId('chip'), kind: 'chip', text: `Resumed from a recap saved ${recap.savedAt ? new Date(recap.savedAt).toLocaleString() : 'earlier'}`, tone: 'info' }],
  };
}

export function recapFileName(session: Session, now = new Date()): string {
  return `${session.campaignId}-recap-${localIso(now).slice(0, 16).replace(/[:T]/g, '-')}.md`;
}
