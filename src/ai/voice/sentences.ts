export interface SpeechUnit {
  /** Character range in the source text (used to highlight the sentence being read). */
  start: number;
  end: number;
  /** What to say: markers and markdown removed. */
  text: string;
  /** NPC name for «Name: line» speech (or a guessed speaker for a “quoted” line), or null for the narrator. */
  speaker: string | null;
}

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'sr', 'jr', 'vs', 'etc', 'prof', 'capt', 'sgt', 'lt', 'col', 'gen', 'mt', 'no']);
const SENTENCE_END = /[.!?…]+["'”’)\]]*/g;

/** Removes things a voice should not read: markdown emphasis, headings, list bullets, stray markers. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAbbreviation(text: string, dotIndex: number): boolean {
  const before = /([A-Za-z]+)$/.exec(text.slice(Math.max(0, dotIndex - 12), dotIndex))?.[1] ?? '';
  if (!before) return /\d$/.test(text.slice(0, dotIndex)) && /^\d/.test(text.slice(dotIndex + 1));
  return ABBREVIATIONS.has(before.toLowerCase()) || (before.length === 1 && before === before.toUpperCase());
}

/** Words that name a person, for guessing who says a "quoted" line. */
const PERSON_WORD =
  /^(?:men|women|boy|girl|kid|child|chief|captain|guard|bartender|barkeep|barmaid|newsboy|clerk|priest|priestess|merchant|stranger|figure|officer|sergeant|detective|cop|driver|doctor|nurse|elder|innkeeper|sailor|soldier|knight|king|queen|lady|lord|witch|wizard|mage|dwarf|elf|goblin|orc|thief|beggar|waiter|waitress|owner|landlord|boss|thug|reporter|janitor|widow|monk|hermit|ghost|creature|bandit|hunter|farmer|mayor|judge|vendor|minstrel|bard|servant|butler|maid|cook|scholar|librarian|warden|jailer|sentry|prisoner|youth|crone|hag|giant|troll|spirit|teen|veteran|sheriff|deputy|bouncer|dockhand|foreman|vicar|abbot|nun|squire|herald|healer|sage|oracle|seer)$|(?:man|woman|keeper|monger|smith|master|maker|ster)$/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The first person named in a sentence (its subject, usually): a known name, or "the <person word>". */
function firstPerson(sentence: string, names: string[]): string | null {
  let best: { at: number; who: string } | null = null;
  const lower = sentence.toLowerCase();
  for (const full of names) {
    for (const name of new Set([full, full.split(/\s+/)[0]!])) {
      if (name.length < 2) continue;
      const m = new RegExp(`(^|[^\\p{L}])${escapeRegExp(name.toLowerCase())}(?![\\p{L}])`, 'u').exec(lower);
      if (m && (!best || m.index < best.at)) best = { at: m.index, who: full };
    }
  }
  const words = [...lower.matchAll(/[\p{L}'’-]+/gu)];
  for (let i = 0; i < words.length; i++) {
    if (best && words[i]!.index >= best.at) break;
    if (!/^(?:the|a|an)$/.test(words[i]![0])) continue;
    for (let j = i + 1; j <= i + 3 && j < words.length; j++) {
      const word = words[j]![0].replace(/['’]s$/, '');
      if (PERSON_WORD.test(word)) return `the ${words.slice(i + 1, j + 1).map((w) => w[0].replace(/['’]s$/, '')).join(' ')}`;
    }
  }
  return best?.who ?? null;
}

/**
 * Guesses who says a quoted line from the text before it in the same paragraph: the subject of the
 * nearest sentence that names someone ("The bartender nods, then leans in. “…”" → the bartender).
 * Lines nobody can be matched to share one voice that is not the narrator's.
 */
export function guessSpeaker(before: string, names: string[] = []): string {
  const paragraph = before
    .slice(before.lastIndexOf('\n\n') + 1)
    .replace(/[“"][^”"]*[”"]/g, ' ')
    .replace(/«[^»]*»/g, ' ');
  const sentences = paragraph.split(/(?<=[.!?…])\s+/);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const who = firstPerson(sentences[i]!, names);
    if (who) return who;
  }
  return 'someone';
}

/** Where the next spoken quotation starts: a curly “ or a straight " that opens (not one that closes). */
function nextQuote(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '“') return i;
    if (c === '"' && (i === 0 || /[\s([—–-]/.test(text[i - 1]!))) return i;
  }
  return -1;
}

/**
 * Splits DM text into units to speak: narrator sentences, «Name: line» NPC lines, and “quoted” lines of
 * three words or more (local models often skip the marker), whose speaker is guessed from the sentence
 * before them; `names` are the people in the game (party and characters) to look for.
 * While the text is still streaming (`final` false) only complete units are returned, and they never
 * change as more text arrives, so a caller can speak unit N as soon as it appears.
 */
export function speechUnits(text: string, final: boolean, names: string[] = []): SpeechUnit[] {
  const units: SpeechUnit[] = [];
  let pos = 0;
  const push = (start: number, end: number, speaker: string | null, spoken?: string) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    const say = cleanForSpeech(spoken ?? trimmed);
    if (say && /[\p{L}\p{N}]/u.test(say)) units.push({ start: start + lead, end: start + lead + trimmed.length, text: say, speaker });
  };

  while (pos < text.length) {
    const marker = text.indexOf('«', pos);
    const quote = nextQuote(text, pos);
    const open = marker < 0 ? quote : quote < 0 ? marker : Math.min(marker, quote);
    if (open === pos && quote === pos) {
      // Offset of the closing mark after the opening one, or -1 while it has not arrived.
      const close = text.slice(pos + 1).search(text[pos] === '“' ? /[”"]/ : /"/);
      const paragraph = text.indexOf('\n\n', pos);
      // An unclosed quote that runs into the next paragraph is read as narration up to the break.
      if (paragraph >= 0 && (close < 0 || pos + 1 + close > paragraph)) {
        push(pos, paragraph, null);
        pos = paragraph;
        continue;
      }
      if (close < 0) {
        if (final) push(pos, text.length, null);
        break;
      }
      const end = pos + 1 + close + 1;
      const inner = text.slice(pos + 1, end - 1);
      const words = inner.split(/\s+/).filter((w) => /\p{L}/u.test(w));
      // Three words or more, and not a Title Like A Sign: short labels and titles stay in the narration.
      const spoken = words.length >= 3 && !words.every((w) => /^[^\p{L}]*\p{Lu}/u.test(w));
      push(pos, end, spoken ? guessSpeaker(text.slice(0, pos), names) : null, spoken ? inner : undefined);
      pos = end;
      continue;
    }
    if (open === pos) {
      const close = text.indexOf('»', pos);
      if (close < 0) {
        if (final) push(pos, text.length, null);
        break;
      }
      const inner = text.slice(pos + 1, close);
      const colon = inner.indexOf(':');
      if (colon > 0 && colon <= 60) push(pos, close + 1, inner.slice(0, colon).trim(), inner.slice(colon + 1));
      else push(pos, close + 1, null, inner);
      pos = close + 1;
      continue;
    }
    const limit = open < 0 ? text.length : open;
    let end = -1;
    SENTENCE_END.lastIndex = pos;
    for (let m = SENTENCE_END.exec(text); m && m.index < limit; m = SENTENCE_END.exec(text)) {
      const stop = m.index + m[0].length;
      if (m[0][0] === '.' && m[0].length === 1 && isAbbreviation(text, m.index)) continue;
      // A sentence ends when followed by whitespace, by a speech marker, or by the end of finished text.
      const next = text[stop];
      if (next === undefined ? final : /\s/.test(next) || stop === limit) {
        end = Math.min(stop, limit);
        break;
      }
    }
    if (end < 0) {
      if (open >= 0) end = open;
      else if (final) end = text.length;
      else break;
    }
    push(pos, end, null);
    pos = end;
  }
  return units;
}
