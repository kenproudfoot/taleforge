import { describeState, pacingNote } from '@/engine/pacing';
import type { EngineCampaign, GameState } from '@/engine/types';
import type { ChatMessage, TextProvider, Usage } from '../providers/types';
import { complete, textMessage } from '../providers/types';

export interface PlayerMessage {
  characterId: string;
  text: string;
}

export type TurnInput = { type: 'start' } | { type: 'resume' } | { type: 'players'; messages: PlayerMessage[] };

/** The player-facing part of a turn message. This is what is stored in history. */
export function playerBlock(input: TurnInput, state: GameState): string {
  if (input.type === 'start') return '<players>\n(The session begins now. Narrate the opening scene and hand the spotlight to a character.)\n</players>';
  if (input.type === 'resume') return '<players>\n(The session resumes after a break. Recap where things stand in two or three sentences, then hand the spotlight to a character.)\n</players>';
  const lines = input.messages.map((m) => {
    const member = state.party.find((p) => p.id === m.characterId);
    return member ? `${member.name} (played by ${member.playerName}): ${m.text}` : m.text;
  });
  return `<players>\n${lines.join('\n')}\n</players>`;
}

/** The volatile part of a turn message: the machine state and the pacing note. Never stored in history. */
export function stateBlock(state: GameState, campaign: EngineCampaign): string {
  return `<game_state>\n${describeState(state, campaign)}\n</game_state>\n<pacing>\n${pacingNote(state, campaign)}\n</pacing>`;
}

/** A user message that starts a turn (as opposed to one that only carries tool results). */
export function isTurnStart(m: ChatMessage): boolean {
  return m.role === 'user' && !m.content.some((b) => b.type === 'tool_result');
}

/**
 * Builds the messages for a request: the rolling summary (if any), the verbatim history, and the frozen
 * state block attached to the current turn's opening message. The block is computed once per turn and
 * reused for every request of that turn's tool loop, so the conversation prefix stays byte-identical
 * (which keeps prompt caching and the model's own reasoning blocks valid).
 */
export function buildMessages(history: ChatMessage[], summary: string, frozenState: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (summary.trim()) {
    out.push(textMessage('user', `<story_so_far>\n${summary.trim()}\n</story_so_far>\n(Earlier turns were summarized. Continue from here.)`));
    out.push(textMessage('assistant', 'Understood. I will continue the story from there.'));
  }
  let lastStart = -1;
  history.forEach((m, i) => {
    if (isTurnStart(m)) lastStart = i;
  });
  history.forEach((m, i) => {
    if (i === lastStart) out.push({ ...m, content: [{ type: 'text', text: frozenState }, ...m.content] });
    else out.push(m);
  });
  return out;
}

export const KEEP_TURNS = 8;
export const COMPACT_AT_TURNS = 14;

function transcript(messages: ChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === 'text' && b.text.trim()) lines.push(`${m.role === 'assistant' ? 'DM' : 'TABLE'}: ${b.text.trim()}`);
      else if (b.type === 'tool_use') lines.push(`DM used ${b.name}: ${JSON.stringify(b.input)}`);
      else if (b.type === 'tool_result') lines.push(`RESULT of ${b.name}: ${b.content}`);
    }
  }
  return lines.join('\n');
}

export interface Compaction {
  history: ChatMessage[];
  summary: string;
  usage: Usage;
}

/**
 * When the verbatim history grows past COMPACT_AT_TURNS turns, asks the helper model to fold the oldest
 * turns into the rolling summary and keeps the most recent KEEP_TURNS. Returns null when nothing to do.
 */
export async function compactHistory(
  history: ChatMessage[],
  summary: string,
  helper: { provider: TextProvider; model: string },
  signal?: AbortSignal,
): Promise<Compaction | null> {
  const starts = history.flatMap((m, i) => (isTurnStart(m) ? [i] : []));
  if (starts.length <= COMPACT_AT_TURNS) return null;
  const cut = starts[starts.length - KEEP_TURNS]!;
  const old = history.slice(0, cut);
  const result = await complete(helper.provider, {
    model: helper.model,
    maxTokens: 1200,
    effort: 'low',
    signal,
    system: [
      {
        text: 'You keep the running summary of a tabletop RPG session for the Dungeon Master. Write a compact factual summary in at most 12 short bullet points: what happened, decisions each character made, NPC attitudes, promises, unresolved threads, and secrets already revealed. No preamble.',
      },
    ],
    messages: [textMessage('user', `${summary.trim() ? `Summary so far:\n${summary.trim()}\n\n` : ''}New events to fold in:\n${transcript(old)}\n\nWrite the updated summary.`)],
  });
  const text = result.text.trim();
  if (!text) return null;
  return { history: history.slice(cut), summary: text, usage: result.usage };
}
