import type { GameState } from '@/engine/types';
import { shortName } from '@/engine/names';

export type Segment = { type: 'narration'; text: string } | { type: 'speech'; speaker: string; text: string };

const SPEECH = /«\s*([^:«»]{1,60}?)\s*:\s*([^«»]*)»/g;

/** Splits DM text into narrator prose and «Name: line» NPC speech. Unclosed markers stay as narration. */
export function parseNarration(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(SPEECH)) {
    const before = text.slice(last, match.index);
    if (before.trim()) segments.push({ type: 'narration', text: before.trim() });
    const line = match[2]!.trim();
    if (line) segments.push({ type: 'speech', speaker: match[1]!.trim(), text: line });
    last = match.index + match[0].length;
  }
  const rest = text.slice(last);
  if (rest.trim()) segments.push({ type: 'narration', text: rest.trim() });
  return segments;
}

/** Text with the speech markers removed, for plain display or a single-voice read-aloud. */
export function plainNarration(text: string): string {
  return parseNarration(text)
    .map((s) => (s.type === 'speech' ? `${s.speaker} says: "${s.text}"` : s.text))
    .join(' ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Who the DM handed the spotlight to. Looks at the narrator's closing two sentences for a party member
 * addressed directly ("Lyra, what do you do?" / "What now, Brann?"), falling back to a name in the very
 * last sentence. Returns null when nobody (or the whole party) is addressed.
 */
export function addressedMember(text: string, state: GameState): string | null {
  const prose = parseNarration(text)
    .filter((s) => s.type === 'narration')
    .map((s) => s.text)
    .join(' ');
  const sentences = prose.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const tail = sentences.slice(-2).join(' ');
  const lastSentence = sentences[sentences.length - 1] ?? '';
  let best: { id: string; at: number } | null = null;
  let fallback: { id: string; at: number } | null = null;
  for (const m of state.party) {
    if (m.status !== 'ok') continue;
    const first = escapeRegExp(shortName(m.name));
    const name = `(?:${escapeRegExp(m.name)}|${first})`;
    const vocative = new RegExp(`(?:^|[.!?…]\\s+)${name}\\s*,|,\\s*${name}\\s*[.!?…]`, 'gi');
    for (const match of tail.matchAll(vocative)) {
      if (!best || match.index > best.at) best = { id: m.id, at: match.index };
    }
    const plain = new RegExp(`\\b${first}\\b`, 'i').exec(lastSentence);
    if (plain && (!fallback || plain.index > fallback.at)) fallback = { id: m.id, at: plain.index };
  }
  return (best ?? fallback)?.id ?? null;
}
