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

/**
 * Where the DM's closing hand-off ("Eddie, do you climb or fight?") starts, so it can be set apart from the
 * narration on screen and in the voice. That is the last paragraph when the reply has several and it ends in a
 * question, otherwise the final question sentence. -1 when the reply does not end with a narrator question.
 */
export function handoffStart(text: string): number {
  const body = text.trimEnd();
  if (!/\?["'”’)]*$/.test(body) || body.endsWith('»')) return -1;
  const paragraph = body.lastIndexOf('\n\n');
  if (paragraph > 0) {
    const start = paragraph + 2 + (body.slice(paragraph + 2).length - body.slice(paragraph + 2).trimStart().length);
    const last = body.slice(start);
    // A short closing paragraph that is all narrator (no NPC line inside) is the hand-off.
    if (last.length <= 450 && !last.includes('«') && body.slice(0, paragraph).trim()) return start;
  }
  // One paragraph: the final sentence. Sentence ends inside «speech» markers do not count.
  let start = -1;
  let inSpeech = false;
  for (let i = 0; i < body.length - 1; i++) {
    const c = body[i]!;
    if (c === '«') inSpeech = true;
    else if (c === '»') inSpeech = false;
    else if (!inSpeech && /[.!?…]/.test(c) && /\s/.test(body[i + 1]!)) {
      let j = i + 1;
      while (j < body.length && /\s/.test(body[j]!)) j++;
      start = j;
    }
  }
  if (start <= 0 || start >= body.length) return -1;
  // Don't split a quoted line in two.
  const before = body.slice(0, start);
  if ((before.match(/«/g)?.length ?? 0) !== (before.match(/»/g)?.length ?? 0)) return -1;
  if ((before.match(/[“”"]/g)?.length ?? 0) % 2 === 1) return -1;
  return start;
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
