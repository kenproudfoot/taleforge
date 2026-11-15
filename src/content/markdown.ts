import { LineCounter, isNode, parseDocument } from 'yaml';
import type { Document } from 'yaml';

export interface FrontMatter {
  /** Parsed YAML front matter (unknown shape; validate with zod). */
  data: unknown;
  /** Markdown after the closing `---`. */
  body: string;
  /** 1-based line of the first body line in the original file. */
  bodyLine: number;
  /** Returns the 1-based file line of a front-matter path such as ["acts", 1, "minutes"]. */
  lineOf(path: ReadonlyArray<PropertyKey>): number | undefined;
  /** YAML syntax errors, with file line numbers. */
  errors: Array<{ line: number; message: string }>;
}

/** Splits a markdown file into YAML front matter and body. Returns null when there is no front matter. */
export function parseFrontMatter(text: string): FrontMatter | null {
  const src = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return null;
  const yamlText = lines.slice(1, end).join('\n');
  const lineCounter = new LineCounter();
  const doc: Document = parseDocument(yamlText, { lineCounter, prettyErrors: false });
  // Front matter starts on file line 2, so YAML line n is file line n + 1.
  const toFileLine = (offset: number) => lineCounter.linePos(offset).line + 1;
  return {
    data: doc.errors.length ? undefined : (doc.toJS() as unknown),
    body: lines.slice(end + 1).join('\n'),
    bodyLine: end + 2,
    lineOf(path) {
      for (let n = path.length; n >= 0; n--) {
        const node = n === 0 ? doc.contents : doc.getIn(path.slice(0, n) as unknown[], true);
        if (isNode(node) && node.range) return toFileLine(node.range[0]);
      }
      return undefined;
    },
    errors: doc.errors.map((e) => ({ line: toFileLine(e.pos[0]), message: e.message.split('\n')[0] ?? e.message })),
  };
}

export interface Section {
  heading: string;
  content: string;
  /** 1-based line of the heading within the text that was split. */
  line: number;
}

/** Splits markdown into sections at headings of exactly the given depth ("##" = 2). Fenced code is ignored. */
export function splitSections(markdown: string, depth: 2 | 3): Section[] {
  const prefix = '#'.repeat(depth) + ' ';
  const sections: Section[] = [];
  let current: { heading: string; line: number; buf: string[] } | null = null;
  let fenced = false;
  const lines = markdown.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && line.startsWith(prefix)) {
      if (current) sections.push({ heading: current.heading, content: current.buf.join('\n').trim(), line: current.line });
      current = { heading: line.slice(prefix.length).trim(), line: i + 1, buf: [] };
    } else if (current) {
      current.buf.push(line);
    }
  });
  const last = current as { heading: string; line: number; buf: string[] } | null;
  if (last) sections.push({ heading: last.heading, content: last.buf.join('\n').trim(), line: last.line });
  return sections;
}

/** Text before the first heading of the given depth. */
export function preamble(markdown: string, depth: 2 | 3): string {
  const prefix = '#'.repeat(depth) + ' ';
  const out: string[] = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith(prefix)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** Finds a `##` section by title (case-insensitive) and returns its content, or ''. */
export function sectionText(markdown: string, title: string): string {
  return splitSections(markdown, 2).find((s) => s.heading.toLowerCase() === title.toLowerCase())?.content ?? '';
}

/** Map of `### id` subsections inside a `##` section: id -> prose, with the heading's 1-based line in `markdown`. */
export function subsections(markdown: string, title: string): Map<string, { text: string; line: number }> {
  const map = new Map<string, { text: string; line: number }>();
  let inParent = false;
  let fenced = false;
  let current: { heading: string; line: number; buf: string[] } | null = null;
  const flush = () => {
    if (current) map.set(current.heading, { text: current.buf.join('\n').trim(), line: current.line });
    current = null;
  };
  markdown.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && line.startsWith('## ')) {
      flush();
      inParent = line.slice(3).trim().toLowerCase() === title.toLowerCase();
    } else if (!fenced && inParent && line.startsWith('### ')) {
      flush();
      current = { heading: line.slice(4).trim(), line: i + 1, buf: [] };
    } else if (current) {
      current.buf.push(line);
    }
  });
  flush();
  return map;
}
