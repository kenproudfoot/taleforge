export interface SpeechUnit {
  /** Character range in the source text (used to highlight the sentence being read). */
  start: number;
  end: number;
  /** What to say: markers and markdown removed. */
  text: string;
  /** NPC name for «Name: line» speech, or null for the narrator. */
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

/**
 * Splits DM text into units to speak: narrator sentences and «Name: line» NPC lines.
 * While the text is still streaming (`final` false) only complete units are returned, and they never
 * change as more text arrives, so a caller can speak unit N as soon as it appears.
 */
export function speechUnits(text: string, final: boolean): SpeechUnit[] {
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
    const open = text.indexOf('«', pos);
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
